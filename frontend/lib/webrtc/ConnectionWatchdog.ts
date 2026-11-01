export const CONNECT_TIMEOUT_MS = 30000;
export const DISCONNECT_GRACE_MS = 5000;
export const RESTART_RETRY_MS = 10000;
export const RECONNECT_TIMEOUT_MS = 30000;

export interface WatchdogHandlers {
  onConnectFailed: () => void;
  onReconnecting: () => void;
  onRestartIce: () => void;
  onRecovered: () => void;
  onConnectionLost: () => void;
}

type Phase = "idle" | "connecting" | "connected" | "reconnecting";

// Decides what a WebRTC connection state means. "disconnected" is often a brief
// network blip, so a working session gets time to recover before it's treated as lost.
export class ConnectionWatchdog {
  private phase: Phase = "idle";
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private handlers: WatchdogHandlers) {}

  public startConnecting() {
    this.stop();
    this.phase = "connecting";
    this.connectTimer = setTimeout(() => this.failConnecting(), CONNECT_TIMEOUT_MS);
  }

  public channelsReady() {
    this.stop();
    this.phase = "connected";
  }

  public handleState(state: string) {
    if (this.phase === "connecting") {
      if (state === "failed") this.failConnecting();
      return;
    }

    if (state === "connected") {
      if (this.phase === "reconnecting") {
        this.stop();
        this.phase = "connected";
        this.handlers.onRecovered();
      }
      return;
    }

    if (state === "disconnected" && this.phase === "connected") {
      this.beginReconnecting();
      this.graceTimer = setTimeout(() => this.startRestarting(), DISCONNECT_GRACE_MS);
    } else if (state === "failed" && (this.phase === "connected" || this.phase === "reconnecting")) {
      if (this.phase === "connected") this.beginReconnecting();
      this.startRestarting();
    }
  }

  // A restart offer sent while signaling was down never arrived, so try again now.
  public signalingRestored() {
    if (this.phase === "reconnecting" && this.retryTimer) this.handlers.onRestartIce();
  }

  public stop() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.graceTimer) clearTimeout(this.graceTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.connectTimer = this.graceTimer = this.retryTimer = this.deadlineTimer = null;
    this.phase = "idle";
  }

  private failConnecting() {
    this.stop();
    this.handlers.onConnectFailed();
  }

  private beginReconnecting() {
    this.phase = "reconnecting";
    this.handlers.onReconnecting();
    this.deadlineTimer = setTimeout(() => {
      this.stop();
      this.handlers.onConnectionLost();
    }, RECONNECT_TIMEOUT_MS);
  }

  private startRestarting() {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    if (this.retryTimer) return;
    this.handlers.onRestartIce();
    this.retryTimer = setInterval(() => this.handlers.onRestartIce(), RESTART_RETRY_MS);
  }
}
