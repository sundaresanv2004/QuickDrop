"use client"

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getDeviceName } from '@/lib/device';
import { Peer, WSMessage, WelcomeMessage, PeerListMessage, PeerJoinedMessage, PeerLeftMessage } from '@/types/messages';

export type ConnectionStatus =
  | "idle"           // No active connection or request
  | "requesting"     // This device sent a connect_request, waiting for answer
  | "receiving"      // This device received a connect_request, showing modal
  | "connecting"     // Both accepted, signaling in progress (Phase 3)
  | "connected"      // DataChannels are open (Phase 4)
  | "rejected"       // The other device rejected our request
  | "disconnected"   // Connection was lost after being established

import { toast } from 'sonner';

interface WebRTCContextType {
  wsConnected: boolean;
  myDeviceId: string | null;
  myDeviceName: string;
  peers: Peer[];
  sendMessage: (msg: object) => void;

  // Handshake
  connectionStatus: ConnectionStatus;
  incomingRequest: { peerId: string; peerName: string } | null;
  targetPeerId: string | null;

  // Handshake Actions
  sendConnectRequest: (peerId: string) => void;
  cancelRequest: () => void;
  acceptRequest: () => void;
  rejectRequest: () => void;
  resetConnection: () => void;
}

const WebRTCContext = createContext<WebRTCContextType | null>(null);

export const useWebRTC = () => {
  const context = useContext(WebRTCContext);
  if (!context) throw new Error("useWebRTC must be used within a WebRTCProvider");
  return context;
};

