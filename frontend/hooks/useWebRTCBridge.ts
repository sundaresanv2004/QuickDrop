import { useEffect, useState, useCallback, useMemo } from 'react';
import { webRTCManager, ConnectionStatus } from '@/lib/webrtc/WebRTCManager';
import { Peer } from '@/types/messages';
import { ChatMessage, SystemPayload } from '@/types/chat';
import { toast } from 'sonner';

export function useWebRTCBridge() {
  const [status, setStatus] = useState<ConnectionStatus>(webRTCManager.status);
  const [peers, setPeers] = useState<Peer[]>(webRTCManager.peers);
  const [incomingRequest, setIncomingRequest] = useState(webRTCManager.incomingRequest);
  const [wsConnected, setWsConnected] = useState<boolean>(webRTCManager.wsConnected);
  const [myDeviceName, setMyDeviceName] = useState<string>(webRTCManager.myDeviceName);
  const [myDeviceType, setMyDeviceType] = useState<string>(webRTCManager.myDeviceType);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState<boolean>(false);

  useEffect(() => {
    const unsubWs = webRTCManager.on('ws_status', setWsConnected);
    const unsubInfo = webRTCManager.on('my_info_updated', (name, type) => {
      setMyDeviceName(name);
      setMyDeviceType(type);
    });
    const unsubStatus = webRTCManager.on('status', setStatus);
    const unsubReq = webRTCManager.on('incoming_request', (peerId, peerName) => {
      setIncomingRequest({ peerId, peerName });
    });
    
    // Peer updates
    const unsubPeers = webRTCManager.on('peer_list', setPeers);
    const unsubJoin = webRTCManager.on('peer_joined', () => setPeers([...webRTCManager.peers]));
    
    // Chat messages
    const unsubChat = webRTCManager.on('chat_message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    const unsubReaction = webRTCManager.on('reaction', (messageId, emoji, fromId) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        
        // Remove old emoji from this user
        Object.keys(reactions).forEach(k => {
          if (k !== emoji) {
            reactions[k] = reactions[k].filter(id => id !== fromId);
            if (reactions[k].length === 0) delete reactions[k];
          }
        });

        // Toggle new
        const current = [...(reactions[emoji] || [])];
        if (current.includes(fromId)) {
          reactions[emoji] = current.filter(id => id !== fromId);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...current, fromId];
        }
        
        return { ...m, reactions };
      }));
    });

    // File updates
    const unsubFileUpdate = webRTCManager.on('file_update', (fileId, changes) => {
      setMessages(prev => prev.map(m =>
        m.id === fileId && m.type === 'file' && m.file ? { ...m, file: { ...m.file, ...changes } } : m
      ));
    });
    const unsubFileNotice = webRTCManager.on('file_notice', (message) => {
      toast.warning(message);
    });

    const unsubTyping = webRTCManager.on('typing_state', setIsTyping);

    // Notifications
    const unsubRejected = webRTCManager.on('request_rejected', (_peerId, _peerName) => {
      toast.error('Connection request declined');
    });
    const unsubCancelled = webRTCManager.on('request_cancelled', (_peerId, peerName) => {
      toast.info(`Request from ${peerName} was cancelled`);
    });
    const unsubConnErr = webRTCManager.on('connection_error', (msg) => {
      toast.error(`Couldn't connect. ${msg}`, { duration: 10000 });
    });
    const unsubPeerLeft = webRTCManager.on('peer_left', (id) => {
      if (id === webRTCManager.targetPeerId && (webRTCManager.status === "connecting" || webRTCManager.status === "reconnecting")) {
        toast.warning("The other device disconnected.");
      }
      setPeers([...webRTCManager.peers]);
    });
    const unsubPairJoined = webRTCManager.on('pair_joined', (peer) => {
      toast.success(`${peer.device_name} is ready`, { description: "Tap it to send a connection request." });
    });
    const unsubPairError = webRTCManager.on('pair_error', (reason) => {
      if (reason === "self") {
        toast.info("This link is for your other device", { description: "Open it on the device you want to connect." });
      } else {
        toast.error("This link has expired or was already used", { description: "Ask for a new QR code or link." });
      }
    });

    return () => {
      unsubPairJoined();
      unsubPairError();
      unsubWs();
      unsubInfo();
      unsubStatus();
      unsubReq();
      unsubPeers();
      unsubJoin();
      unsubChat();
      unsubReaction();
      unsubFileUpdate();
      unsubFileNotice();
      unsubTyping();
      unsubRejected();
      unsubCancelled();
      unsubConnErr();
      unsubPeerLeft();
    };
  }, []);

  // When connection drops to idle, clear logic
  useEffect(() => {
    if (status === "idle") {
      setIncomingRequest(null);
      setMessages([]);
      setIsTyping(false);
    }
  }, [status]);

  /** We wrap manager actions nicely here so UI components bind easily */
  const api = useMemo(() => ({
    wsConnected,
    myDeviceId: webRTCManager.myDeviceId,
    myDeviceName,
    myDeviceType,
    updateDeviceName: (name: string) => webRTCManager.updateDeviceName(name),
    targetPeerId: webRTCManager.targetPeerId,
    activeChatPeerId: webRTCManager.activeChatPeerId,

    sendConnectRequest: (id: string) => webRTCManager.sendConnectRequest(id),
    cancelRequest: () => webRTCManager.cancelRequest(),
    acceptRequest: () => webRTCManager.acceptRequest(),
    rejectRequest: () => webRTCManager.rejectRequest(),
    setActiveChatPeerId: (id: string | null) => webRTCManager.setActiveChatPeerId(id),
    resetConnection: (id?: string) => webRTCManager.resetConnection(id),

    updateMessage: (id: string, updates: Partial<ChatMessage>) => {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))
    },
    sendChatMessage: (text: string, preview?: any) => webRTCManager.sendChatMessage(text, preview),
    sendReaction: (msgId: string, emoji: string) => webRTCManager.sendReaction(msgId, emoji),
    sendSystemMessage: (payload: any) => webRTCManager.sendSystemMessage(payload),
    sendFile: (f: File) => webRTCManager.sendFile(f),
    acceptFile: (id: string) => webRTCManager.acceptFile(id),
    declineFile: (id: string) => webRTCManager.declineFile(id),
    cancelTransfer: (id: string) => webRTCManager.cancelTransfer(id),
    getReceivedFile: (id: string) => webRTCManager.getReceivedFile(id),
    
    // For chat input to know if channel open
    chatChannelOpen: status === "connected"
  }), [status, wsConnected, myDeviceName, myDeviceType, webRTCManager.myDeviceId, webRTCManager.targetPeerId, webRTCManager.activeChatPeerId]);

  return {
    status,
    peers,
    incomingRequest,
    messages,
    isTyping,
    ...api
  };
}
