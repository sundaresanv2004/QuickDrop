"use client"

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getDeviceName } from '@/lib/device';
import { Peer, WSMessage, WelcomeMessage, PeerListMessage, PeerJoinedMessage, PeerLeftMessage } from '@/types/messages';

interface WebRTCContextType {
  isConnected: boolean;
  deviceId: string | null;
  deviceName: string;
  peers: Peer[];
  sendMessage: (msg: object) => void;
}

const WebRTCContext = createContext<WebRTCContextType | null>(null);

export const useWebRTC = () => {
  const context = useContext(WebRTCContext);
  if (!context) throw new Error("useWebRTC must be used within a WebRTCProvider");
  return context;
};

export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getWsUrl = () => {
    let envUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (envUrl && envUrl.trim() !== "") {
      if (envUrl.startsWith("http")) envUrl = envUrl.replace(/^http/, "ws");
      return envUrl;
    }
    
    if (typeof window === "undefined") return "ws://localhost:8001/ws/connect";
    
    const hostname = window.location.hostname;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    
    let finalUrl: string;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      finalUrl = `${proto}//${hostname}:8001/ws/connect`;
    } else if (!hostname.startsWith("api-")) {
      finalUrl = `${proto}//api-${hostname}/ws/connect`;
    } else {
      finalUrl = `${proto}//${window.location.host}/ws/connect`;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[WS URL]", finalUrl);
    }
    return finalUrl;
  };

  const WS_URL = getWsUrl();
  const { isConnected, lastMessage, sendMessage } = useWebSocket(WS_URL);
  const deviceName = getDeviceName();

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);

  const handleWelcome = useCallback((msg: WelcomeMessage) => {
    setDeviceId(msg.device_id);
  }, []);

  const handlePeerList = useCallback((msg: PeerListMessage) => {
    setPeers(msg.peers);
  }, []);

  const handlePeerJoined = useCallback((msg: PeerJoinedMessage) => {
    setPeers((prev) => [...prev, { device_id: msg.device_id, device_name: msg.device_name }]);
  }, []);

  const handlePeerLeft = useCallback((msg: PeerLeftMessage) => {
    setPeers((prev) => prev.filter((p) => p.device_id !== msg.device_id));
  }, []);

  // --- STEP 7 MESSAGE ROUTING ---
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case "welcome":
        handleWelcome(lastMessage as WelcomeMessage);
        break;
      case "peer_list":
        handlePeerList(lastMessage as PeerListMessage);
        break;
      case "peer_joined":
        handlePeerJoined(lastMessage as PeerJoinedMessage);
        break;
      case "peer_left":
        handlePeerLeft(lastMessage as PeerLeftMessage);
        break;
      // These cases will be handled in Phase 2 and 3:
      case "connect_request":
      case "connect_accept":
      case "connect_reject":
      case "sdp_offer":
      case "sdp_answer":
      case "ice_candidate":
        break;
      default:
        console.warn("Unhandled WS message type:", lastMessage);
    }
  }, [lastMessage, handleWelcome, handlePeerList, handlePeerJoined, handlePeerLeft]);

  // --- STEP 7 DEBUG HELPER ---
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && lastMessage) {
      console.log("[WS IN]", lastMessage.type, lastMessage);
    }
  }, [lastMessage]);

  return (
    <WebRTCContext.Provider value={{ isConnected, deviceId, deviceName, peers, sendMessage }}>
      {children}
    </WebRTCContext.Provider>
  );
};

