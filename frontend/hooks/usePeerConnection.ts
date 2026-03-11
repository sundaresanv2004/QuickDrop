"use client";

import { useState, useEffect } from "react";
import { getWebSocket, WebSocketMessage } from "@/lib/websocket";
import { getPeerManager } from "@/lib/webrtc/peerManager";

export interface IncomingConnectionRequest {
    senderId: string;
    isPublicJoin?: boolean;
}

export function usePeerConnection(localDeviceId: string | null) {
    const [incomingRequest, setIncomingRequest] = useState<IncomingConnectionRequest | null>(null);
    const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
    const [pendingRequests, setPendingRequests] = useState<string[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [chatMode, setChatMode] = useState<"private" | "public">("private");

    // Listen for WebSocket WebRTC signaling messages
    useEffect(() => {
        const ws = getWebSocket();
        const peerManager = getPeerManager();

        const unsubscribe = ws.addMessageHandler(async (message: WebSocketMessage) => {
            if (message.type === "chat-update") {
                setActiveChatId(message.chat_id);
                if (message.chat_id) {
                    setPendingRequests([]);
                    setIncomingRequest(null);
                    // Identify the other participant
                    const target = message.participants.find(p => p !== localDeviceId);
                    setActiveTargetId(target || null);
                    setIsAdmin(message.admin_id === localDeviceId);
                    setChatMode(message.mode || "private");
                } else {
                    setActiveTargetId(null);
                    setIsAdmin(false);
                    setChatMode("private");
                }
                return;
            }

            if (message.type === "chat-mode-change") {
                setChatMode(message.mode);
                return;
            }

            if (!("sender" in message)) return; // Ignore non-WebRTC incoming messages from backend relay
            const senderId = message.sender as string;

            switch (message.type) {
                case "chat-request":
                    setIncomingRequest({ senderId, isPublicJoin: false });
                    break;
                case "public-chat-join":
                    setIncomingRequest({ senderId, isPublicJoin: true });
                    break;
                case "chat-accept":
                    // The other side accepted, start the initiator flow
                    await peerManager.createPeerConnection(senderId, true);
                    break;
                case "offer":
                    await peerManager.handleOffer(senderId, message.sdp);
                    break;
                case "answer":
                    await peerManager.handleAnswer(senderId, message.sdp);
                    setPendingRequests((prev) => prev.filter((id) => id !== senderId));
                    break;
                case "ice-candidate":
                    await peerManager.handleIceCandidate(senderId, message.candidate);
                    break;
                case "chat-reject":
                case "public-chat-reject":
                    setPendingRequests((prev) => prev.filter((id) => id !== senderId));
                    break;
            }
        });

        const unsubState = peerManager.onPeerStateChange((targetId, state) => {
            if (state === "connected") {
                setConnectedPeers((prev) => Array.from(new Set([...prev, targetId])));
                setPendingRequests((prev) => prev.filter((id) => id !== targetId));
            } else if (state === "disconnected" || state === "closed" || state === "failed") {
                setConnectedPeers((prev) => prev.filter((id) => id !== targetId));
                setPendingRequests((prev) => prev.filter((id) => id !== targetId));
            }
        });

        return () => {
            unsubscribe();
            unsubState();
        };
    }, []);

    const sendConnectionRequest = (targetId: string) => {
        setPendingRequests((prev) => [...prev, targetId]);
        getWebSocket().send({
            type: "chat-request",
            target: targetId,
        } as any);
    };

    const acceptConnectionRequest = async (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        if (!incomingRequest) return;
        const senderId = incomingRequest.senderId;

        if (incomingRequest.isPublicJoin) {
            getWebSocket().send({
                type: "public-chat-accept",
                target: senderId,
            } as any);
        } else {
            getWebSocket().send({
                type: "chat-accept",
                target: senderId,
            } as any);
        }

        setIncomingRequest(null);
    };

    const rejectConnectionRequest = (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        if (!incomingRequest) return;
        const senderId = incomingRequest.senderId;

        if (incomingRequest.isPublicJoin) {
            getWebSocket().send({
                type: "public-chat-reject",
                target: senderId,
            } as any);
        } else {
            getWebSocket().send({
                type: "chat-reject",
                target: senderId,
            } as any);
        }

        setIncomingRequest(null);
    };

    const joinPublicChat = (chatId: string) => {
        setPendingRequests((prev) => [...prev, chatId]); // Optimistic load
        getWebSocket().send({
            type: "public-chat-join",
            chat_id: chatId,
        } as any);
    };

    const changeChatMode = (mode: "private" | "public") => {
        getWebSocket().send({
            type: "chat-mode-change",
            mode,
        } as any);
    };

    return {
        incomingRequest,
        connectedPeers,
        pendingRequests,
        activeChatId,
        activeTargetId,
        isAdmin,
        chatMode,
        sendConnectionRequest,
        acceptConnectionRequest,
        rejectConnectionRequest,
        joinPublicChat,
        changeChatMode,
    };
}
