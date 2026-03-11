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
    const { connectedPeers, isAdmin, chatMode, changeChatMode } = usePeerConnection(localDeviceId);
    const { messages, sendMessage, sendFile } = useChat(localDeviceId);

    const [isMounted, setIsMounted] = useState(false);

    // Prevent hydration mismatch on client-specific WebRTC logic
    useEffect(() => {
        setIsMounted(true);

        const peerManager = getPeerManager();

        // Listen for peer disconnection to gracefully revert home
        const unsub = peerManager.onPeerStateChange((id, state) => {
            if (id === targetId && (state === "disconnected" || state === "failed" || state === "closed")) {
                console.log(`Connection dropped with ${targetId}, reverting to home...`);
                router.replace("/");
            }
        });

        // Cleanup connection only locally to prevent React Strict Mode from spamming 'chat-leave'
        return () => {
            unsub();
            peerManager.cleanup(targetId);
        };
    }, [targetId, router]);

    if (!isMounted) return null;

    // Display Name mapping
    const targetDevice = devices.find(d => d.id === targetId);
    const targetName = targetDevice ? targetDevice.name : targetId;

    return (
        <div className="flex flex-col h-[100dvh] w-full absolute inset-0 z-50 bg-background/95 backdrop-blur-3xl lg:relative lg:h-[calc(100vh-8rem)] lg:bg-transparent lg:backdrop-blur-none lg:z-auto">
            <ChatWindow
                targetId={targetId}
                targetName={targetName}
                localDeviceId={localDeviceId}
                isAdmin={isAdmin}
                chatMode={chatMode}
                onChangeMode={changeChatMode}
                messages={messages}
                onSendMessage={(text) => sendMessage(targetId, text)}
                onSendFile={(file) => sendFile(targetId, file)}
                onClose={() => {
                    import("@/lib/websocket").then(({ getWebSocket }) => {
                        getWebSocket().send({ type: "chat-leave" } as any);
                    });
                    router.push("/");
                }}
            />
        </div>
    );
}
