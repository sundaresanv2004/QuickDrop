import { useState, useEffect, useRef, useCallback } from 'react';
import { WSMessage } from '@/types/messages';

export function useWebSocket(url: string, deviceName: string, deviceType: string) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectRef = useRef<(() => void) | undefined>(undefined);

  const connect = useCallback(() => {
    // Wait until URL is populated
    if (!url) return;

    // Prevent multiple connection attempts
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Clear any pending reconnects once successful
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      ws.send(JSON.stringify({
        type: "register",
        device_name: deviceName,
        device_type: deviceType
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
      wsRef.current = null;
      // Auto-reconnect after 2.5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log("Attempting WebSocket Reconnection...");
        connectRef.current?.();
      }, 2500);
    };

    ws.onerror = (event) => {
      console.error("WS Error", event);
    };
  }, [url]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        // Prevent onclose handle from triggering a reconnect when unmounting
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  // If the device name changes while connected, resend the register message
  const prevDeviceNameRef = useRef(deviceName);
  useEffect(() => {
    if (prevDeviceNameRef.current !== deviceName) {
      prevDeviceNameRef.current = deviceName;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "register",
          device_name: deviceName,
          device_type: deviceType
        }));
      }
    }
  }, [deviceName]);

  const sendMessage = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return ({ 
    isConnected, 
    lastMessage, 
    sendMessage 
  });
}
