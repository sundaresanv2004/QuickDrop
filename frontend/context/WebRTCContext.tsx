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
  initializePeerConnection: (isInitiator: boolean) => RTCPeerConnection;

  // WebRTC refs exposed for chat page use
  chatChannel:   RTCDataChannel | null;
  fileChannel:   RTCDataChannel | null;
  systemChannel: RTCDataChannel | null;

  // Navigation callbacks
  onChatReady: (() => void) | null;
  setOnChatReady: (cb: () => void) => void;
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

  const [onChatReady, setOnChatReadyState] = useState<(() => void) | null>(null);

  const setOnChatReady = useCallback((cb: () => void) => {
    setOnChatReadyState(() => cb);
  }, []);

  const pcRef        = useRef<RTCPeerConnection | null>(null);
  const chatRef      = useRef<RTCDataChannel | null>(null);
  const fileRef      = useRef<RTCDataChannel | null>(null);
  const systemRef    = useRef<RTCDataChannel | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);

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

  const cleanupPeerConnection = useCallback(() => {
    chatRef.current?.close();
    fileRef.current?.close();
    systemRef.current?.close();
    pcRef.current?.close();

    chatRef.current   = null;
    fileRef.current   = null;
    systemRef.current = null;
    pcRef.current     = null;
  }, []);

  const resetConnection = useCallback(() => {
    cleanupPeerConnection();
    setConnectionStatus("idle");
    setIncomingRequest(null);
    setTargetPeerId(null);
    // TODO: also call resetConnection when peer_left matches targetPeerId
  }, [cleanupPeerConnection]);

  const setupDataChannelListeners = useCallback((
    channel: RTCDataChannel,
    label: string
  ) => {
    channel.onopen = () => {
      console.log(`[DC] ${label} channel opened`);

      if (label === "chat") {
        setConnectionStatus("connected");
        console.log("[PHASE 3 COMPLETE] Chat channel open — navigating");

        // Trigger the navigation callback registered by the page
        if (onChatReady) {
          onChatReady();
        }
      }
    };

    channel.onclose = () => {
      console.log(`[DC] ${label} channel closed`);
    };

    channel.onerror = (err) => {
      console.error(`[DC] ${label} channel error:`, err);
    };

    channel.onmessage = (event) => {
      console.log(`[DC] ${label} message received:`, event.data);
      // Phase 4 will replace this with real message handling
    };
  }, [onChatReady]);

  const flushIceCandidates = useCallback(async () => {
    if (!pcRef.current) return;
    const queue = iceCandidateQueueRef.current;
    if (queue.length === 0) return;

    console.log(`[ICE] Flushing ${queue.length} queued candidates`);
    for (const candidate of queue) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[ICE] Failed to add queued candidate:", err);
      }
    }
    iceCandidateQueueRef.current = [];
  }, []);

  const initializePeerConnection = useCallback((isInitiator: boolean) => {
    // ─── 1. Create the RTCPeerConnection ───
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ]
    });
    pcRef.current = pc;

    // ─── 2. Only the INITIATOR creates DataChannels ───
    // The receiver gets them via pc.ondatachannel (Part 4 below)
    if (isInitiator) {
      const chat   = pc.createDataChannel("chat",   { ordered: true });
      const files  = pc.createDataChannel("files",  { ordered: true });
      const system = pc.createDataChannel("system", { ordered: true });

      chatRef.current   = chat;
      fileRef.current   = files;
      systemRef.current = system;

      setupDataChannelListeners(chat,   "chat");
      setupDataChannelListeners(files,  "files");
      setupDataChannelListeners(system, "system");
    }

    // ─── 3. Receiver listens for incoming DataChannels ───
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === "chat")   {
        chatRef.current = channel;
        setupDataChannelListeners(channel, "chat");
      }
      if (channel.label === "files")  {
        fileRef.current = channel;
        setupDataChannelListeners(channel, "files");
      }
      if (channel.label === "system") {
        systemRef.current = channel;
        setupDataChannelListeners(channel, "system");
      }
    };

    // ─── 4. ICE candidate handler (wired up, logic added in Step 3) ───
    pc.onicecandidate = (event) => {
      if (event.candidate && targetPeerId) {
        sendMessage({
          type: "ice_candidate",
          to: targetPeerId,
          candidate: event.candidate.toJSON()
        });
        console.log("[ICE] Sent candidate:", event.candidate.type);
      }
      if (!event.candidate) {
        console.log("[ICE] All candidates gathered");
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log("[ICE] Gathering state:", pc.iceGatheringState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[ICE] Connection state:", pc.iceConnectionState);
    };

    // ─── 5. Connection state change handler ───
    pc.onconnectionstatechange = () => {
      console.log("[PC] connectionState:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setConnectionStatus("connected");
      }
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        setConnectionStatus("disconnected");
      }
    };

    return pc;   // Return so Step 2 can call createOffer() on it
  }, [sendMessage, setupDataChannelListeners, targetPeerId]);

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
          setConnectionStatus("connecting");

          // ─── Initiator creates the offer ───
          const pc = initializePeerConnection(true);  // isInitiator = true
          
          // Small async IIFE to handle the async offer creation
          (async () => {
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);

              sendMessage({
                type: "sdp_offer",
                to: lastMessage.from_id,
                sdp: offer
              });

              console.log("[SDP] Offer created and sent");
            } catch (err) {
              console.error("[SDP] Failed to create offer:", err);
            }
          })();
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
        // ─── Receiver handles the incoming offer ───
        (async () => {
          try {
            const pc = initializePeerConnection(false);  // isInitiator = false
            
            await pc.setRemoteDescription(
              new RTCSessionDescription(lastMessage.sdp)
            );

            await flushIceCandidates();

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            sendMessage({
              type: "sdp_answer",
              to: lastMessage.from_id,
              sdp: answer
            });

            console.log("[SDP] Answer created and sent");
          } catch (err) {
            console.error("[SDP] Failed to handle offer:", err);
          }
        })();
        break;
      case "sdp_answer":
        // ─── Initiator applies the answer from receiver ───
        (async () => {
          try {
            if (!pcRef.current) return;
            
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription(lastMessage.sdp)
            );

            await flushIceCandidates();

            console.log("[SDP] Remote description set — ICE will begin");
          } catch (err) {
            console.error("[SDP] Failed to set remote description:", err)
          }
        })();
        break;
      case "ice_candidate":
        // ─── Receiver and Initiator handle ICE candidates ───
        (async () => {
          try {
            if (!pcRef.current) return;

            if (!pcRef.current.remoteDescription) {
              // Queue it — will be flushed after setRemoteDescription
              iceCandidateQueueRef.current.push(lastMessage.candidate);
              console.log("[ICE] Queued candidate (remote description not set yet)");
              return;
            }

            await pcRef.current.addIceCandidate(
              new RTCIceCandidate(lastMessage.candidate)
            );
            console.log("[ICE] Applied remote candidate");
          } catch (err) {
            console.error("[ICE] Failed to add candidate:", err);
          }
        })();
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
      initializePeerConnection,

      // Channels
      chatChannel: chatRef.current,
      fileChannel: fileRef.current,
      systemChannel: systemRef.current,

      // Navigation
      onChatReady,
      setOnChatReady,
    }}>
      {children}
    </WebRTCContext.Provider>
  );
};

