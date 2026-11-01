import { EventEmitter } from './EventEmitter';
import { Peer, RoomInfo, WSMessage } from '@/types/messages';
import { ChatMessage, SystemPayload, LinkPreview, FileMetaPayload } from '@/types/chat';
import { setDeviceName } from '@/lib/device';
import { SignalingClient } from './SignalingClient';
import { ConnectionController } from './ConnectionController';
import { ChatTransferManager } from './ChatTransferManager';
import { FileTransferManager } from './FileTransferManager';

export type ConnectionStatus =
  | "idle"
  | "requesting"
  | "receiving"
  | "connecting"
  | "connected"
  | "rejected"
  | "disconnected"
  | "left";

export interface WebRTCEvents extends Record<string, any[]> {
  'ws_status': [connected: boolean];
  'my_info_updated': [name: string, type: string];
  'status': [status: ConnectionStatus];
  'incoming_request': [peerId: string, peerName: string];
  'request_rejected': [peerId: string, peerName: string];
  'request_cancelled': [peerId: string, peerName: string];
  'connection_error': [message: string];
  'peer_list': [peers: Peer[]];
  'peer_joined': [peer: Peer];
  'peer_left': [peerId: string];
  'chat_message': [message: ChatMessage];
  'reaction': [messageId: string, emoji: string, fromId: string];
  'system_message': [payload: SystemPayload];
  'file_progress': [fileId: string, progress: number];
  'file_complete': [fileId: string, objectUrl: string | null];
  'file_error': [fileId: string, error: string];
  'typing_state': [isTyping: boolean];
  'room_info': [room: RoomInfo | null];
}

export class WebRTCManager extends EventEmitter<WebRTCEvents> {
  // Public State
  public myDeviceId: string | null = null;
  public myDeviceName: string = 'Unknown Device';
  public myDeviceType: string = 'unknown';
  public roomInfo: RoomInfo | null = null;

  public get wsConnected(): boolean {
    return this.signaling?.wsConnected ?? false;
  }
  
  public status: ConnectionStatus = "idle";
  public peers: Peer[] = [];
  public targetPeerId: string | null = null;
  public incomingRequest: { peerId: string; peerName: string } | null = null;
  public activeChatPeerId: string | null = null;

  private cleanupTimeout: NodeJS.Timeout | null = null;

  // Sub-Managers
  private signaling: SignalingClient;
  private connection: ConnectionController;
  private chatManager: ChatTransferManager;
  private fileManager: FileTransferManager;

  constructor() {
    super();

    // 1. Signaling
    this.signaling = new SignalingClient(
      (connected) => this.emit('ws_status', connected),
      (msg) => this.handleWsMessage(msg),
      () => {
        if (this.status === "requesting" || this.status === "receiving") {
          this.resetConnection();
        }
      }
    );

    // 2. WebRTC Connection
    this.connection = new ConnectionController(
      (candidate) => {
        if (this.targetPeerId) {
          this.signaling.send({ type: "ice_candidate", to: this.targetPeerId, candidate });
        }
      },
      (state) => {
        console.log(`[WebRTC] Connection state: ${state}`);
        if (state === "failed" || state === "closed" || state === "disconnected") {
          this.fileManager.failAllActiveTransfers("Connection lost or peer disconnected");
        }
      },
      (channel, label) => {
        if (label === "chat") {
          this.chatManager.setChannel(channel);
          channel.onopen = () => this.setStatus("connected");
        } else if (label === "files") {
          // Temporarily hold until both are ready
          this.fileManager.setChannels(channel, (this.fileManager as any).systemChannel || null);
        } else if (label === "system") {
          this.fileManager.setChannels((this.fileManager as any).fileChannel || null, channel);
          channel.onmessage = (event) => this.handleSystemMessage(event.data);
        }
      }
    );

    // 3. Chat Transfer
    this.chatManager = new ChatTransferManager(
      () => this.myDeviceId,
      (msg) => this.emit('chat_message', msg),
      (messageId, emoji, fromId) => this.emit('reaction', messageId, emoji, fromId)
    );

    // 4. File Transfer
    this.fileManager = new FileTransferManager(
      (msg) => this.emit('chat_message', msg),
      (fileId, progress) => this.emit('file_progress', fileId, progress),
      (fileId, objectUrl) => this.emit('file_complete', fileId, objectUrl),
      (fileId, error) => this.emit('file_error', fileId, error)
    );
  }

  // --- PUBLIC API ---

  public initialize(wsUrl: string, name: string, type: string) {
    this.myDeviceName = name;
    this.myDeviceType = type;
    this.emit('my_info_updated', this.myDeviceName, this.myDeviceType);
    this.signaling.connect(wsUrl, name, type);
  }

