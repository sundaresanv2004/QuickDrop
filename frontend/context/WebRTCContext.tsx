"use client"

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getDeviceName } from '@/lib/device';
import { Peer, WSMessage, WelcomeMessage, PeerListMessage, PeerJoinedMessage, PeerLeftMessage } from '@/types/messages';
import type { ChatMessage, PendingFileTransfer, TextMessagePayload, FileMetaPayload, SystemPayload } from '@/types/chat';

export type ConnectionStatus =
  | "idle"           // No active connection or request
  | "requesting"     // This device sent a connect_request, waiting for answer
  | "receiving"      // This device received a connect_request, showing modal
  | "connecting"     // Both accepted, signaling in progress (Phase 3)
  | "connected"      // DataChannels are open (Phase 4)
  | "rejected"       // The other device rejected our request
  | "disconnected"   // Connection was lost after being established

import { toast } from 'sonner';

const CHUNK_SIZE = 64 * 1024;          // 64KB per chunk
const MAX_BUFFERED_AMOUNT = 1024 * 1024;  // 1MB backpressure threshold

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

  // Chat state
  messages:     ChatMessage[];
  isTyping:     boolean;
  pendingFiles: Map<string, PendingFileTransfer>;

  // Chat actions
  addMessage:    (message: ChatMessage) => void;
  clearMessages: () => void;
  sendChatMessage: (content: string) => void;
  sendSystemMessage: (payload: SystemPayload) => void;
  sendFile: (file: File) => Promise<void>;
}

const WebRTCContext = createContext<WebRTCContextType | null>(null);

export const useWebRTC = () => {
  const context = useContext(WebRTCContext);
  if (!context) throw new Error("useWebRTC must be used within a WebRTCProvider");
  return context;
};

