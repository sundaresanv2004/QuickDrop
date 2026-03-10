// src/lib/websocket.ts

export type WebSocketMessage =
    | { type: "join"; name: string }
    | { type: "name_change"; name: string }
    | { type: "device-list"; devices: { id: string; name: string }[] };

type MessageHandler = (message: WebSocketMessage) => void;

export class WebSocketClient {
    private url: string;
    private ws: WebSocket | null = null;
    private messageHandlers: Set<MessageHandler> = new Set();
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private isConnecting = false;

    constructor(url: string) {
        this.url = url;
    }

    public connect(deviceName: string) {
        if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return;
        this.isConnecting = true;

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                this.isConnecting = false;
                // Send join message immediately upon connection
                this.send({ type: "join", name: deviceName });
                if (this.reconnectTimeout) {
                    clearTimeout(this.reconnectTimeout);
                    this.reconnectTimeout = null;
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as WebSocketMessage;
                    this.messageHandlers.forEach((handler) => handler(data));
                } catch (error) {
                    console.error("Failed to parse WebSocket message:", error);
                }
            };

            this.ws.onclose = () => {
                this.isConnecting = false;
                this.ws = null;
                // Basic reconnect logic
                this.reconnectTimeout = setTimeout(() => this.connect(deviceName), 3000);
            };

            this.ws.onerror = (error) => {
                console.error("WebSocket error:", error);
            };
        } catch (e) {
            this.isConnecting = false;
            this.reconnectTimeout = setTimeout(() => this.connect(deviceName), 3000);
        }
    }

    public disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    public send(message: WebSocketMessage) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    public addMessageHandler(handler: MessageHandler) {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }
}

// Create a singleton instance for the app
// Using a lazy getter so we don't access window/location during SSR
let wsInstance: WebSocketClient | null = null;

export function getWebSocket(): WebSocketClient {
    if (!wsInstance) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//localhost:8000/ws`;
        wsInstance = new WebSocketClient(host);
    }
    return wsInstance;
}
