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
  'file_complete': [fileId: string, objectUrl: string];
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
  private incomingFiles: Map<string, { meta: FileMetaPayload, chunks: ArrayBuffer[], received: number }> = new Map();
  private fileTransferQueue: string[] = []; 
  private senderFileQueue: FileUploadTask[] = [];
  private isProcessingQueue: boolean = false;
  private pendingStreamApprovals: Map<string, (allowed: boolean) => void> = new Map();
  private activeFileStreams: Map<string, FileSystemWritableFileStream> = new Map();

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

  public async acceptLargeFileStream(fileId: string, writableStream: any) {
    const transfer = this.incomingFiles.get(fileId);
    if (!transfer || !transfer.meta.streamingMode) {
      console.warn(`[WebRTC] Attempted to accept stream for non-streaming or unknown file: ${fileId}`);
      return;
    }
    console.log(`[WebRTC] Accepting large file stream for ${fileId}`);
    try {
      // For FileSystemWritableFileStream, we can use it directly or get a writer
      const writer = writableStream.getWriter ? writableStream.getWriter() : writableStream;
      this.activeFileStreams.set(fileId, writer);
      this.sendSystemMessage({ type: "stream_ready", fileId });
    } catch (err) {
      console.error("[WebRTC] Failed to initialize stream writer:", err);
      this.emit("file_error", fileId, "Stream initialization failed");
    }
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
    const objectUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
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
        objectUrl 
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
            this.incomingFiles.set(payload.fileId, { meta: payload, chunks: [], received: 0 });
            this.fileTransferQueue.push(payload.fileId);
            this.sendSystemMessage({ type: "stream_ready", fileId: payload.fileId });
          } else {
            // Large file: UI will call acceptLargeFileStream after user picks a location
            this.incomingFiles.set(payload.fileId, { meta: payload, chunks: [], received: 0 });
            this.fileTransferQueue.push(payload.fileId);
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
      }
    } catch { console.error("Failed to parse system message"); }
  }

  private async handleFileMessage(event: MessageEvent) {
    if (!(event.data instanceof ArrayBuffer)) return;
    const activeFileId = this.fileTransferQueue[0];
    if (!activeFileId) return;
    const transfer = this.incomingFiles.get(activeFileId);
    if (!transfer) return;

    const stream = this.activeFileStreams.get(activeFileId);

    if (stream) {
      // Disk Streaming Mode
      try {
        await (stream as any).write(event.data);
      } catch (err) {
        console.error("[WebRTC] Disk write failed:", err);
        this.emit("file_error", activeFileId, "Disk write failed");
      }
    } else {
      // RAM Accumulation Mode
      transfer.chunks.push(event.data);
    }

    transfer.received += 1;
    const progress = Math.round((transfer.received / transfer.meta.totalChunks) * 100);

    if (progress % 5 === 0 || transfer.received === transfer.meta.totalChunks) {
      this.emit("file_progress", activeFileId, progress);
    }

    if (transfer.received === transfer.meta.totalChunks) {
      console.log(`[WebRTC] Receiver complete: ${activeFileId}`);
      if (stream) {
        try {
          await (stream as any).close();
          this.activeFileStreams.delete(activeFileId);
          this.emit("file_complete", activeFileId, ""); // No URL for disk files
        } catch {}
      } else {
        try {
          const blob = new Blob(transfer.chunks, { type: transfer.meta.mimeType });
          const objectUrl = URL.createObjectURL(blob);
          this.emit("file_complete", activeFileId, objectUrl);
        } catch (err) {
          this.emit("file_error", activeFileId, "Assembly failed");
        }
      }
      this.incomingFiles.delete(activeFileId);
      this.fileTransferQueue.shift();
    }
  }


  private async processSenderQueue() {
    if (this.isProcessingQueue || this.senderFileQueue.length === 0) return;
    this.isProcessingQueue = true;
    console.log("[WebRTC] Starting sender queue processing.");

    while (this.senderFileQueue.length > 0) {
      const task = this.senderFileQueue[0];
      if (!task) break;
      console.log(`[WebRTC] Processing file: ${task.file.name} (${task.fileId})`);

      const totalChunks = Math.ceil(task.file.size / CHUNK_SIZE);
      const streamingMode = task.file.size >= 500 * 1024 * 1024; // 500MB Threshold

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

      console.log(`[WebRTC] Starting stream for ${task.fileId}`);
      const reader = task.file.stream().getReader();
      try {
        let totalSentChunks = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          let offset = 0;
          while (offset < value.byteLength) {
            if (!this.fileChannel || this.fileChannel.readyState !== "open") {
              console.error(`[WebRTC] File channel not open during transfer for ${task.fileId}. State: ${this.fileChannel?.readyState}`);
              this.emit("file_error", task.fileId, "Channel closed during transfer");
              return;
            }

            // Robust Flow Control
            if (this.fileChannel.bufferedAmount > this.fileChannel.bufferedAmountLowThreshold) {
              console.log(`[WebRTC] Buffered amount high for ${task.fileId}. Waiting...`);
              await new Promise<void>((resolve) => {
                const onLow = () => {
                  this.fileChannel?.removeEventListener("bufferedamountlow", onLow);
                  resolve();
                };
                this.fileChannel?.addEventListener("bufferedamountlow", onLow);
                setTimeout(onLow, 200); // 200ms fallback
              });
              console.log(`[WebRTC] Buffered amount low for ${task.fileId}. Resuming.`);
            }

            const end = Math.min(offset + CHUNK_SIZE, value.byteLength);
            // Use subarray for zero-copy slicing, most browsers support sending it directly
            const subChunk = value.subarray(offset, end);
            
            try {
              // Create a fresh copy to ensure no shared-buffer issues or oversized native sends
              const finalData = new Uint8Array(subChunk);
              this.fileChannel.send(finalData);
              
              totalSentChunks++;
              offset += CHUNK_SIZE;

              // Progress update
              if (totalSentChunks % 25 === 0 || totalSentChunks >= totalChunks) {
                this.emit("file_progress", task.fileId, Math.min(100, Math.round((totalSentChunks / totalChunks) * 100)));
              }

              // Yield to event loop to prevent "Failure to send data" (SCTP congestion)
              if (totalSentChunks % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 5)); // Slightly longer delay
              }
            } catch (err) {
              console.error("[WebRTC] Native send failure:", err);
              this.emit("file_error", task.fileId, "Send failed");
              return;
            }
          }
        }

        // We don't have a Blob URL for our own sent file in streaming mode 
        // because we never held it all in memory.
        this.emit("file_complete", task.fileId, ""); 
        console.log(`[WebRTC] Stream complete: ${task.fileId}`);
      } catch (err) {
        console.error("[WebRTC] Stream error:", err);
        this.emit("file_error", task.fileId, "Streaming error");
      } finally {
        reader.releaseLock();
      }

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
    this.pendingStreamApprovals.clear();
    this.activeFileStreams.clear();
    
    this.setStatus("idle");
    this.incomingRequest = null;
    this.targetPeerId = null;
    this.activeChatPeerId = null;
  }
}

// Global generic instance so we keep the exact same connection across Next Router / React unmounts
export const webRTCManager = new WebRTCManager();
