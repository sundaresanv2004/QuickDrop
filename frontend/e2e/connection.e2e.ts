import { Browser, BrowserContext, chromium, expect, Page, test, WebSocketRoute } from "@playwright/test"

const BASE_URL = "http://localhost:3001"

interface Device {
  context: BrowserContext
  page: Page
  name: string
  socket: () => WebSocketRoute
  sentTypes: string[]
  holdIncoming: (...types: string[]) => void
  dropOutgoing: (type: string) => void
  release: () => void
}

let counter = 0

// Names are unique so a test can never send a request to a real nearby device.
async function createDevice(browser: Browser, label: string): Promise<Device> {
  const name = `E2E ${label} ${Date.now().toString(36)}${counter++}`
  const context = await browser.newContext({ baseURL: BASE_URL })
  const page = await context.newPage()

  let socket: WebSocketRoute | undefined
  const heldTypes = new Set<string>()
  const dropped = new Set<string>()
  const held: string[] = []
  const sentTypes: string[] = []

  await page.routeWebSocket(/\/ws\/connect/, (route) => {
    socket = route
    const server = route.connectToServer()
    route.onMessage((message) => {
      const type = JSON.parse(String(message)).type
      sentTypes.push(type)
      if (!dropped.has(type)) server.send(message)
    })
    server.onMessage((message) => {
      if (heldTypes.has(JSON.parse(String(message)).type)) held.push(String(message))
      else route.send(message)
    })
  })
  await page.addInitScript((deviceName) => {
    localStorage.setItem("quickdrop_device_name", deviceName)

    // Lets a test simulate a network loss, which can't be forced on localhost.
    const instances: RTCPeerConnection[] = []
    const fakeStates = new WeakMap<RTCPeerConnection, RTCPeerConnectionState>()
    const descriptor = Object.getOwnPropertyDescriptor(RTCPeerConnection.prototype, "connectionState")!
    Object.defineProperty(RTCPeerConnection.prototype, "connectionState", {
      get() {
        return fakeStates.get(this) ?? descriptor.get!.call(this)
      },
    })
    const Original = window.RTCPeerConnection
    window.RTCPeerConnection = new Proxy(Original, {
      construct(target, args) {
        const pc = new target(...(args as [RTCConfiguration]))
        instances.push(pc)
        return pc
      },
    })
    const scope = window as unknown as { __setConnectionState: (state: RTCPeerConnectionState | null) => void }
    scope.__setConnectionState = (state) => {
      const pc = instances[instances.length - 1]
      if (state) fakeStates.set(pc, state)
      else fakeStates.delete(pc)
      pc.onconnectionstatechange?.(new Event("connectionstatechange"))
    }
  }, name)

  await page.goto("/")
  await expect(page.getByText(`${name} (You)`)).toBeVisible()

  return {
    context,
    page,
    name,
    socket: () => socket!,
    sentTypes,
    holdIncoming: (...types) => { types.forEach((type) => heldTypes.add(type)) },
    dropOutgoing: (type) => { dropped.add(type) },
    release: () => {
      heldTypes.clear()
      for (const message of held.splice(0)) socket!.send(message)
    },
  }
}

async function connect(requester: Device, responder: Device) {
  await requester.page.getByText(responder.name, { exact: true }).click()
  await responder.page.getByRole("button", { name: "Accept" }).click()
  await expectLive(requester)
  await expectLive(responder)
}

async function expectLive(device: Device) {
  await expect(device.page.getByPlaceholder("Type a message...")).toBeEnabled({ timeout: 20000 })
}

async function expectMessagesFlow(from: Device, to: Device, text: string) {
  const input = from.page.getByPlaceholder("Type a message...")
  await input.fill(text)
  await input.press("Enter")
  await expect(to.page.getByText(text)).toBeVisible()
}

function deviceIdFromUrl(page: Page) {
  return page.url().split("/chat/")[1]
}

async function setConnectionState(device: Device, state: RTCPeerConnectionState | null) {
  await device.page.evaluate((value) => {
    (window as unknown as { __setConnectionState: (state: RTCPeerConnectionState | null) => void }).__setConnectionState(value)
  }, state)
}

