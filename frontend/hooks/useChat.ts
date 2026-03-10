"use client";

import { useState, useEffect, useCallback } from "react";
import { getPeerManager } from "@/lib/webrtc/peerManager";

export interface ChatMessage {
    id: string;
    sender: string;
    text: string;
    timestamp: number;
}

export function useChat(localDeviceId: string | null) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    useEffect(() => {
        const peerManager = getPeerManager();

        const unsubscribe = peerManager.onMessage((targetId, messageRaw) => {
            try {
                const data = JSON.parse(messageRaw);
                if (data.type === "chat-message") {
                    const newMsg: ChatMessage = {
                        id: crypto.randomUUID(), // Local ID for rendering react keys cleanly
                        sender: data.sender || targetId,
                        text: data.message,
                        timestamp: data.timestamp || Date.now(),
                    };
                    setMessages((prev) => [...prev, newMsg]);
                }
            } catch (error) {
                console.error("Failed to parse incoming data channel message:", error);
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const sendMessage = useCallback((targetId: string, text: string) => {
        if (!localDeviceId) {
            console.error("Cannot send message: Local device ID is unknown.");
            return false;
        }

        const payload = {
            type: "chat-message",
            message: text,
            sender: localDeviceId,
            timestamp: Date.now(),
        };

        const success = getPeerManager().sendData(targetId, JSON.stringify(payload));

        if (success) {
            // Optimistically append the message to our own local state
            const sentMsg: ChatMessage = {
                id: crypto.randomUUID(),
                sender: localDeviceId,
                text,
                timestamp: payload.timestamp,
            };
            setMessages((prev) => [...prev, sentMsg]);
        }

        return success;
    }, [localDeviceId]);

    return {
        messages,
        sendMessage,
    };
}
