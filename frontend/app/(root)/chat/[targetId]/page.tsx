"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useChat } from "@/hooks/useChat";
import { usePeerConnection } from "@/hooks/usePeerConnection";
import { useDeviceName } from "@/hooks/useDeviceName";
import { useDevices } from "@/hooks/useDevices";
import { getPeerManager } from "@/lib/webrtc/peerManager";

export default function ChatPage() {
    const params = useParams();
    const router = useRouter();
    const targetId = params.targetId as string;

    const { name: localDeviceId } = useDeviceName();
    const { devices } = useDevices();
    const { connectedPeers } = usePeerConnection(localDeviceId);
    const { messages, sendMessage, sendFile } = useChat(localDeviceId);

    const [isMounted, setIsMounted] = useState(false);

    // Prevent hydration mismatch on client-specific WebRTC logic
    useEffect(() => {
        setIsMounted(true);

        // Cleanup connection when cleanly unmounting (e.g., navigating to home)
        return () => {
            getPeerManager().cleanup(targetId);
        };
    }, [targetId]);

    // Ensure we are actually connected to this peer, else boot back to home
    useEffect(() => {
        if (!isMounted) return;

        // If the peer disconnects or we load this page without a connection
        if (!connectedPeers.includes(targetId)) {
            console.warn(`Local peer is not connected to ${targetId}, redirecting...`);
            router.replace("/");
        }
    }, [isMounted, connectedPeers, targetId, router]);

    if (!isMounted) return null;

    // Display Name mapping
    const targetDevice = devices.find(d => d.id === targetId);
    const targetName = targetDevice ? targetDevice.name : targetId;

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">
            <ChatWindow
                targetId={targetId}
                targetName={targetName}
                localDeviceId={localDeviceId}
                messages={messages}
                onSendMessage={(text) => sendMessage(targetId, text)}
                onSendFile={(file) => sendFile(targetId, file)}
                onClose={() => router.push("/")}
            />
        </div>
    );
}