  public updateDeviceName(name: string) {
    const savedName = setDeviceName(name);
    this.myDeviceName = savedName;
    this.emit('my_info_updated', this.myDeviceName, this.myDeviceType);
    this.signaling.updateInfo(savedName, this.myDeviceType);
  }

  public setActiveChatPeerId(peerId: string | null) {
    console.log("[WebRTC] Setting active session:", peerId);
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = null;
    }
    this.activeChatPeerId = peerId;
  }

  public destroy() {
    this.cleanupConnection();
    this.signaling.destroy();
    this.removeAllListeners();
  }

  private setStatus(newStatus: ConnectionStatus) {
    const oldStatus = this.status;
    this.status = newStatus;
    this.emit('status', newStatus);

    const wasBusy = ["connecting", "connected", "requesting", "receiving"].includes(oldStatus);
    const isBusy = ["connecting", "connected", "requesting", "receiving"].includes(newStatus);
    
    if (wasBusy !== isBusy) {
      this.broadcastBusyStatus(isBusy);
    }
  }

  public broadcastBusyStatus(isBusy: boolean) {
    this.signaling.send({ type: "update_status", is_busy: isBusy });
  }

  public sendConnectRequest(peerId: string) {
    if (this.status !== "idle") return;
    this.targetPeerId = peerId;
    this.setStatus("requesting");
    this.signaling.send({ type: "connect_request", to: peerId });
  }

  public cancelRequest() {
    if (this.status !== "requesting" || !this.targetPeerId) return;
    this.signaling.send({ type: "connect_cancel", to: this.targetPeerId });
    this.cancelSession();
  }

  public acceptRequest() {
    if (this.status !== "receiving" || !this.incomingRequest) return;
    this.targetPeerId = this.incomingRequest.peerId;
    const peerId = this.incomingRequest.peerId; 
    this.setStatus("connecting");
    this.signaling.send({ type: "connect_accept", to: peerId });
    this.incomingRequest = null;
  }

  public rejectRequest() {
    if (this.status !== "receiving" || !this.incomingRequest) return;
    this.signaling.send({ type: "connect_reject", to: this.incomingRequest.peerId });
    this.cancelSession();
  }

  private cancelSession() {
    this.setStatus("idle");
    this.incomingRequest = null;
    this.targetPeerId = null;
  }

  public sendChatMessage(content: string, linkPreview?: LinkPreview) {
    const msg = this.chatManager.sendChatMessage(content, linkPreview);
    if (msg) this.emit("chat_message", msg);
    return msg;
  }

  public sendReaction(messageId: string, emoji: string) {
    this.chatManager.sendReaction(messageId, emoji);
  }

  public sendSystemMessage(payload: SystemPayload) {
    // Actually we need to reach the system data channel directly.
    // The connection controller exposes onDataChannel, but we didn't save the system channel here.
    // Wait, FileTransferManager holds the systemChannel. Let's delegate to it, or just keep it simple:
    const channel = (this.fileManager as any).systemChannel;
    if (channel && channel.readyState === "open") {
      channel.send(JSON.stringify(payload));
    }
  }

  public sendFile(file: File) {
    return this.fileManager.sendFile(file);
  }

  public acceptLargeFileStream(fileId: string) {
    return this.fileManager.acceptLargeFileStream(fileId);
  }

  public rejectFile(fileId: string) {
    return this.fileManager.rejectFile(fileId);
  }

  public getDownloadUrl(fileId: string, mimeType: string) {
    return this.fileManager.getDownloadUrl(fileId, mimeType);
  }

  public resetConnection(sessionIdToCleanup?: string) {
    if (this.cleanupTimeout) clearTimeout(this.cleanupTimeout);

    if (sessionIdToCleanup) {
      this.cleanupTimeout = setTimeout(() => {
        this.cleanupConnection();
        this.cleanupTimeout = null;
      }, 1000);
      return;
    }
    this.cleanupConnection();
  }

  private cleanupConnection() {
    this.chatManager.close();
    this.fileManager.cleanup();
    this.connection.close();
    
    this.setStatus("idle");
    this.incomingRequest = null;
    this.targetPeerId = null;
    this.activeChatPeerId = null;
  }

  private handleSystemMessage(raw: string) {
    try {
      const payload: SystemPayload = JSON.parse(raw);
      this.emit("system_message", payload);
      
      const handledByFile = this.fileManager.handleSystemMessage(payload);
      if (handledByFile) return;

      switch (payload.type) {
        case "typing_start": this.emit("typing_state", true); break;
        case "typing_stop": this.emit("typing_state", false); break;
        case "bye": this.setStatus("left"); this.emit("typing_state", false); break;
      }
    } catch { console.error("Failed to parse system message"); }
  }

  private handleWsMessage(msg: WSMessage) {
    switch (msg.type) {
      case "welcome":
        this.myDeviceId = msg.device_id;
        this.roomInfo = msg.room ?? null;
        this.emit('room_info', this.roomInfo);
        break;
      case "peer_list":
        this.peers = msg.peers.filter(p => p.device_id !== this.myDeviceId);
        this.emit("peer_list", this.peers);
        break;
      case "peer_joined":
        if (msg.device_id === this.myDeviceId) break;
        const exist = this.peers.find(p => p.device_id === msg.device_id);
        if (exist) {
          exist.device_name = msg.device_name;
          exist.device_type = msg.device_type;
          exist.is_busy = !!msg.is_busy;
        } else {
          this.peers.push({ 
            device_id: msg.device_id, device_name: msg.device_name, device_type: msg.device_type, is_busy: !!msg.is_busy 
          });
        }
        this.emit("peer_joined", { device_id: msg.device_id, device_name: msg.device_name, device_type: msg.device_type, is_busy: !!msg.is_busy });
        break;
      case "peer_left":
        this.peers = this.peers.filter(p => p.device_id !== msg.device_id);
        this.emit("peer_left", msg.device_id);
        
        if (this.targetPeerId === msg.device_id) {
          this.fileManager.failAllActiveTransfers("Peer left the chat");
          this.setStatus("disconnected");
          this.targetPeerId = null;
        }
        break;
      case "peer_updated":
        const pIndex = this.peers.findIndex(p => p.device_id === msg.device_id);
        if (pIndex !== -1) {
          this.peers[pIndex] = { ...this.peers[pIndex], device_name: msg.device_name, device_type: msg.device_type, is_busy: msg.is_busy };
          this.emit("peer_list", [...this.peers]);
        }
        break;
      case "connect_request":
        if (this.status === "requesting" && this.targetPeerId === msg.from_id) {
          if (this.myDeviceId && this.myDeviceId > msg.from_id) {
            this.setStatus("connecting");
            this.signaling.send({ type: "connect_accept", to: msg.from_id });
            this.connection.init(true);
            (async () => {
              try {
                const offer = await this.connection.createOffer();
                if (offer) this.signaling.send({ type: "sdp_offer", to: msg.from_id, sdp: offer });
              } catch (err) { console.error("[SDP] Glare offer failed:", err); }
            })();
          }
          return;
        }

        if (this.status !== "idle") {
          this.signaling.send({ type: "connect_reject", to: msg.from_id });
          return;
        }

        const peerName = this.peers.find(p => p.device_id === msg.from_id)?.device_name ?? "Unknown Device";
        this.incomingRequest = { peerId: msg.from_id, peerName };
        this.setStatus("receiving");
        this.emit("incoming_request", msg.from_id, peerName);
        break;
      case "connect_cancel":
        if (this.status === "receiving" && this.incomingRequest?.peerId === msg.from_id) {
          const cancellerName = this.peers.find(p => p.device_id === msg.from_id)?.device_name ?? "Unknown Device";
          this.cancelSession();
          this.emit('request_cancelled', msg.from_id, cancellerName);
        }
        break;
      case "connect_accept":
        if (this.status === "requesting") {
          this.setStatus("connecting");
          this.connection.init(true);
          (async () => {
            try {
              const offer = await this.connection.createOffer();
              if (offer) this.signaling.send({ type: "sdp_offer", to: msg.from_id, sdp: offer });
            } catch (err) { console.error("[SDP] Offer failed:", err); }
          })();
        }
        break;
      case "connect_reject":
        if (this.status === "requesting") {
          const rejecterName = this.peers.find(p => p.device_id === msg.from_id)?.device_name ?? "Unknown Device";
          this.setStatus("rejected");
          this.emit('request_rejected', msg.from_id, rejecterName);
          this.targetPeerId = null;
          setTimeout(() => this.setStatus("idle"), 3000);
        }
        break;
      case "sdp_offer":
        if (this.status !== "connecting" || this.targetPeerId !== msg.from_id) {
          console.warn("[WebRTC] Ignored sdp_offer outside of flow");
          return;
        }
        this.targetPeerId = msg.from_id;
        this.setStatus("connecting");
        (async () => {
          try {
            this.connection.init(false);
            const answer = await this.connection.handleOffer(msg.sdp);
            if (answer) this.signaling.send({ type: "sdp_answer", to: msg.from_id, sdp: answer });
          } catch (err) { console.error("[SDP] Handle offer failed:", err); }
        })();
        break;
      case "sdp_answer":
        this.connection.handleAnswer(msg.sdp).catch(err => console.error("[SDP] Handle answer failed:", err));
        break;
      case "ice_candidate":
        this.connection.handleIceCandidate(msg.candidate).catch(err => console.error("[ICE] Add candidate failed:", err));
        break;
    }
  }
}

export const webRTCManager = new WebRTCManager();
