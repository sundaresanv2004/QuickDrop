import { useState, useEffect, useRef } from 'react';
import { WSMessage } from '@/types/messages';
import { getDeviceName } from '@/lib/device';

export function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({
        type: "register",
        device_name: getDeviceName()
      }));
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as WSMessage;
        setLastMessage(parsed);
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = (event) => {
      console.error("WS Error", event);
    };

    return () => {
      ws.close();
    };
  }, [url]);

  const sendMessage = (msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  return { isConnected, lastMessage, sendMessage };
}
