import { EventEmitter } from './EventEmitter';
import { Peer, WSMessage, WelcomeMessage, PeerListMessage, PeerJoinedMessage, PeerLeftMessage } from '@/types/messages';
import { ChatMessage, SystemPayload, TextMessagePayload, ReactionMessagePayload, FileMetaPayload, ChatPayload, LinkPreview } from '@/types/chat';
import { setDeviceName } from '@/lib/device';
import { IndexedDBManager } from './IndexedDBManager';

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
}

const CHUNK_SIZE = 16 * 1024; // 16KB for maximum compatibility
const MAX_BUFFERED_AMOUNT = 1024 * 1024; // 1MB total buffer

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
  private dbManager = new IndexedDBManager();
  private pendingLargeFiles: Map<string, FileMetaPayload> = new Map();
  private incomingFiles: Map<string, { 
    meta: FileMetaPayload, 
    receivedBytes: number, 
    completedBytes: number,
    chunkBuffer: { chunkIndex: number, data: ArrayBuffer }[],
    isPaused?: boolean
  }> = new Map();
  private fileTransferQueue: string[] = []; 
  private senderFileQueue: FileUploadTask[] = [];
  private isProcessingQueue: boolean = false;
  private pendingStreamApprovals: Map<string, (allowed: boolean) => void> = new Map();
  private activeFileStreams: Map<string, FileSystemWritableFileStream> = new Map();

  // Flow Control (Sender-side pause state)
  private remoteTransferPaused: boolean = false;
  private pauseResolver: (() => void) | null = null;

  // Sequential write queues: ensures chunks are written to disk in order,
  // one at a time, preventing multiple concurrent async handlers from
  // accumulating ArrayBuffers in RAM.
  private fileWriteQueues: Map<string, Promise<void>> = new Map();

  constructor() {
    super();
    this.dbManager.init().catch(err => console.error("[IndexedDB] Init failed:", err));

    if (typeof window !== "undefined") {
      const clear = () => this.dbManager.clearAll().catch(() => {});
      
      // Desktop: fires on tab close (most of the time)
      window.addEventListener("beforeunload", clear);
      
      // Mobile: Much more reliable for iOS/Android when app is closed or hidden
      window.addEventListener("pagehide", clear);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          // If we're hidden, we might be killed. 
          // We can't clear here if we want background transfers, 
          // BUT if we're not sent/receiving, it's safer to clear.
          // For now, let's stick to pagehide for true "close".
        }
      });
    }
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


  private cancelSession() {
    this.setStatus("idle");
    this.incomingRequest = null;
    this.targetPeerId = null;
  }

  public sendChatMessage(content: string, linkPreview?: LinkPreview) {
    if (!this.chatChannel || this.chatChannel.readyState !== "open") return null;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const payload: TextMessagePayload = { type: "text_message", id, content, timestamp, linkPreview };
    
    this.chatChannel.send(JSON.stringify(payload));
    
    // Return early local version
    const msg: ChatMessage = { id, type: "text", direction: "sent", content, timestamp, linkPreview };
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
      file: { 
        fileId, 
        name: file.name, 
        size: file.size, 
        mimeType: file.type || "application/octet-stream", 
        status: "sending", 
        progress: 0, 
        objectUrl: null, // Full file stays on disk/memory handle
      }
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
        if (exist) {
          exist.device_name = msg.device_name;
          exist.device_type = msg.device_type;
          exist.is_busy = !!msg.is_busy;
        } else {
          this.peers.push({ 
            device_id: msg.device_id, 
            device_name: msg.device_name, 
            device_type: msg.device_type, 
            is_busy: !!msg.is_busy 
          });
        }
        this.emit("peer_joined", { 
          device_id: msg.device_id, 
          device_name: msg.device_name, 
          device_type: msg.device_type, 
          is_busy: !!msg.is_busy 
        });
        break;
      case "peer_left":
        this.peers = this.peers.filter(p => p.device_id !== msg.device_id);
        this.emit("peer_left", msg.device_id);
        
        // CRITICAL CLEANUP: If our active partner leaves, kill transfers
        if (this.targetPeerId === msg.device_id) {
          this.failAllActiveTransfers("Peer left the chat");
          this.setStatus("idle");
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
          const rejecterName = this.peers.find(p => p.device_id === msg.from_id)?.device_name ?? "Unknown Device";
          this.setStatus("rejected");
          this.emit('request_rejected', msg.from_id, rejecterName);
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
      files.bufferedAmountLowThreshold = 65536;
      const system = this.pc.createDataChannel("system", { ordered: true });

      this.setupChannelListeners(chat, "chat");
      this.setupChannelListeners(files, "files");
      this.setupChannelListeners(system, "system");
    }

    this.pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === "files") {
        channel.binaryType = "arraybuffer";
        channel.bufferedAmountLowThreshold = 65536; // 64KB threshold
      }
      this.setupChannelListeners(channel, channel.label);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.targetPeerId) {
        this.sendWsMessage({ type: "ice_candidate", to: this.targetPeerId, candidate: event.candidate.toJSON() });
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state: ${this.pc?.connectionState}`);
      if (this.pc?.connectionState === "failed" || this.pc?.connectionState === "closed" || this.pc?.connectionState === "disconnected") {
        this.failAllActiveTransfers("Connection lost or peer disconnected");
      }
    };
  }

  private failAllActiveTransfers(reason: string) {
    console.warn(`[WebRTC] Failing all active transfers: ${reason}`);
    
    // 1. Fail incoming transfers
    for (const [fileId, transfer] of this.incomingFiles) {
      this.emit("file_error", fileId, reason);
    }
    this.incomingFiles.clear();
    this.fileTransferQueue = [];
    this.fileWriteQueues.clear();

    // 2. Fail outgoing transfers
    for (const task of this.senderFileQueue) {
      this.emit("file_error", task.fileId, reason);
    }
    this.senderFileQueue = [];
    this.isProcessingQueue = false;
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
    channel.binaryType = "arraybuffer"; // Ensure binaryType is set for all channels
    if (label === "files") channel.bufferedAmountLowThreshold = 65536; // Set for files channel

    channel.onopen = () => {
      if (label === "chat") this.setStatus("connected");
      // bufferedAmountLowThreshold is now set directly, no need to set it here
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
            this.emit("chat_message", { 
              id: payload.id, 
              type: "text", 
              direction: "received", 
              content: payload.content, 
              timestamp: payload.timestamp,
              linkPreview: payload.linkPreview 
            });
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
            file: { 
              fileId: payload.fileId, 
              name: payload.name, 
              size: payload.size, 
              mimeType: payload.mimeType, 
              status: "receiving", 
              progress: 0, 
              objectUrl: null,
              streamingMode: payload.streamingMode
            }
          });
          
          if (!payload.streamingMode) {
            // Small file: Accept automatically
            this.incomingFiles.set(payload.fileId, { meta: payload, receivedBytes: 0, completedBytes: 0, chunkBuffer: [] });
            this.fileTransferQueue.push(payload.fileId);
            this.sendSystemMessage({ type: "stream_ready", fileId: payload.fileId });
          } else {
            // Large file: Store in pending, WAIT for manual approval
            this.pendingLargeFiles.set(payload.fileId, payload);
          }
          break;
        case "typing_start": this.emit("typing_state", true); break;
        case "typing_stop": this.emit("typing_state", false); break;
        case "bye": this.setStatus("left"); this.emit("typing_state", false); break;
        case "stream_ready":
          const resolve = this.pendingStreamApprovals.get(payload.fileId);
          if (resolve) {
            resolve(true);
            this.pendingStreamApprovals.delete(payload.fileId);
          }
          break;
        case "file_rejected":
          console.warn(`[WebRTC] File was rejected by receiver: ${payload.fileId}`);
          this.emit("file_error", payload.fileId, "Rejected by receiver");
          
          const resolveReject = this.pendingStreamApprovals.get(payload.fileId);
          if (resolveReject) {
            resolveReject(false);
            this.pendingStreamApprovals.delete(payload.fileId);
          }
          break;
      }
    } catch { console.error("Failed to parse system message"); }
  }

  private handleFileMessage(event: MessageEvent) {
    if (!(event.data instanceof ArrayBuffer)) return;
    const activeFileId = this.fileTransferQueue[0];
    if (!activeFileId) return;
    const transfer = this.incomingFiles.get(activeFileId);
    if (!transfer) return;

    // Capture data immediately
    const data: ArrayBuffer = event.data;
    
    // ACCURATE PROGRESS: Count bytes, not just chunk increments
    const bytesBefore = transfer.receivedBytes;
    transfer.receivedBytes += data.byteLength;
    
    const chunkIndex = Math.floor(transfer.receivedBytes / CHUNK_SIZE); 
    transfer.chunkBuffer.push({ chunkIndex, data });

    // Emit wire-level progress every 1MB or on completion (smooth UI updates)
    const currentMB = Math.floor(transfer.receivedBytes / (1024 * 1024));
    const previousMB = Math.floor(bytesBefore / (1024 * 1024));
    const isWireComplete = transfer.receivedBytes >= transfer.meta.size;

    if (currentMB > previousMB || isWireComplete) {
      const wireProgress = Math.min(100, Math.round((transfer.receivedBytes / transfer.meta.size) * 100));
      this.emit("file_progress", activeFileId, wireProgress);
    }

    if (isWireComplete) {
      this.fileTransferQueue.shift();
    }

    const BATCH_THRESHOLD = 2 * 1024 * 1024; // 2MB
    const currentBatchSize = transfer.chunkBuffer.length * CHUNK_SIZE; // Fast estimation

    if (currentBatchSize >= BATCH_THRESHOLD || isWireComplete) {
      const batch = [...transfer.chunkBuffer];
      const batchBytes = batch.reduce((sum, item) => sum + item.data.byteLength, 0); // Only run once per 2MB
      transfer.chunkBuffer = [];

      const prevWrite = this.fileWriteQueues.get(activeFileId) ?? Promise.resolve();
      const thisWrite = prevWrite.then(async () => {
        try {
          const stream = this.activeFileStreams.get(activeFileId);
          if (stream) {
            for (const item of batch) await (stream as any).write(item.data);
          } else {
            await this.dbManager.addChunks(activeFileId, batch);
          }
        } catch (err) {
          console.error("[WebRTC] Write failed:", err);
          this.emit("file_error", activeFileId, "Write failed");
          return;
        }
        
        transfer.completedBytes += batchBytes;

        if (transfer.completedBytes >= transfer.meta.size) {
          const stream = this.activeFileStreams.get(activeFileId);
          if (stream) {
            try { await (stream as any).close(); } catch {}
            this.activeFileStreams.delete(activeFileId);
            this.emit("file_complete", activeFileId, "");
          } else {
            this.emit("file_complete", activeFileId, null);
          }
          this.incomingFiles.delete(activeFileId);
          this.fileWriteQueues.delete(activeFileId);
        }
      });
      this.fileWriteQueues.set(activeFileId, thisWrite);
    }
  }


  private async processSenderQueue() {
    if (this.isProcessingQueue || this.senderFileQueue.length === 0) return;
    this.isProcessingQueue = true;
    console.log("[WebRTC] Starting sender queue processing.");

    while (this.senderFileQueue.length > 0) {
      const task = this.senderFileQueue[0];
      if (!task) break;
      
      const totalChunks = Math.ceil(task.file.size / CHUNK_SIZE);
      
      // Any file >= 250MB is considered "large" and requires manual approval/streaming
      const streamingMode = task.file.size >= 250 * 1024 * 1024;

      const meta: FileMetaPayload = { 
        type: "file_meta", 
        fileId: task.fileId, 
        name: task.file.name, 
        size: task.file.size, 
        mimeType: task.file.type || "application/octet-stream", 
        totalChunks,
        streamingMode
      };
      
      if (!this.systemChannel || this.systemChannel.readyState !== "open") {
        console.error(`[WebRTC] System channel not open for ${task.fileId}. State: ${this.systemChannel?.readyState}`);
        this.emit("file_error", task.fileId, "Channel closed");
        this.senderFileQueue.shift();
        continue;
      }
      this.systemChannel.send(JSON.stringify(meta));
      console.log(`[WebRTC] Sent file meta for ${task.fileId}.`);

      // Wait for Receiver to say "Ready"
      console.log(`[WebRTC] Waiting for stream_ready for ${task.fileId}...`);
      const isReady = await new Promise<boolean>((resolve) => {
        this.pendingStreamApprovals.set(task.fileId, resolve);
        // Timeout if no response in 60s
        setTimeout(() => { 
          if (this.pendingStreamApprovals.has(task.fileId)) {
            console.warn(`[WebRTC] Stream ready timeout for ${task.fileId}.`);
            resolve(false); 
          }
        }, 60000);
      });

      if (!isReady) {
        this.emit("file_error", task.fileId, "Receiver declined or timed out");
        this.senderFileQueue.shift();
        continue;
      }

      console.log(`[WebRTC] Starting ZERO-RAM stream for ${task.fileId}`);
      // Set explicit thresholds so bufferedamountlow fires at the right watermark
      const LOW_WATERMARK = 256 * 1024;  // 256 KB: resume sending when buffer drops to this
      const HIGH_WATERMARK = 1024 * 1024; // 1 MB: pause sending when buffer exceeds this
      if (this.fileChannel) {
        this.fileChannel.bufferedAmountLowThreshold = LOW_WATERMARK;
      }

      try {
        let offset = 0;
        let totalSentChunks = 0;
        const CHUNK_SIZE = 16384; 

        while (offset < task.file.size) {
          if (!this.fileChannel || this.fileChannel.readyState !== "open") {
            this.emit("file_error", task.fileId, "Channel closed during transfer");
            return;
          }

          if (this.fileChannel.bufferedAmount >= HIGH_WATERMARK) {
            await new Promise<void>((resolve) => {
              const onLow = () => {
                this.fileChannel?.removeEventListener("bufferedamountlow", onLow);
                resolve();
              };
              this.fileChannel?.addEventListener("bufferedamountlow", onLow);
              setTimeout(onLow, 500); 
            });
          }

          const end = Math.min(offset + CHUNK_SIZE, task.file.size);
          const chunkData = await task.file.slice(offset, end).arrayBuffer();
          this.fileChannel.send(chunkData);
          offset = end; 
          totalSentChunks++;

          // Smooth progress emission every 1MB
          if (totalSentChunks % 64 === 0 || offset >= task.file.size) {
            this.emit("file_progress", task.fileId, Math.min(100, Math.round((offset / task.file.size) * 100)));
          }
          // No setTimeout(0) — the await above yields naturally to the event loop
        }

        this.emit("file_complete", task.fileId, ""); 
        this.remoteTransferPaused = false;
        console.log(`[WebRTC] ZERO-RAM stream complete: ${task.fileId}`);
      } catch (err) {
        console.error("[WebRTC] Stream error:", err);
        this.emit("file_error", task.fileId, "Streaming error");
      }

      this.senderFileQueue.shift();
    }
    this.isProcessingQueue = false;
  }

  /**
   * Retrieves a full file from IndexedDB and returns a temporary ObjectURL.
   * Callers should revoke this URL after use to clear RAM.
   */
  public async getDownloadUrl(fileId: string, mimeType: string): Promise<string> {
    const blob = await this.dbManager.getFileBlob(fileId, mimeType);
    return URL.createObjectURL(blob);
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

  private cleanupConnection() {
    if (this.chatChannel) this.chatChannel.close(); this.chatChannel = null;
    if (this.fileChannel) this.fileChannel.close(); this.fileChannel = null;
    if (this.systemChannel) this.systemChannel.close(); this.systemChannel = null;
    if (this.pc) this.pc.close(); this.pc = null;
    
    this.fileTransferQueue = [];
    this.senderFileQueue = [];
    this.isProcessingQueue = false;
    this.pendingStreamApprovals.clear();
    this.activeFileStreams.clear();
    
    this.setStatus("idle");
    this.incomingRequest = null;
    this.targetPeerId = null;
    this.activeChatPeerId = null;

    // Wipe cached blobs from IndexedDB when session ends
    this.dbManager.clearAll().catch(e => console.error("[IndexedDB] Clear failed", e));
  }

  public async acceptLargeFileStream(fileId: string) {
    const meta = this.pendingLargeFiles.get(fileId);
    if (!meta) return;

    try {
      // @ts-ignore - FALLBACK: If browser doesn't support streaming, we use IndexedDB storage
      const hasPicker = typeof window !== 'undefined' && !!window.showSaveFilePicker;
      
      if (hasPicker) {
        // @ts-ignore
        const handle = await window.showSaveFilePicker({ suggestedName: meta.name });
        const writable = await (handle as any).createWritable();
        this.activeFileStreams.set(fileId, writable);
        console.log(`[WebRTC] Streaming supported, using file picker: ${fileId}`);
      } else {
        console.log(`[WebRTC] Streaming not supported, falling back to IndexedDB: ${fileId}`);
      }
      
      // Now move from pending to active
      this.incomingFiles.set(fileId, { meta, receivedBytes: 0, completedBytes: 0, chunkBuffer: [] });
      this.fileTransferQueue.push(fileId);
      this.pendingLargeFiles.delete(fileId);

      this.sendSystemMessage({ type: "stream_ready", fileId });
      this.emit("file_progress", fileId, 1); // Trigger immediate UI update to hide 'Accept'
      console.log(`[WebRTC] Large file accepted and ready: ${fileId}`);
    } catch (err) {
      console.error("[WebRTC] Failed to initialize file transfer:", err);
      // If the user cancels the save dialog or it fails, reject the transfer
      // so the UI and the sender aren't stuck waiting forever.
      this.rejectFile(fileId);
    }
  }

  public rejectFile(fileId: string) {
    this.pendingLargeFiles.delete(fileId);
    this.sendSystemMessage({ type: "file_rejected", fileId });
    this.emit("file_error", fileId, "Rejected by you");
  }
}

// Global generic instance so we keep the exact same connection across Next Router / React unmounts
export const webRTCManager = new WebRTCManager();
