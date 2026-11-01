import { WSMessage } from '@/types/messages';

const SESSION_STORAGE_KEY = "quickdrop_device_session";
const RECONNECT_DELAY_MS = 2500;
// The server pings every 30 seconds, so silence beyond this means a dead socket.
const SILENT_SOCKET_LIMIT_MS = 45000;
const REPLACED_CLOSE_CODE = 4001;

interface DeviceSession {
  deviceId: string;
  secret: string;
}

// sessionStorage belongs to this tab, so a reload or reconnect keeps the same
// identity without other tabs on this device sharing it.
function loadSession(): DeviceSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DeviceSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: DeviceSession) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Without storage, this tab just gets a new identity when it reconnects.
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export class SignalingClient {
  private ws: WebSocket | null = null;
  public wsConnected: boolean = false;
  private wsReconnectTimeout: NodeJS.Timeout | null = null;
  private lastMessageAt: number = 0;
  private listening: boolean = false;

  private wsUrl: string = '';
  public myDeviceName: string = '';
  public myDeviceType: string = '';

  constructor(
    private onStatusChange: (connected: boolean) => void,
    private onMessage: (msg: WSMessage) => void,
    private onReconnectNeeded: () => void
  ) {}

  public connect(url: string, name: string, type: string) {
    this.wsUrl = url;
    this.myDeviceName = name;
    this.myDeviceType = type;
    this.addLifecycleListeners();
    this.connectWs();
  }

  public updateInfo(name: string, type: string) {
    this.myDeviceName = name;
    this.myDeviceType = type;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: "register", device_name: name, device_type: type });
    }
  }

  public send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private connectWs() {
    if (!this.wsUrl) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

    if (this.wsReconnectTimeout) { clearTimeout(this.wsReconnectTimeout); this.wsReconnectTimeout = null; }

    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.wsConnected = true;
      this.lastMessageAt = Date.now();
      const session = loadSession();
      this.send({
        type: "register",
        device_name: this.myDeviceName,
        device_type: this.myDeviceType,
        resume_device_id: session?.deviceId,
        resume_secret: session?.secret,
      });
      this.onStatusChange(true);
    };

    ws.onmessage = (event) => {
      this.lastMessageAt = Date.now();
      const msg = JSON.parse(event.data);
      if (msg.type === 'ping') {
        this.send({ type: 'pong' });
        return;
      }
      if (msg.type === 'welcome' && msg.session_secret) {
        saveSession({ deviceId: msg.device_id, secret: msg.session_secret });
      }
      this.onMessage(msg);
    };

    ws.onclose = (event) => {
      // Another tab holding a copy of this session took it over, such as a
      // duplicated tab. This one continues with a new identity.
      if (event.code === REPLACED_CLOSE_CODE) clearSession();
      this.handleSocketClosed();
    };

    ws.onerror = (e) => console.warn("[WS] Connection error (will auto-reconnect):", e);
  }

  private handleSocketClosed() {
    this.onReconnectNeeded();
    this.ws = null;
    this.wsConnected = false;
    this.onStatusChange(false);
    this.wsReconnectTimeout = setTimeout(() => this.connectWs(), RECONNECT_DELAY_MS);
  }

  // A phone returning from the background can hold a socket that looks open
  // but is dead, so it gets replaced instead of waiting for it to time out.
  private reconnectIfStale = () => {
    if (document.visibilityState === "hidden") return;

    if (this.ws?.readyState === WebSocket.OPEN && Date.now() - this.lastMessageAt > SILENT_SOCKET_LIMIT_MS) {
      const stale = this.ws;
      stale.onopen = stale.onmessage = stale.onclose = stale.onerror = null;
      stale.close();
      this.handleSocketClosed();
    }
    this.connectWs();
  };

  private handlePageHide = (event: PageTransitionEvent) => {
    // Tells peers right away when the page is really closing. A page kept in
    // the back/forward cache may return, so it keeps its session.
    if (!event.persisted) this.send({ type: "leave" });
  };

  private addLifecycleListeners() {
    if (this.listening || typeof window === "undefined") return;
    this.listening = true;
    document.addEventListener("visibilitychange", this.reconnectIfStale);
    window.addEventListener("online", this.reconnectIfStale);
    window.addEventListener("pagehide", this.handlePageHide);
  }

  public destroy() {
    if (this.wsReconnectTimeout) clearTimeout(this.wsReconnectTimeout);
    if (this.listening) {
      this.listening = false;
      document.removeEventListener("visibilitychange", this.reconnectIfStale);
      window.removeEventListener("online", this.reconnectIfStale);
      window.removeEventListener("pagehide", this.handlePageHide);
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected = false;
  }
}