test.describe("connection reliability", () => {
  test.setTimeout(90000)

  let a: Device
  let b: Device
  let partnerBrowser: Browser

  // B is always Chromium. Two WebKit peers can't connect in Playwright's build even
  // without QuickDrop, because neither side resolves the other's mDNS address.
  test.beforeEach(async ({ browser }) => {
    partnerBrowser = await chromium.launch()
    a = await createDevice(browser, "A")
    b = await createDevice(partnerBrowser, "B")
    await expect(a.page.getByText(b.name, { exact: true })).toBeVisible()
    await expect(b.page.getByText(a.name, { exact: true })).toBeVisible()
  })

  test.afterEach(async () => {
    await a.context.close()
    await partnerBrowser.close()
  })

  test("connects when both devices request each other at once", async () => {
    a.holdIncoming("connect_request", "peer_updated")
    b.holdIncoming("connect_request", "peer_updated")

    await a.page.getByText(b.name, { exact: true }).click()
    await b.page.getByText(a.name, { exact: true }).click()
    await expect.poll(() => a.sentTypes.includes("connect_request")).toBe(true)
    await expect.poll(() => b.sentTypes.includes("connect_request")).toBe(true)
    await a.page.waitForTimeout(300)

    a.release()
    b.release()

    await expectLive(a)
    await expectLive(b)
    await expectMessagesFlow(a, b, "after simultaneous requests")
    await expectMessagesFlow(b, a, "reply after simultaneous requests")

    // Exactly one device made an offer.
    const offers = [a, b].map((device) => device.sentTypes.filter((type) => type === "sdp_offer").length)
    expect(offers.sort()).toEqual([0, 1])
  })

  test("a signaling drop doesn't end a working session or change identity", async () => {
    await connect(a, b)
    const bIdSeenByA = deviceIdFromUrl(a.page)

    await b.socket().close()
    await expect.poll(() => b.sentTypes.filter((type) => type === "register").length, { timeout: 10000 }).toBe(2)

    await expectMessagesFlow(a, b, "during a signaling drop")
    await expectMessagesFlow(b, a, "reply during a signaling drop")
    await expect(a.page.getByText("Connection lost")).toHaveCount(0)
    await expect(b.page.getByText("Connection lost")).toHaveCount(0)

    // The other device still knows it by the same ID.
    const session = await b.page.evaluate(() => JSON.parse(sessionStorage.getItem("quickdrop_device_session")!))
    expect(session.deviceId).toBe(bIdSeenByA)
  })

  test("recovers from a network loss with an ICE restart", async () => {
    await connect(a, b)
    const offersBefore = a.sentTypes.filter((type) => type === "sdp_offer").length +
      b.sentTypes.filter((type) => type === "sdp_offer").length
    expect(offersBefore).toBe(1)

    // A requested the connection, so A is the only device that restarts it.
    await setConnectionState(a, "failed")
    await expect(a.page.getByText("Reconnecting…")).toBeVisible()
    await expect(a.page.getByPlaceholder("Type a message...")).toBeDisabled()
    await expect.poll(() => a.sentTypes.filter((type) => type === "sdp_offer").length).toBe(2)
    await expect.poll(() => b.sentTypes.filter((type) => type === "sdp_answer").length).toBe(2)

    await setConnectionState(a, null)
    await expect(a.page.getByText("Reconnecting…")).toHaveCount(0)
    await expectLive(a)
    await expectMessagesFlow(a, b, "after an ICE restart")
    await expectMessagesFlow(b, a, "reply after an ICE restart")

    const log = await a.page.evaluate(() => JSON.parse(localStorage.getItem("quickdrop_diag_connection")!))
    expect(log.iceRestarts).toBe(1)
  })

  test("the responder waits for the offerer instead of restarting", async () => {
    await connect(b, a)
    await setConnectionState(a, "failed")
    await expect(a.page.getByText("Reconnecting…")).toBeVisible()
    await a.page.waitForTimeout(500)
    expect(a.sentTypes.filter((type) => type === "sdp_offer")).toEqual([])

    await setConnectionState(a, null)
    await expect(a.page.getByText("Reconnecting…")).toHaveCount(0)
    await expectMessagesFlow(a, b, "responder recovered")
  })

  test("explains the problem when a connection can't be made", async () => {
    b.dropOutgoing("sdp_answer")

    await a.page.getByText(b.name, { exact: true }).click()
    await b.page.getByRole("button", { name: "Accept" }).click()

    await expect(a.page.getByText("Couldn't connect.")).toBeVisible({ timeout: 40000 })
    await expect(a.page).toHaveURL(`${BASE_URL}/`, { timeout: 10000 })

    // The device returns to discovery and can try again.
    await expect(a.page.getByText(`${a.name} (You)`)).toBeVisible()
  })

  test("a device that loses signaling stays visible to others", async () => {
    await a.socket().close()
    await b.page.waitForTimeout(1000)
    await expect(b.page.getByText(a.name, { exact: true })).toBeVisible()
  })
})

// Runs without the WebSocket proxy, which can lose a page's final message.
test("reloading the page tells other devices right away", async ({ browser }) => {
  const watcherBrowser = await chromium.launch()
  const leaverContext = await browser.newContext({ baseURL: BASE_URL })
  const watcherContext = await watcherBrowser.newContext({ baseURL: BASE_URL })

  try {
    const leaver = await leaverContext.newPage()
    const watcher = await watcherContext.newPage()
    const frames: string[] = []
    watcher.on("websocket", (socket) => socket.on("framereceived", (frame) => frames.push(String(frame.payload))))

    await watcher.goto("/")
    await leaver.goto("/")
    await expect
      .poll(() => leaver.evaluate(() => sessionStorage.getItem("quickdrop_device_session")))
      .not.toBeNull()
    const { deviceId } = await leaver.evaluate(() => JSON.parse(sessionStorage.getItem("quickdrop_device_session")!))

    const started = Date.now()
    await leaver.goto("/health")
    await expect
      .poll(() => frames.some((frame) => frame.includes('"peer_left"') && frame.includes(deviceId)), { timeout: 5000 })
      .toBe(true)
    console.log(`peer_left arrived after ${Date.now() - started} ms`)

    // The server removed that session, so the reloaded page got a new identity.
    await expect
      .poll(() => leaver.evaluate(() => JSON.parse(sessionStorage.getItem("quickdrop_device_session") ?? "{}").deviceId))
      .not.toBe(deviceId)
  } finally {
    await leaverContext.close()
    await watcherBrowser.close()
  }
})
