"use client";

import { useState, useEffect } from "react";
import { getWebSocket, WebSocketMessage } from "@/lib/websocket";
import { useDeviceName } from "./useDeviceName";

export interface RemoteDevice {
    id: string;
    name: string;
}

export function useDevices() {
    const [devices, setDevices] = useState<RemoteDevice[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const { name, loaded } = useDeviceName();

    useEffect(() => {
        // Wait until local device name is loaded from storage
        if (!loaded) return;

        const ws = getWebSocket();

        // Connect to WS and send the join message with our device name
        ws.connect(name);
        // Mark optimistic connection start, actual state relies on messages
        setIsConnected(true);

        const unsubscribe = ws.addMessageHandler((message: WebSocketMessage) => {
            if (message.type === "device-list") {
                setDevices(message.devices);
                setIsConnected(true);
            }
        });

        return () => {
            unsubscribe();
            // Only disconnect if the component unmounts fully, 
            // but in Next.js dev mode strict mode causes unmount/remount.
            // Usually you'd keep it alive at the app level, but for this phase:
            ws.disconnect();
            setIsConnected(false);
        };
    }, [loaded]); // Only reconnect if 'loaded' changes (conceptually mounting)

    // Send name changes dynamically without reconnecting
    useEffect(() => {
        if (loaded && isConnected) {
            getWebSocket().send({ type: "name_change", name });
        }
    }, [name, loaded, isConnected]);

    return { devices, isConnected };
}
