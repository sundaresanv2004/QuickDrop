"use client"

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useWebRTCBridge } from '@/hooks/useWebRTCBridge';
import { webRTCManager } from '@/lib/webrtc/WebRTCManager';
import { getDeviceName, getDeviceType } from '@/lib/device';
import { WebRTCContext } from '@/lib/webrtc/context';

export type { ConnectionStatus } from '@/lib/webrtc/WebRTCManager';

export const useWebRTC = () => {
  const context = useContext(WebRTCContext);
  if (!context) throw new Error("useWebRTC must be used within a WebRTCProvider");
  return context;
};

export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  const bridge = useWebRTCBridge();

  useEffect(() => {
    // Determine signaling URL
    let envUrl = process.env.NEXT_PUBLIC_WS_URL || "";
    if (!envUrl && typeof window !== "undefined") {
      const hostname = window.location.hostname;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      envUrl = (hostname === "localhost" || hostname === "127.0.0.1") 
        ? `${proto}//${hostname}:8001/ws/connect`
        : `${proto}//${window.location.host}/ws/connect`;
    }

    if (typeof window !== "undefined") {
      const name = getDeviceName();
      const type = getDeviceType();
      webRTCManager.initialize(envUrl, name, type);
      setMounted(true);
    }
  }, []);

  return (
    <WebRTCContext.Provider value={bridge}>
      {/* 
          During SSR, we render children to prevent SEO loss, 
          but they will receive the 'idle' bridge state.
          The 'mounted' check here is mainly for the manager initialization.
      */}
      {children}
    </WebRTCContext.Provider>
  );
};
