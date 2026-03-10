"use client";

import { useState, useEffect } from "react";
import { getWebSocket, WebSocketMessage } from "@/lib/websocket";
import { getPeerManager } from "@/lib/webrtc/peerManager";

export interface IncomingConnectionRequest {
    senderId: string;
}

export function usePeerConnection(localDeviceId: string | null) {
    const [incomingRequest, setIncomingRequest] = useState<IncomingConnectionRequest | null>(null);
    const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
    const [pendingRequests, setPendingRequests] = useState<string[]>([]);

    // Listen for WebSocket WebRTC signaling messages
    useEffect(() => {
        const ws = getWebSocket();
        const peerManager = getPeerManager();

        const unsubscribe = ws.addMessageHandler(async (message: WebSocketMessage) => {
            if (!("sender" in message)) return; // Ignore non-WebRTC incoming messages from backend relay
            const senderId = message.sender;

            switch (message.type) {
                case "connection-request":
                    setIncomingRequest({ senderId });
                    break;
                case "connection-accept":
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
                case "connection-reject": // Assuming we add this message type
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
            type: "connection-request",
            target: targetId,
        });
    };

    const acceptConnectionRequest = async () => {
        if (!incomingRequest) return;
        const senderId = incomingRequest.senderId;

        getWebSocket().send({
            type: "connection-accept",
            target: senderId,
        });

        setIncomingRequest(null);
    };

    const rejectConnectionRequest = () => {
        if (!incomingRequest) return;
        const senderId = incomingRequest.senderId;

        getWebSocket().send({
            type: "connection-reject",
            target: senderId,
        } as any);

        setIncomingRequest(null);
    };

    return {
        incomingRequest,
        connectedPeers,
        pendingRequests,
        sendConnectionRequest,
        acceptConnectionRequest,
        rejectConnectionRequest,
    };
}
