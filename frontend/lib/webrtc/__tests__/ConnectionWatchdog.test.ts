import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  CONNECT_TIMEOUT_MS,
  ConnectionWatchdog,
  DISCONNECT_GRACE_MS,
  RECONNECT_TIMEOUT_MS,
  RESTART_RETRY_MS,
} from "../ConnectionWatchdog"

function createWatchdog() {
  const handlers = {
    onConnectFailed: vi.fn(),
    onReconnecting: vi.fn(),
    onRestartIce: vi.fn(),
    onRecovered: vi.fn(),
    onConnectionLost: vi.fn(),
  }
  return { watchdog: new ConnectionWatchdog(handlers), handlers }
}

function connectedWatchdog() {
  const created = createWatchdog()
  created.watchdog.startConnecting()
  created.watchdog.channelsReady()
  return created
}

describe("ConnectionWatchdog", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("reports a failure when connecting takes too long", () => {
    const { watchdog, handlers } = createWatchdog()
    watchdog.startConnecting()

    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 1)
    expect(handlers.onConnectFailed).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(handlers.onConnectFailed).toHaveBeenCalledOnce()
  })

  it("reports a failure as soon as a new connection fails", () => {
    const { watchdog, handlers } = createWatchdog()
    watchdog.startConnecting()
    watchdog.handleState("failed")
    expect(handlers.onConnectFailed).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS)
    expect(handlers.onConnectFailed).toHaveBeenCalledOnce()
  })

  it("stops the connect timer once the channels are ready", () => {
    const { watchdog, handlers } = connectedWatchdog()
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS)
    expect(handlers.onConnectFailed).not.toHaveBeenCalled()
    expect(watchdog).toBeDefined()
  })

  it("lets a brief disconnect recover without restarting or losing the session", () => {
    const { watchdog, handlers } = connectedWatchdog()

    watchdog.handleState("disconnected")
    expect(handlers.onReconnecting).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(DISCONNECT_GRACE_MS - 1)
    watchdog.handleState("connected")
    expect(handlers.onRecovered).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(RECONNECT_TIMEOUT_MS)
    expect(handlers.onRestartIce).not.toHaveBeenCalled()
    expect(handlers.onConnectionLost).not.toHaveBeenCalled()
  })

  it("restarts after the grace period and keeps retrying", () => {
    const { watchdog, handlers } = connectedWatchdog()

    watchdog.handleState("disconnected")
    vi.advanceTimersByTime(DISCONNECT_GRACE_MS)
    expect(handlers.onRestartIce).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(RESTART_RETRY_MS)
    expect(handlers.onRestartIce).toHaveBeenCalledTimes(2)
  })

  it("restarts immediately on failed without doubling the retry timer", () => {
    const { watchdog, handlers } = connectedWatchdog()

    watchdog.handleState("failed")
    expect(handlers.onReconnecting).toHaveBeenCalledOnce()
    expect(handlers.onRestartIce).toHaveBeenCalledTimes(1)

    watchdog.handleState("failed")
    expect(handlers.onRestartIce).toHaveBeenCalledTimes(1)
  })

  it("moves from disconnected to failed without waiting out the grace period", () => {
    const { watchdog, handlers } = connectedWatchdog()

    watchdog.handleState("disconnected")
    watchdog.handleState("failed")
    expect(handlers.onReconnecting).toHaveBeenCalledOnce()
    expect(handlers.onRestartIce).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(DISCONNECT_GRACE_MS)
    expect(handlers.onRestartIce).toHaveBeenCalledTimes(1)
  })

  it("gives up when reconnecting takes too long", () => {
    const { watchdog, handlers } = connectedWatchdog()

    watchdog.handleState("disconnected")
    vi.advanceTimersByTime(RECONNECT_TIMEOUT_MS)
    expect(handlers.onConnectionLost).toHaveBeenCalledOnce()

    const restarts = handlers.onRestartIce.mock.calls.length
    vi.advanceTimersByTime(RECONNECT_TIMEOUT_MS)
    expect(handlers.onRestartIce).toHaveBeenCalledTimes(restarts)
  })

  it("retries a restart when signaling comes back", () => {
    const { watchdog, handlers } = connectedWatchdog()

    watchdog.signalingRestored()
    expect(handlers.onRestartIce).not.toHaveBeenCalled()

    watchdog.handleState("failed")
    watchdog.signalingRestored()
    expect(handlers.onRestartIce).toHaveBeenCalledTimes(2)
  })

  it("ignores state changes after being stopped", () => {
    const { watchdog, handlers } = connectedWatchdog()
    watchdog.stop()
    watchdog.handleState("failed")
    watchdog.handleState("disconnected")
    vi.advanceTimersByTime(RECONNECT_TIMEOUT_MS)
    expect(handlers.onReconnecting).not.toHaveBeenCalled()
    expect(handlers.onConnectionLost).not.toHaveBeenCalled()
  })
})