export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  const processedMessagesRef = useRef<Set<WSMessage>>(new Set());
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [pendingFiles, setPendingFiles] = useState<Map<string, PendingFileTransfer>>(new Map());

  // Channels in state for reactivity in components
  const [chatChannel, setChatChannel] = useState<RTCDataChannel | null>(null);
  const [fileChannel, setFileChannel] = useState<RTCDataChannel | null>(null);
  const [systemChannel, setSystemChannel] = useState<RTCDataChannel | null>(null);

  const pcRef        = useRef<RTCPeerConnection | null>(null);
  const chatRef      = useRef<RTCDataChannel | null>(null);
  const fileRef      = useRef<RTCDataChannel | null>(null);
  const systemRef    = useRef<RTCDataChannel | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const fileTransferQueueRef = useRef<string[]>([]);

  const handleWelcome = useCallback((msg: WelcomeMessage) => {
    setMyDeviceId(msg.device_id);
  }, []);

  const handlePeerList = useCallback((msg: PeerListMessage) => {
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

    setChatChannel(null);
    setFileChannel(null);
    setSystemChannel(null);
    fileTransferQueueRef.current = [];
  }, []);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const clearMessages = useCallback(() => {
    // Revoke all objectURLs before clearing to prevent memory leaks
    setMessages(prev => {
      prev.forEach(msg => {
        if (msg.type === "file" && msg.file?.objectUrl) {
          URL.revokeObjectURL(msg.file.objectUrl)
        }
      })
      return []
    })
    setIsTyping(false)
    setPendingFiles(new Map())
  }, [])

  const handleSystemMessage = useCallback((raw: string) => {
    try {
      const payload: SystemPayload = JSON.parse(raw);

      switch (payload.type) {
        case "file_meta": {
          // Add a "receiving" file bubble to messages immediately
          const fileMessage: ChatMessage = {
            id:        crypto.randomUUID(),
            type:      "file",
            direction: "received",
            timestamp: Date.now(),
            file: {
              fileId:    payload.fileId,
              name:      payload.name,
              size:      payload.size,
              mimeType:  payload.mimeType,
              status:    "receiving",
              progress:  0,
              objectUrl: null,
            }
          };
          addMessage(fileMessage);

          // Register the pending transfer
          setPendingFiles(prev => {
            const updated = new Map(prev);
            updated.set(payload.fileId, {
              meta: {
                fileId:      payload.fileId,
                name:        payload.name,
                size:        payload.size,
                mimeType:    payload.mimeType,
                totalChunks: payload.totalChunks,
              },
              chunks:   [],
              received: 0,
            });
            return updated;
          });

          
          fileTransferQueueRef.current.push(payload.fileId);
          break;
        }

        case "typing_start":
          setIsTyping(true);
          break;

        case "typing_stop":
          setIsTyping(false);
          break;

        case "bye":
          setConnectionStatus("disconnected")
          setIsTyping(false)
          break

        default:
          console.warn("[SYSTEM] Unknown system message:", payload);
      }
    } catch {
      console.error("[SYSTEM] Failed to parse system message:", raw);
    }
  }, [addMessage, setIsTyping, setConnectionStatus, setPendingFiles]);

  const resetConnection = useCallback(() => {
    cleanupPeerConnection();
    clearMessages();
    setConnectionStatus("idle");
    setIncomingRequest(null);
    setTargetPeerId(null);
    // TODO: also call resetConnection when peer_left matches targetPeerId
  }, [cleanupPeerConnection, clearMessages]);

  const setupDataChannelListeners = useCallback((
    channel: RTCDataChannel,
    label: string
  ) => {
    channel.onopen = () => {

      if (label === "chat") {
        setConnectionStatus("connected");

        // Trigger the navigation callback registered by the page
        if (onChatReady) {
          onChatReady();
        }
      }
    };

    channel.onclose = () => {
    };

    channel.onerror = (err) => {
      console.error(`[DC] ${label} channel error:`, err);
    };

    channel.onmessage = (event) => {
      if (label === "chat") {
        try {
          const payload: TextMessagePayload = JSON.parse(event.data);

          if (payload.type === "text_message") {
            const message: ChatMessage = {
              id:        payload.id,
              type:      "text",
              direction: "received",
              content:   payload.content,
              timestamp: payload.timestamp,
            };
            addMessage(message);
          }
        } catch {
          console.error("[CHAT] Failed to parse chat message:", event.data);
        }
      }

      if (label === "files") {
        // If binaryType is correctly set, data will always be 
        // ArrayBuffer. This guard is a safety net.
        if (event.data instanceof Blob) {
          // This should never happen if binaryType = "arraybuffer" 
          // is set correctly. Log it as a hard error.
          console.error(
            "[FILES] Received Blob instead of ArrayBuffer.",
            "binaryType was not set correctly on the files channel.",
            "Fix: set channel.binaryType = 'arraybuffer' after channel creation."
          );
          return;
        }

        if (!(event.data instanceof ArrayBuffer)) {
          console.warn("[FILES] Unexpected data type:", typeof event.data);
          return;
        }

        // Find which file transfer this chunk belongs to by checking 
        // pendingFiles — the file_meta (sent on system channel) always 
        // arrives before any binary chunks because system channel is 
        // ordered and files channel is ordered too.
        // Get the active transfer from the front of the queue
        const activeFileId = fileTransferQueueRef.current[0];
        if (!activeFileId) {
          console.warn("[FILES] Received chunk but transfer queue is empty");
          return;
        }

        setPendingFiles(prev => {
          const updated = new Map(prev);
          const transfer = updated.get(activeFileId);

          if (!transfer) {
            console.warn("[FILES] No pending transfer for:", activeFileId);
            return prev;
          }

          // Add chunk
          transfer.chunks.push(event.data as ArrayBuffer);
          transfer.received += 1;

          const progress = Math.round(
            (transfer.received / transfer.meta.totalChunks) * 100
          );

          // Update progress on receiver bubble
          setMessages(msgs => msgs.map(msg => {
            if (msg.type === "file" && msg.file?.fileId === activeFileId) {
              return { 
                ...msg, 
                file: { ...msg.file!, progress } 
              };
            }
            return msg;
          }));


          // Check completion
          if (transfer.received === transfer.meta.totalChunks) {
            // Reassemble
            const blob = new Blob(transfer.chunks, {
              type: transfer.meta.mimeType
            });
            const objectUrl = URL.createObjectURL(blob);

            // Mark complete on the message
            setMessages(msgs => msgs.map(msg => {
              if (msg.type === "file" && msg.file?.fileId === activeFileId) {
                return {
                  ...msg,
                  file: {
                    ...msg.file!,
                    status: "complete" as const,
                    progress: 100,
                    objectUrl,
                  }
                };
              }
              return msg;
            }));

            // Remove from pending and queue
            updated.delete(activeFileId);
            fileTransferQueueRef.current.shift();
            
          }

          return updated;
        });
      }

      if (label === "system") {
        handleSystemMessage(event.data as string);
      }
    };
  }, [onChatReady, addMessage, handleSystemMessage, setPendingFiles]);

  const flushIceCandidates = useCallback(async () => {
    if (!pcRef.current) return;
    const queue = iceCandidateQueueRef.current;
    if (queue.length === 0) return;

    for (const candidate of queue) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[ICE] Failed to add queued candidate:", err);
      }
    }
    iceCandidateQueueRef.current = [];
  }, []);

  const sendChatMessage = useCallback((content: string) => {
    if (!chatRef.current || chatRef.current.readyState !== "open") {
      console.warn("[CHAT] Cannot send — channel not open");
      return;
    }

    const id = crypto.randomUUID();
    const timestamp = Date.now();

    const payload: TextMessagePayload = {
      type: "text_message",
      id,
      content,
      timestamp,
    };

    // Send over DataChannel
    chatRef.current.send(JSON.stringify(payload));

    // Optimistic local add
    const message: ChatMessage = {
      id,
      type:      "text",
      direction: "sent",
      content,
      timestamp,
    };
    addMessage(message);
  }, [addMessage]);

  const sendSystemMessage = useCallback((payload: SystemPayload) => {
    if (!systemRef.current || systemRef.current.readyState !== "open") {
      console.warn("[SYSTEM] Cannot send — channel not open");
      return;
    }
    systemRef.current.send(JSON.stringify(payload));
  }, []);

  const sendFile = useCallback(async (file: File) => {
    // ─── 1. Guards ───
    if (!fileRef.current || fileRef.current.readyState !== "open") {
      console.warn("[FILES] Cannot send — file channel not open")
      return
    }
    if (!systemRef.current || systemRef.current.readyState !== "open") {
      console.warn("[FILES] Cannot send — system channel not open")
      return
    }

    // ─── 2. Prepare metadata ───
    const fileId      = crypto.randomUUID()
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

    // ─── 3. Send file_meta on system channel FIRST ───
    const meta: FileMetaPayload = {
      type:        "file_meta",
      fileId,
      name:        file.name,
      size:        file.size,
      mimeType:    file.type || "application/octet-stream",
      totalChunks,
    }
    systemRef.current.send(JSON.stringify(meta))

    // ─── 4. Add sending bubble to local messages ───
    const messageId = crypto.randomUUID()
    const fileMessage: ChatMessage = {
      id:        messageId,
      type:      "file",
      direction: "sent",
      timestamp: Date.now(),
      file: {
        fileId,
        name:      file.name,
        size:      file.size,
        mimeType:  file.type || "application/octet-stream",
        status:    "sending",
        progress:  0,
        objectUrl: null,
      }
    }
    addMessage(fileMessage)

    // ─── 5. Read entire file as ArrayBuffer ───
    const arrayBuffer = await file.arrayBuffer()

    // ─── 6. Send chunks with backpressure control ───
    let offset      = 0
    let chunkIndex  = 0

    while (offset < arrayBuffer.byteLength) {
      // Backpressure: if buffer is full, wait for it to drain
      if (fileRef.current.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (
              !fileRef.current ||
              fileRef.current.bufferedAmount <= MAX_BUFFERED_AMOUNT
            ) {
              resolve()
            } else {
              setTimeout(check, 50)   // poll every 50ms
            }
          }
          check()
        })
      }

      // Safety: channel may have closed while we were waiting
      if (!fileRef.current || fileRef.current.readyState !== "open") {
        console.warn("[FILES] Channel closed during transfer — aborting")
        // Update local bubble to error state
        setMessages(msgs => msgs.map(msg => {
          if (msg.type === "file" && msg.file?.fileId === fileId) {
            return { ...msg, file: { ...msg.file!, status: "error" as const } }
          }
          return msg
        }))
        return
      }

      // Slice and send the chunk
      const end   = Math.min(offset + CHUNK_SIZE, arrayBuffer.byteLength)
      const chunk = arrayBuffer.slice(offset, end)
      fileRef.current.send(chunk)

      offset     += chunk.byteLength
      chunkIndex += 1

      // Update progress on the local sender bubble
      const progress = Math.round((chunkIndex / totalChunks) * 100)
      setMessages(msgs => msgs.map(msg => {
        if (msg.type === "file" && msg.file?.fileId === fileId) {
          return {
            ...msg,
            file: { ...msg.file!, progress }
          }
        }
        return msg
      }))
    }

    // ─── 7. Mark as complete on sender side ───
    const objectUrl = URL.createObjectURL(
      new Blob([arrayBuffer], { type: file.type })
    )

    setMessages(msgs => msgs.map(msg => {
      if (msg.type === "file" && msg.file?.fileId === fileId) {
        return {
          ...msg,
          file: {
            ...msg.file!,
            status:    "complete" as const,
            progress:  100,
            objectUrl,
          }
        }
      }
      return msg
    }))

  }, [addMessage])

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
      files.binaryType = "arraybuffer";
      const system = pc.createDataChannel("system", { ordered: true });

      chatRef.current   = chat;
      fileRef.current   = files;
      systemRef.current = system;

      setChatChannel(chat);
      setFileChannel(files);
      setSystemChannel(system);

      setupDataChannelListeners(chat,   "chat");
      setupDataChannelListeners(files,  "files");
      setupDataChannelListeners(system, "system");
    }

    // ─── 3. Receiver listens for incoming DataChannels ───
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === "chat")   {
        chatRef.current = channel;
        setChatChannel(channel);
        setupDataChannelListeners(channel, "chat");
      }
      if (channel.label === "files")  {
        channel.binaryType = "arraybuffer";
        fileRef.current = channel;
        setFileChannel(channel);
        setupDataChannelListeners(channel, "files");
      }
      if (channel.label === "system") {
        systemRef.current = channel;
        setSystemChannel(channel);
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
      }
      if (!event.candidate) {
      }
    };

    pc.onicegatheringstatechange = () => {
    };

    pc.oniceconnectionstatechange = () => {
    };

    // ─── 5. Connection state change handler ───
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setConnectionStatus("connected");
      }
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        setConnectionStatus("disconnected");
        setIsTyping(false);

        // Mark all in-progress received file bubbles as error
        setMessages(msgs => msgs.map(msg => {
          if (
            msg.type === "file" &&
            msg.direction === "received" &&
            msg.file?.status === "receiving"
          ) {
            return {
              ...msg,
              file: { ...msg.file!, status: "error" as const }
            };
          }
          return msg;
        }));

        // Clear the transfer queue
        fileTransferQueueRef.current = [];
      }
    };

    return pc;   // Return so Step 2 can call createOffer() on it
  }, [sendMessage, setupDataChannelListeners, targetPeerId]);

  // --- STEP 7 MESSAGE ROUTING ---
  useEffect(() => {
    if (!lastMessage || !mounted || processedMessagesRef.current.has(lastMessage)) return;
    processedMessagesRef.current.add(lastMessage);

    // Keep the set from growing too large
    if (processedMessagesRef.current.size > 50) {
      const iter = processedMessagesRef.current.values();
      const first = iter.next().value;
      if (first) {
        processedMessagesRef.current.delete(first);
      }
    }

    const timer = setTimeout(() => {
      if (!lastMessage) return;

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
        handlePeerLeft(lastMessage);
        break;
      // These cases will be handled in Phase 2 and 3:
      case "connect_request":
        {
          const requesterName = peers.find(p => p.device_id === lastMessage.from_id)?.device_name ?? "Unknown Device";
          setIncomingRequest({
            peerId: lastMessage.from_id,
            peerName: requesterName
          });
          setConnectionStatus("receiving");
        }
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
              return;
            }

            await pcRef.current.addIceCandidate(
              new RTCIceCandidate(lastMessage.candidate)
            );
          } catch (err) {
            console.error("[ICE] Failed to add candidate:", err);
          }
        })();
        break;
      default:
        console.warn("Unhandled WS message type:", (lastMessage as WSMessage).type);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [lastMessage, handleWelcome, handlePeerList, handlePeerJoined, handlePeerLeft, connectionStatus, incomingRequest, peers, initializePeerConnection, sendMessage, flushIceCandidates, mounted]);

  // Safety check: if peers explode, reset them once to prevent UI crash
  useEffect(() => {
    if (peers.length > 200) {
      console.warn("[CRITICAL] Peers exceeded 200, emergency reset triggered.");
      // Avoid synchronous setState in effect
      setTimeout(() => setPeers([]), 0);
    }
  }, [peers.length]);


  // --- STEP 7 DEBUG HELPER ---
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && lastMessage) {
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
      chatChannel,
      fileChannel,
      systemChannel,

      // Navigation
      onChatReady,
      setOnChatReady,

      // Chat state
      messages,
      isTyping,
      pendingFiles,
      addMessage,
      clearMessages,
      sendChatMessage,
      sendSystemMessage,
      sendFile,
    }}>
      {children}
    </WebRTCContext.Provider>
  );
};

