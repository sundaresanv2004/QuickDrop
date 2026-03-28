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
    const unsubFileProg = webRTCManager.on('file_progress', (fileId, progress) => {
      setMessages(prev => prev.map(m => 
        m.id === fileId && m.type === 'file' && m.file 
          ? { ...m, file: { ...m.file, progress, status: progress === 100 ? 'complete' : m.file.status } } 
          : m
      ));
    });
    const unsubFileComp = webRTCManager.on('file_complete', (fileId, url) => {
      setMessages(prev => prev.map(m => 
        m.id === fileId && m.type === 'file' && m.file 
          ? { ...m, file: { ...m.file, progress: 100, status: 'complete', objectUrl: url ?? m.file.objectUrl } } 
          : m
      ));
    });
    const unsubFileErr = webRTCManager.on('file_error', (fileId, err) => {
      setMessages(prev => prev.map(m => m.id === fileId && m.type === 'file' && m.file ? { ...m, file: { ...m.file, status: 'error' } } : m));
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
      toast.error(`Connection failed: ${msg}`);
    });
    const unsubPeerLeft = webRTCManager.on('peer_left', (id) => {
      if (id === webRTCManager.targetPeerId && (webRTCManager.status === "connected" || webRTCManager.status === "connecting")) {
        toast.warning("Peripheral peer disconnected.");
      }
      setPeers([...webRTCManager.peers]);
    });

    return () => {
      unsubWs();
      unsubInfo();
      unsubStatus();
      unsubReq();
      unsubPeers();
      unsubJoin();
      unsubChat();
      unsubReaction();
      unsubFileProg();
      unsubFileComp();
      unsubFileErr();
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

    sendChatMessage: (text: string) => webRTCManager.sendChatMessage(text),
    sendReaction: (msgId: string, emoji: string) => webRTCManager.sendReaction(msgId, emoji),
    sendSystemMessage: (payload: SystemPayload) => webRTCManager.sendSystemMessage(payload),
    sendFile: (f: File) => webRTCManager.sendFile(f),
    
    // For chat input to know if channel open
    chatChannelOpen: status === "connected"
  }), [status, webRTCManager.myDeviceId, webRTCManager.myDeviceName, webRTCManager.targetPeerId, webRTCManager.activeChatPeerId]);

  return {
    status,
    peers,
    incomingRequest,
    messages,
    isTyping,
    ...api
  };
}
