import { WSMessage } from '@/types/messages';

export class SignalingClient {
  private ws: WebSocket | null = null;
  public wsConnected: boolean = false;
  private wsReconnectTimeout: NodeJS.Timeout | null = null;
  
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
    
    this.ws = new WebSocket(this.wsUrl);
    
    this.ws.onopen = () => {
      this.wsConnected = true;
      this.onStatusChange(true);
      if (this.wsReconnectTimeout) { clearTimeout(this.wsReconnectTimeout); this.wsReconnectTimeout = null; }
      this.send({ type: "register", device_name: this.myDeviceName, device_type: this.myDeviceType });
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'ping') {
        this.send({ type: 'pong' });
        return;
      }
      this.onMessage(msg);
    };

    this.ws.onclose = () => {
      this.onReconnectNeeded();
      this.ws = null;
      this.wsConnected = false;
      this.onStatusChange(false);
      this.wsReconnectTimeout = setTimeout(() => this.connectWs(), 2500);
    };

    this.ws.onerror = (e) => console.warn("[WS] Connection error (will auto-reconnect):", e);
  }

  public destroy() {
    if (this.wsReconnectTimeout) clearTimeout(this.wsReconnectTimeout);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected = false;
  }
}
