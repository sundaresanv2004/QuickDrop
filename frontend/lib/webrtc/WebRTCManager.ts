import { EventEmitter } from './EventEmitter';
import { Peer, WSMessage, WelcomeMessage, PeerListMessage, PeerJoinedMessage, PeerLeftMessage } from '@/types/messages';
import { ChatMessage, SystemPayload, TextMessagePayload, ReactionMessagePayload, FileMetaPayload, ChatPayload } from '@/types/chat';
import { setDeviceName } from '@/lib/device';

export type ConnectionStatus =
  | "idle"
  | "requesting"
  | "receiving"
  | "connecting"
  | "connected"
  | "rejected"
  | "disconnected"
  | "left";

interface FileUploadTask {
  file: File;
  fileId: string;
}

export interface WebRTCEvents extends Record<string, any[]> {
  'ws_status': [connected: boolean];
  'my_info_updated': [name: string, type: string];
  'status': [status: ConnectionStatus];
  'incoming_request': [peerId: string, peerName: string];
  'peer_list': [peers: Peer[]];
  'peer_joined': [peer: Peer];
  'peer_left': [peerId: string];
  'chat_message': [message: ChatMessage];
  'reaction': [messageId: string, emoji: string, fromId: string];
  'system_message': [payload: SystemPayload];
  'file_progress': [fileId: string, progress: number];
  'file_complete': [fileId: string, objectUrl: string];
  'file_error': [fileId: string, error: string];
  'typing_state': [isTyping: boolean];
}

const CHUNK_SIZE = 64 * 1024;
const MAX_BUFFERED_AMOUNT = 1024 * 1024;

export class WebRTCManager extends EventEmitter<WebRTCEvents> {
  // Config & State
  private wsUrl: string = '';
  public myDeviceId: string | null = null;
  public myDeviceName: string = 'Unknown Device';
  public myDeviceType: string = 'unknown';
  
  public status: ConnectionStatus = "idle";
  public peers: Peer[] = [];
  public targetPeerId: string | null = null;
  public incomingRequest: { peerId: string; peerName: string } | null = null;
  public activeChatPeerId: string | null = null;

  // Websocket
  private ws: WebSocket | null = null;
  public wsConnected: boolean = false;
  private wsReconnectTimeout: NodeJS.Timeout | null = null;

  // WebRTC
  private pc: RTCPeerConnection | null = null;
  private chatChannel: RTCDataChannel | null = null;
  private fileChannel: RTCDataChannel | null = null;
  private systemChannel: RTCDataChannel | null = null;
  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private cleanupTimeout: NodeJS.Timeout | null = null;

  // File Transfer State
  private incomingFiles: Map<string, { meta: FileMetaPayload, chunks: ArrayBuffer[], received: number }> = new Map();
  private fileTransferQueue: string[] = []; 
  private senderFileQueue: FileUploadTask[] = [];
  private isProcessingQueue: boolean = false;

  constructor() {
    super();
  }

  // --- PUBLIC API ---

  public initialize(wsUrl: string, name: string, type: string) {
    this.wsUrl = wsUrl;
    this.myDeviceName = name;
    this.myDeviceType = type;
    this.emit('my_info_updated', this.myDeviceName, this.myDeviceType);
    this.connectWs();
  }