export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  const processedMessagesRef = useRef<Set<any>>(new Set());
  useEffect(() => setMounted(true), []);

  const getWsUrl = () => {
    let envUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (envUrl && envUrl.trim() !== "") {
      if (envUrl.startsWith("http")) envUrl = envUrl.replace(/^http/, "ws");
      const base = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
      return base.endsWith('/ws/connect') ? base : `${base}/ws/connect`;
    }
    
    if (typeof window === "undefined") return "";
    
    const hostname = window.location.hostname;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${proto}//${hostname}:8001/ws/connect`;
    }
    
    return `${proto}//${window.location.host}/ws/connect`;
  };

  const WS_URL = mounted ? getWsUrl() : "";
  const { isConnected, lastMessage, sendMessage } = useWebSocket(WS_URL);
  const myDeviceName = mounted ? getDeviceName() : "Unknown Device";

  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [incomingRequest, setIncomingRequest] = useState<{ peerId: string; peerName: string } | null>(null);
  const [targetPeerId, setTargetPeerId] = useState<string | null>(null);

  const handleWelcome = useCallback((msg: WelcomeMessage) => {
    setMyDeviceId(msg.device_id);
  }, []);

  const handlePeerList = useCallback((msg: PeerListMessage) => {
    console.log("[DEBUG] handlePeerList", msg.peers.length, "peers");
    setPeers(msg.peers);
  }, []);

  const handlePeerJoined = useCallback((msg: PeerJoinedMessage) => {
    setPeers((prev) => {
      if (prev.find((p) => p.device_id === msg.device_id)) {
        return prev;
      }
      return [...prev, { device_id: msg.device_id, device_name: msg.device_name }];
    });
  }, []);

  const handlePeerLeft = useCallback((msg: PeerLeftMessage) => {
    setPeers((prev) => prev.filter((p) => p.device_id !== msg.device_id));
  }, []);

  const sendConnectRequest = useCallback((peerId: string) => {
    if (connectionStatus !== "idle") return;

    setTargetPeerId(peerId);
    setConnectionStatus("requesting");

    sendMessage({
      type: "connect_request",
      to: peerId
    });
  }, [connectionStatus, sendMessage]);

  const cancelRequest = useCallback(() => {
    if (connectionStatus !== "requesting" || !targetPeerId) return;

    sendMessage({
      type: "connect_cancel",
      to: targetPeerId
    });

    setConnectionStatus("idle");
    setTargetPeerId(null);
  }, [connectionStatus, targetPeerId, sendMessage]);

  const acceptRequest = useCallback(() => {
    if (connectionStatus !== "receiving" || !incomingRequest) return;

    setTargetPeerId(incomingRequest.peerId);
    setConnectionStatus("connecting");

    sendMessage({
      type: "connect_accept",
      to: incomingRequest.peerId
    });

    setIncomingRequest(null);
  }, [connectionStatus, incomingRequest, sendMessage]);

  const rejectRequest = useCallback(() => {
    if (connectionStatus !== "receiving" || !incomingRequest) return;

    sendMessage({
      type: "connect_reject",
      to: incomingRequest.peerId
    });

    setIncomingRequest(null);
    setConnectionStatus("idle");
    setTargetPeerId(null);
  }, [connectionStatus, incomingRequest, sendMessage]);

  const resetConnection = useCallback(() => {
    setConnectionStatus("idle");
    setIncomingRequest(null);
    setTargetPeerId(null);
    // TODO: also call resetConnection when peer_left matches targetPeerId
  }, []);

  // --- STEP 7 MESSAGE ROUTING ---
  useEffect(() => {
    if (!lastMessage || processedMessagesRef.current.has(lastMessage)) return;
    processedMessagesRef.current.add(lastMessage);

    // Keep the set from growing too large
    if (processedMessagesRef.current.size > 50) {
      const iter = processedMessagesRef.current.values();
      processedMessagesRef.current.delete(iter.next().value);
    }

    switch (lastMessage.type) {
      case "welcome":
        handleWelcome(lastMessage);
        break;
      case "peer_list":
        handlePeerList(lastMessage);
        break;
      case "peer_joined":
        handlePeerJoined(lastMessage);
        break;
      case "peer_left":
        console.log("[DEBUG] handlePeerLeft", lastMessage.device_id);
        handlePeerLeft(lastMessage);
        break;
      // These cases will be handled in Phase 2 and 3:
      case "connect_request":
        const requesterName = peers.find(p => p.device_id === lastMessage.from_id)?.device_name ?? "Unknown Device";
        setIncomingRequest({
          peerId: lastMessage.from_id,
          peerName: requesterName
        });
        setConnectionStatus("receiving");
        break;
      case "connect_cancel":
        if (connectionStatus === "receiving" && incomingRequest && incomingRequest.peerId === lastMessage.from_id) {
          toast.info(`Request from ${incomingRequest.peerName} was cancelled`);
          setIncomingRequest(null);
          setConnectionStatus("idle");
        }
        break;
      case "connect_accept":
        if (connectionStatus === "requesting") {
          toast.success("Connection request accepted!");
          setConnectionStatus("connecting");
        }
        break;
      case "connect_reject":
        if (connectionStatus === "requesting") {
          toast.error("Connection request declined");
          setConnectionStatus("rejected");
          setTargetPeerId(null);
          setTimeout(() => setConnectionStatus("idle"), 3000);
        }
        break;
      case "sdp_offer":
      case "sdp_answer":
      case "ice_candidate":
        break;
      default:
        console.warn("Unhandled WS message type:", (lastMessage as any).type);
    }
  }, [lastMessage, handleWelcome, handlePeerList, handlePeerJoined, handlePeerLeft, connectionStatus, incomingRequest, peers]);

  // Safety check: if peers explode, reset them once to prevent UI crash
  useEffect(() => {
    if (peers.length > 200) {
      console.warn("[CRITICAL] Peers exceeded 200, emergency reset triggered.");
      setPeers([]);
    }
  }, [peers.length]);

  // --- STEP 7 DEBUG HELPER ---
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && lastMessage) {
      console.log("[WS IN]", lastMessage.type, lastMessage);
    }
  }, [lastMessage]);

  return (
    <WebRTCContext.Provider value={{
      // Discovery (existing)
      myDeviceId,
      myDeviceName,
      peers,
      wsConnected: isConnected,
      sendMessage,

      // Handshake (new)
      connectionStatus,
      incomingRequest,
      targetPeerId,
      sendConnectRequest,
      cancelRequest,
      acceptRequest,
      rejectRequest,
      resetConnection,
    }}>
      {children}
    </WebRTCContext.Provider>
  );
};

