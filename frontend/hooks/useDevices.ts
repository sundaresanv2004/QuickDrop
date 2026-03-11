"use client";

import { useState, useEffect } from "react";
import { getWebSocket, WebSocketMessage } from "@/lib/websocket";
import { useDeviceName } from "./useDeviceName";

export interface RemoteDevice {
    id: string;
    name: string;
}

export interface PublicChat {
    id: string;
    admin_name: string;
    participant_count: number;
}

export function useDevices() {
    const [devices, setDevices] = useState<RemoteDevice[]>([]);
    const [publicChats, setPublicChats] = useState<PublicChat[]>([]);
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
                setPublicChats(message.public_chats || []);
                setIsConnected(true);
            }
        });

        return () => {
            unsubscribe();
            // We NO LONGER disconnect here, so the singleton WebSocket survives 
            // Next.js route transitions from Home -> ChatPage.
            setIsConnected(false);
        };
    }, [loaded, name]); // Connect using latest name upon load

    // Send name changes dynamically without reconnecting
    useEffect(() => {
        if (loaded && isConnected) {
            getWebSocket().send({ type: "name_change", name });
        }
    }, [name, loaded, isConnected]);

    return { devices, publicChats, isConnected };
}