  public updateDeviceName(name: string) {
    const savedName = setDeviceName(name);
    this.myDeviceName = savedName;
    this.emit('my_info_updated', this.myDeviceName, this.myDeviceType);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendWsMessage({ type: "register", device_name: savedName, device_type: this.myDeviceType });
    }
  }

  public setActiveChatPeerId(peerId: string | null) {
    console.log("[WebRTC] Setting active session:", peerId);
    if (this.cleanupTimeout) {
      console.log("[WebRTC] Cancelling pending cleanup for session:", peerId);
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = null;
    }
    this.activeChatPeerId = peerId;
  }

  public destroy() {
    this.cleanupConnection();
    if (this.wsReconnectTimeout) clearTimeout(this.wsReconnectTimeout);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.removeAllListeners();
  }

  // --- ACTIONS ---

  private setStatus(newStatus: ConnectionStatus) {
    const oldStatus = this.status;
    this.status = newStatus;
    this.emit('status', newStatus);

    // Automatic Busy Status Reporting
    const wasBusy = ["connecting", "connected", "requesting", "receiving"].includes(oldStatus);
    const isBusy = ["connecting", "connected", "requesting", "receiving"].includes(newStatus);
    
    if (wasBusy !== isBusy) {
      this.broadcastBusyStatus(isBusy);
    }
  }

  public broadcastBusyStatus(isBusy: boolean) {
    console.log("[WebRTC] Broadcasting busy status:", isBusy);
    this.sendWsMessage({ type: "update_status", is_busy: isBusy });
  }

  public sendConnectRequest(peerId: string) {
    if (this.status !== "idle") return;
    this.targetPeerId = peerId;
    this.setStatus("requesting");
    this.sendWsMessage({ type: "connect_request", to: peerId });
  }

  public cancelRequest() {
    if (this.status !== "requesting" || !this.targetPeerId) return;
    this.sendWsMessage({ type: "connect_cancel", to: this.targetPeerId });
    this.cancelSession();
  }

  public acceptRequest() {
    if (this.status !== "receiving" || !this.incomingRequest) return;
    this.targetPeerId = this.incomingRequest.peerId;
    const peerId = this.incomingRequest.peerId; // save locally
    this.setStatus("connecting");
    this.sendWsMessage({ type: "connect_accept", to: peerId });
    this.incomingRequest = null;
  }

  public rejectRequest() {
    if (this.status !== "receiving" || !this.incomingRequest) return;
    this.sendWsMessage({ type: "connect_reject", to: this.incomingRequest.peerId });
    this.cancelSession();
  }

  public resetConnection(sessionIdToCleanup?: string) {
    if (this.cleanupTimeout) clearTimeout(this.cleanupTimeout);

    // If a specific session ID is provided, it's likely a React unmount cleanup.
    // We debounce this to handle React 18 Strict Mode remounts.
    if (sessionIdToCleanup) {
      console.log("[WebRTC] Scheduling cleanup for session:", sessionIdToCleanup);
      this.cleanupTimeout = setTimeout(() => {
        console.log("[WebRTC] Executing delayed cleanup for session:", sessionIdToCleanup);
        this.cleanupConnection();
        this.cleanupTimeout = null;
      }, 1000); // 1 second buffer is very safe for Strict Mode
      return;
    }

    // Manual / Immediate cleanup (e.g. clicking "Leave" or "Cancel")
    console.log("[WebRTC] Immediate connection reset requested");
    this.cleanupConnection();
  }
  
  private cancelSession() {
    this.setStatus("idle");
    this.incomingRequest = null;
    this.targetPeerId = null;
  }

  public sendChatMessage(content: string) {
    if (!this.chatChannel || this.chatChannel.readyState !== "open") return null;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const payload: TextMessagePayload = { type: "text_message", id, content, timestamp };
    
    this.chatChannel.send(JSON.stringify(payload));
    
    // Return early local version
    const msg: ChatMessage = { id, type: "text", direction: "sent", content, timestamp };
    this.emit("chat_message", msg);
    return msg;
  }

  public sendReaction(messageId: string, emoji: string) {
    if (!this.chatChannel || this.chatChannel.readyState !== "open" || !this.myDeviceId) return;
    const payload: ReactionMessagePayload = { type: "reaction_message", messageId, emoji, fromId: this.myDeviceId };
    this.chatChannel.send(JSON.stringify(payload));
    this.emit("reaction", messageId, emoji, this.myDeviceId);
  }

  public sendSystemMessage(payload: SystemPayload) {
    if (!this.systemChannel || this.systemChannel.readyState !== "open") return;
    this.systemChannel.send(JSON.stringify(payload));
  }

  public async sendFile(file: File) {
    if (!this.fileChannel || this.fileChannel.readyState !== "open") return;
    const fileId = crypto.randomUUID();
    this.senderFileQueue.push({ file, fileId });
    
    // Announce to UI
    const fileMessage: ChatMessage = {
      id: fileId,
      type: "file",
      direction: "sent",
      timestamp: Date.now(),
      file: { fileId, name: file.name, size: file.size, mimeType: file.type || "application/octet-stream", status: "sending", progress: 0, objectUrl: null }
    };
    this.emit("chat_message", fileMessage);

    this.processSenderQueue();
    return fileId;
  }

  // --- INTERNAL: WEBSOCKET ---

  private connectWs() {
    if (!this.wsUrl) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    
    this.ws = new WebSocket(this.wsUrl);
    
    this.ws.onopen = () => {
      this.wsConnected = true;
      this.emit('ws_status', true);
      if (this.wsReconnectTimeout) { clearTimeout(this.wsReconnectTimeout); this.wsReconnectTimeout = null; }
      this.sendWsMessage({ type: "register", device_name: this.myDeviceName, device_type: this.myDeviceType });
    };

    this.ws.onmessage = (event) => this.handleWsMessage(JSON.parse(event.data));

    this.ws.onclose = () => {
      this.ws = null;
      this.wsConnected = false;
      this.emit('ws_status', false);
      this.wsReconnectTimeout = setTimeout(() => this.connectWs(), 2500);
    };

    this.ws.onerror = (e) => console.error("WS Error", e);
  }

  private sendWsMessage(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleWsMessage(msg: WSMessage) {
    switch (msg.type) {
      case "welcome":
        this.myDeviceId = msg.device_id;
        break;
      case "peer_list":
        this.peers = msg.peers.filter(p => p.device_id !== this.myDeviceId);
        this.emit("peer_list", this.peers);
        break;
      case "peer_joined":
        if (msg.device_id === this.myDeviceId) break;
        const exist = this.peers.find(p => p.device_id === msg.device_id);
        if (exist) { exist.device_name = msg.device_name; exist.device_type = msg.device_type; exist.is_busy = !!msg.is_busy; }
        else { this.peers.push({ device_id: msg.device_id, device_name: msg.device_name, device_type: msg.device_type, is_busy: !!msg.is_busy }); }
        this.emit("peer_joined", { device_id: msg.device_id, device_name: msg.device_name, device_type: msg.device_type, is_busy: !!msg.is_busy });
        break;
      case "peer_left":
        this.peers = this.peers.filter(p => p.device_id !== msg.device_id);
        this.emit("peer_left", msg.device_id);
        if (this.activeChatPeerId === msg.device_id) {
          this.cleanupConnection();
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
        const peerName = this.peers.find(p => p.device_id === msg.from_id)?.device_name ?? "Unknown Device";
        this.incomingRequest = { peerId: msg.from_id, peerName };
        this.setStatus("receiving");
        this.emit("incoming_request", msg.from_id, peerName);
        break;
      case "connect_cancel":
        if (this.status === "receiving" && this.incomingRequest?.peerId === msg.from_id) {
          this.cancelSession();
        }
        break;
      case "connect_accept":
        if (this.status === "requesting") {
          this.setStatus("connecting");
          this.initPeerConnection(true);
          (async () => {
            try {
              if(!this.pc) return;
              const offer = await this.pc.createOffer();
              await this.pc.setLocalDescription(offer);
              this.sendWsMessage({ type: "sdp_offer", to: msg.from_id, sdp: offer });
            } catch (err) { console.error("[SDP] Failed to create offer:", err); }
          })();
        }
        break;
      case "connect_reject":
        if (this.status === "requesting") {
          this.setStatus("rejected");
          this.targetPeerId = null;
          setTimeout(() => this.setStatus("idle"), 3000);
        }
        break;
      case "sdp_offer":
        this.targetPeerId = msg.from_id;
        this.setStatus("connecting");
        (async () => {
          try {
            this.initPeerConnection(false);
            if(!this.pc) return;
            await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            await this.flushIceCandidates();
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            this.sendWsMessage({ type: "sdp_answer", to: msg.from_id, sdp: answer });
          } catch (err) { console.error("[SDP] Failed to handle offer:", err); }
        })();
        break;
      case "sdp_answer":
        (async () => {
          try {
            if(!this.pc) return;
            await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            await this.flushIceCandidates();
          } catch (err) { console.error("[SDP] Failed to set remote description:", err); }
        })();
        break;
      case "ice_candidate":
        (async () => {
          try {
            if (!this.pc) return;
            if (!this.pc.remoteDescription) {
              this.iceCandidateQueue.push(msg.candidate);
              return;
            }
            await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (err) { console.error("[ICE] Failed to add candidate:", err); }
        })();
        break;
    }
  }

  // --- INTERNAL: WEBRTC ---

  private initPeerConnection(isInitiator: boolean) {
    this.pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] });

    if (isInitiator) {
      const chat = this.pc.createDataChannel("chat", { ordered: true });
      const files = this.pc.createDataChannel("files", { ordered: true });
      files.binaryType = "arraybuffer";
      const system = this.pc.createDataChannel("system", { ordered: true });

      this.setupChannelListeners(chat, "chat");
      this.setupChannelListeners(files, "files");
      this.setupChannelListeners(system, "system");
    }

    this.pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === "files") channel.binaryType = "arraybuffer";
      this.setupChannelListeners(channel, channel.label);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.targetPeerId) {
        this.sendWsMessage({ type: "ice_candidate", to: this.targetPeerId, candidate: event.candidate.toJSON() });
      }
    };
  }

  private async flushIceCandidates() {
    if (!this.pc) return;
    const queue = this.iceCandidateQueue;
    if (queue.length === 0) return;
    for (const candidate of queue) {
      try { await this.pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (err) { console.error("[ICE] Failed to add queued candidate:", err); }
    }
    this.iceCandidateQueue = [];
  }

  private setupChannelListeners(channel: RTCDataChannel, label: string) {
    if (label === "chat") this.chatChannel = channel;
    if (label === "files") this.fileChannel = channel;
    if (label === "system") this.systemChannel = channel;

    channel.onopen = () => {
      if (label === "chat") this.setStatus("connected");
    };

    channel.onerror = (err: any) => {
      const msg = err.error?.message || err.message || "Unknown error";
      console.error(`[DC] ${label} error:`, msg, err);
    };

    channel.onmessage = (event) => {
      if (label === "chat") {
        try {
          const payload: ChatPayload = JSON.parse(event.data);
          if (payload.type === "text_message") {
            this.emit("chat_message", { id: payload.id, type: "text", direction: "received", content: payload.content, timestamp: payload.timestamp });
          } else if (payload.type === "reaction_message") {
            this.emit("reaction", payload.messageId, payload.emoji, payload.fromId);
          }
        } catch { console.error("Failed to parse chat message"); }
      }
      if (label === "files") this.handleFileMessage(event);
      if (label === "system") this.handleSystemMessage(event.data as string);
    };
  }

  private handleSystemMessage(raw: string) {
    try {
      const payload: SystemPayload = JSON.parse(raw);
      this.emit("system_message", payload);
      switch (payload.type) {
        case "file_meta":
          this.emit("chat_message", { id: payload.fileId, type: "file", direction: "received", timestamp: Date.now(),
            file: { fileId: payload.fileId, name: payload.name, size: payload.size, mimeType: payload.mimeType, status: "receiving", progress: 0, objectUrl: null }
          });
          this.incomingFiles.set(payload.fileId, { meta: payload, chunks: [], received: 0 });
          this.fileTransferQueue.push(payload.fileId);
          break;
        case "typing_start": this.emit("typing_state", true); break;
        case "typing_stop": this.emit("typing_state", false); break;
        case "bye": this.setStatus("left"); this.emit("typing_state", false); break;
      }
    } catch { console.error("Failed to parse system message"); }
  }

  private handleFileMessage(event: MessageEvent) {
    if (!(event.data instanceof ArrayBuffer)) return;
    const activeFileId = this.fileTransferQueue[0];
    if (!activeFileId) return;
    const transfer = this.incomingFiles.get(activeFileId);
    if (!transfer) return;

    transfer.chunks.push(event.data);
    transfer.received += 1;
    const progress = Math.round((transfer.received / transfer.meta.totalChunks) * 100);

    if (progress % 5 === 0 || transfer.received === transfer.meta.totalChunks) {
      this.emit("file_progress", activeFileId, progress);
    }

    if (transfer.received === transfer.meta.totalChunks) {
      try {
        const blob = new Blob(transfer.chunks, { type: transfer.meta.mimeType });
        const objectUrl = URL.createObjectURL(blob);
        this.emit("file_complete", activeFileId, objectUrl);
      } catch (err) {
        this.emit("file_error", activeFileId, "Assembly failed");
      }
      this.incomingFiles.delete(activeFileId);
      this.fileTransferQueue.shift();
    }
  }

  private async processSenderQueue() {
    if (this.isProcessingQueue || this.senderFileQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.senderFileQueue.length > 0) {
      const task = this.senderFileQueue[0];
      if (!task) break;

      const totalChunks = Math.ceil(task.file.size / CHUNK_SIZE);
      const meta: FileMetaPayload = { type: "file_meta", fileId: task.fileId, name: task.file.name, size: task.file.size, mimeType: task.file.type || "application/octet-stream", totalChunks };
      
      if (!this.systemChannel || this.systemChannel.readyState !== "open") {
        this.emit("file_error", task.fileId, "Channel closed");
        this.senderFileQueue.shift();
        continue;
      }
      this.systemChannel.send(JSON.stringify(meta));

      const arrayBuffer = await task.file.arrayBuffer();
      let offset = 0, chunkIndex = 0;

      while (offset < arrayBuffer.byteLength) {
        if (!this.fileChannel || this.fileChannel.readyState !== "open") {
          this.emit("file_error", task.fileId, "Channel closed during transfer");
          break;
        }

        if (this.fileChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          await new Promise<void>((resolve) => {
            const check = () => (this.fileChannel && this.fileChannel.bufferedAmount <= MAX_BUFFERED_AMOUNT) ? resolve() : setTimeout(check, 50);
            check();
          });
        }

        const end = Math.min(offset + CHUNK_SIZE, arrayBuffer.byteLength);
        try { this.fileChannel.send(arrayBuffer.slice(offset, end)); } 
        catch { this.emit("file_error", task.fileId, "Send failed"); break; }

        offset += CHUNK_SIZE;
        chunkIndex += 1;
        this.emit("file_progress", task.fileId, Math.round((chunkIndex / totalChunks) * 100));
      }

      try {
        const objectUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: task.file.type }));
        this.emit("file_complete", task.fileId, objectUrl);
      } catch {}

      this.senderFileQueue.shift();
    }
    this.isProcessingQueue = false;
  }

  private cleanupConnection() {
    if (this.chatChannel) this.chatChannel.close(); this.chatChannel = null;
    if (this.fileChannel) this.fileChannel.close(); this.fileChannel = null;
    if (this.systemChannel) this.systemChannel.close(); this.systemChannel = null;
    if (this.pc) this.pc.close(); this.pc = null;
    
    this.fileTransferQueue = [];
    this.senderFileQueue = [];
    this.isProcessingQueue = false;
    
    this.setStatus("idle");
    this.incomingRequest = null;
    this.targetPeerId = null;
    this.activeChatPeerId = null;
  }
}

// Global generic instance so we keep the exact same connection across Next Router / React unmounts
export const webRTCManager = new WebRTCManager();
