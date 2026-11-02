import { EventEmitter } from './EventEmitter';
import { PairErrorReason, Peer, RoomInfo, WSMessage } from '@/types/messages';
import { ChatMessage, FileInfo, SystemPayload, LinkPreview } from '@/types/chat';
import { setDeviceName } from '@/lib/device';
import { explainConnectionFailure } from '@/lib/diagnostics/connection-log';
import { SignalingClient } from './SignalingClient';
import { ConnectionController } from './ConnectionController';
import { ConnectionWatchdog } from './ConnectionWatchdog';
import { ChatTransferManager } from './ChatTransferManager';
import { FileTransferEngine } from '@/lib/transfer/FileTransferEngine';

const REQUIRED_CHANNELS = ["chat", "files", "system"];
const BUSY_STATUSES: ConnectionStatus[] = ["connecting", "connected", "reconnecting", "requesting", "receiving"];

export type ConnectionStatus =
  | "idle"
  | "requesting"
  | "receiving"
  | "connecting"
  | "connected"
  | "reconnecting"
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
  'file_update': [fileId: string, changes: Partial<FileInfo>];
  'file_notice': [message: string];
  'typing_state': [isTyping: boolean];
  'room_info': [room: RoomInfo | null];
  'pair_link': [token: string, expiresInSeconds: number];
  'pair_joined': [peer: Peer];
  'pair_error': [reason: PairErrorReason];
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
  private channels = new Map<string, RTCDataChannel>();
  private openChannels = new Set<string>();
  private pendingPairToken: string | null = null;

  // Sub-Managers
  private signaling: SignalingClient;
  private connection: ConnectionController;
  private watchdog: ConnectionWatchdog;
  private chatManager: ChatTransferManager;
  private fileEngine: FileTransferEngine;

  constructor() {
    super();

    this.watchdog = new ConnectionWatchdog({
      onConnectFailed: () => {
        const message = explainConnectionFailure(this.connection.getLog());
        this.cleanupConnection();
        this.emit('connection_error', message);
      },
      onReconnecting: () => this.setStatus("reconnecting"),
      onRestartIce: () => this.restartIce(),
      onRecovered: () => {
        // A rebuilt connection isn't usable until its channels open, which finishes recovery.
        if (!this.allChannelsOpen()) return false;
        this.setStatus("connected");
      },
      onConnectionLost: () => {
        this.fileEngine.failAllActiveTransfers("Connection lost");
        this.setStatus("disconnected");
      },
    });

    // 1. Signaling
    this.signaling = new SignalingClient(
      (connected) => {
        this.emit('ws_status', connected);
        if (connected) this.watchdog.signalingRestored();
      },
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
        this.watchdog.handleState(state);
      },
      (channel, label) => this.attachChannel(channel, label)
    );

    // 3. Chat Transfer
    this.chatManager = new ChatTransferManager(
      () => this.myDeviceId,
      (msg) => this.emit('chat_message', msg),
      (messageId, emoji, fromId) => this.emit('reaction', messageId, emoji, fromId)
    );

    // 4. File Transfer
    this.fileEngine = new FileTransferEngine({
      onMessage: (msg) => this.emit('chat_message', msg),
      onUpdate: (fileId, changes) => this.emit('file_update', fileId, changes),
      onNotice: (message) => this.emit('file_notice', message),
    });
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

    const wasBusy = BUSY_STATUSES.includes(oldStatus);
    const isBusy = BUSY_STATUSES.includes(newStatus);

    if (wasBusy !== isBusy) {
      this.broadcastBusyStatus(isBusy);
    }
  }

  public broadcastBusyStatus(isBusy: boolean) {
    this.signaling.send({ type: "update_status", is_busy: isBusy });
  }

  private allChannelsOpen() {
    return REQUIRED_CHANNELS.every((name) => this.openChannels.has(name));
  }

  private attachChannel(channel: RTCDataChannel, label: string) {
    this.channels.set(label, channel);
    this.openChannels.delete(label);

    if (label === "chat") {
      this.chatManager.setChannel(channel);
    } else if (label === "files" || label === "system") {
      this.fileEngine.setChannels(this.channels.get("files") ?? null, this.channels.get("system") ?? null);
      if (label === "system") channel.onmessage = (event) => this.handleSystemMessage(event.data);
    }

    const markOpen = () => {
      if (this.channels.get(label) !== channel) return;
      this.openChannels.add(label);
      if (!this.allChannelsOpen()) return;

      if (this.status === "connecting" || this.status === "reconnecting") {
        this.watchdog.channelsReady();
        this.setStatus("connected");
      }
      this.fileEngine.handleChannelsReady(this.connection.maxMessageBytes);
    };
    // A channel from the other device can already be open by the time it reaches us.
    if (channel.readyState === "open") markOpen();
    else channel.addEventListener("open", markOpen, { once: true });

    // A channel can die for good during a long outage, which an ICE restart can't repair.
    channel.addEventListener("close", () => {
      if (this.channels.get(label) !== channel) return;
      this.openChannels.delete(label);
      if (this.status === "connected" || this.status === "reconnecting") this.watchdog.handleState("failed");
    });
  }

  private async startOffer(peerId: string, rebuild = false) {
    this.connection.init(true);
    try {
      const offer = await this.connection.createOffer();
      if (offer) this.signaling.send({ type: "sdp_offer", to: peerId, sdp: offer, rebuild });
    } catch (err) { console.error("[SDP] Offer failed:", err); }
  }

  // Only the original offerer restarts, so the two devices never send competing offers.
  private async restartIce() {
    const peerId = this.targetPeerId;
    if (!peerId || !this.connection.isInitiator) return;

    if (!this.allChannelsOpen()) {
      console.info("[WebRTC] Channels closed, rebuilding the connection");
      this.openChannels.clear();
      void this.startOffer(peerId, true);
      return;
    }
    try {
      const offer = await this.connection.restartIce();
      if (offer) this.signaling.send({ type: "sdp_offer", to: peerId, sdp: offer });
    } catch (err) { console.error("[ICE] Restart failed:", err); }
  }

  private async answerOffer(peerId: string, sdp: RTCSessionDescriptionInit) {
    try {
      const answer = await this.connection.handleOffer(sdp);
      if (answer) this.signaling.send({ type: "sdp_answer", to: peerId, sdp: answer });
    } catch (err) { console.error("[SDP] Handle offer failed:", err); }
  }

  public createPairLink() {
    this.signaling.send({ type: "create_pair_link" });
  }

  public cancelPairLink() {
    this.signaling.send({ type: "cancel_pair_link" });
  }

  // A link can open before signaling connects, so it waits for the welcome if needed.
  public joinPairLink(token: string) {
    if (this.myDeviceId && this.signaling.wsConnected) {
      this.signaling.send({ type: "join_pair_link", token });
    } else {
      this.pendingPairToken = token;
    }
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
    this.watchdog.startConnecting();
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
    const channel = this.channels.get("system");
    if (channel?.readyState === "open") channel.send(JSON.stringify(payload));
  }

  public sendFile(file: File) {
    return this.fileEngine.sendFile(file);
  }

  public acceptFile(fileId: string) {
    return this.fileEngine.acceptFile(fileId);
  }

  public declineFile(fileId: string) {
    this.fileEngine.declineFile(fileId);
  }

  public cancelTransfer(fileId: string) {
    this.fileEngine.cancelTransfer(fileId);
  }

  public getReceivedFile(fileId: string) {
    return this.fileEngine.getReceivedFile(fileId);
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
    this.watchdog.stop();
    this.chatManager.close();
    this.fileEngine.cleanup();
    this.connection.close();
    this.channels.clear();
    this.openChannels.clear();

    this.setStatus("idle");
    this.incomingRequest = null;
    this.targetPeerId = null;
    this.activeChatPeerId = null;
  }

  private handleSystemMessage(raw: string) {
    try {
      const payload: SystemPayload = JSON.parse(raw);
      this.emit("system_message", payload);

      if (this.fileEngine.handleControlMessage(payload)) return;

      switch (payload.type) {
        case "typing_start": this.emit("typing_state", true); break;
        case "typing_stop": this.emit("typing_state", false); break;
        case "bye":
          this.watchdog.stop();
          this.fileEngine.failAllActiveTransfers("They left the chat");
          this.setStatus("left");
          this.emit("typing_state", false);
          break;
      }
    } catch { console.error("Failed to parse system message"); }
  }

  private handleWsMessage(msg: WSMessage) {
    switch (msg.type) {
      case "welcome":
        this.myDeviceId = msg.device_id;
        this.roomInfo = msg.room ?? null;
        this.emit('room_info', this.roomInfo);
        // Status changes made while offline never reached the server.
        if (msg.resumed || BUSY_STATUSES.includes(this.status)) {
          this.broadcastBusyStatus(BUSY_STATUSES.includes(this.status));
        }
        if (this.pendingPairToken) {
          this.signaling.send({ type: "join_pair_link", token: this.pendingPairToken });
          this.pendingPairToken = null;
        }
        break;
      case "pair_link":
        this.emit("pair_link", msg.token, msg.expires_in);
        break;
      case "pair_joined": {
        this.peers = [...this.peers.filter((peer) => peer.device_id !== msg.peer.device_id), msg.peer];
        this.emit("peer_list", this.peers);
        this.emit("pair_joined", msg.peer);
        break;
      }
      case "pair_error":
        this.emit("pair_error", msg.reason);
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
          // Renames also arrive as peer_joined, so only new devices are added here.
          this.peers.push({ 
            device_id: msg.device_id, device_name: msg.device_name, device_type: msg.device_type, is_busy: !!msg.is_busy 
          });
        }
        this.emit("peer_joined", { device_id: msg.device_id, device_name: msg.device_name, device_type: msg.device_type, is_busy: !!msg.is_busy });
        break;
      case "peer_left":
        this.peers = this.peers.filter(p => p.device_id !== msg.device_id);
        this.emit("peer_left", msg.device_id);

        if (this.incomingRequest?.peerId === msg.device_id) {
          this.cancelSession();
        } else if (this.targetPeerId === msg.device_id) {
          // Losing signaling doesn't end a working direct connection. If the
          // device is really gone, its "bye" or the watchdog ends the session.
          if (this.status === "requesting") {
            this.cancelSession();
          } else if (this.status !== "connected") {
            this.watchdog.stop();
            this.fileEngine.failAllActiveTransfers("Peer left the chat");
            this.setStatus("disconnected");
            this.targetPeerId = null;
          }
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
        // Both devices requested each other. The higher ID accepts and waits,
        // and the lower ID makes the only offer when that accept arrives.
        if (this.status === "requesting" && this.targetPeerId === msg.from_id) {
          if (this.myDeviceId && this.myDeviceId > msg.from_id) {
            this.setStatus("connecting");
            this.watchdog.startConnecting();
            this.signaling.send({ type: "connect_accept", to: msg.from_id });
          }
          return;
        }
        if (this.status === "connecting" && this.targetPeerId === msg.from_id) return;

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
        if (this.status === "requesting" && this.targetPeerId === msg.from_id) {
          this.setStatus("connecting");
          this.watchdog.startConnecting();
          void this.startOffer(msg.from_id);
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
        if (this.targetPeerId !== msg.from_id) {
          console.warn("[WebRTC] Ignored sdp_offer from an unexpected device");
          return;
        }
        if (this.status === "connecting") {
          this.connection.init(false);
          void this.answerOffer(msg.from_id, msg.sdp);
        } else if (this.status === "connected" || this.status === "reconnecting") {
          // An ICE restart keeps the same connection and its open channels. A rebuild replaces both.
          if (msg.rebuild) {
            this.openChannels.clear();
            this.connection.init(false);
          }
          void this.answerOffer(msg.from_id, msg.sdp);
        } else {
          console.warn("[WebRTC] Ignored sdp_offer outside of flow");
        }
        break;
      case "sdp_answer":
        if (this.targetPeerId !== msg.from_id) return;
        this.connection.handleAnswer(msg.sdp).catch(err => console.error("[SDP] Handle answer failed:", err));
        break;
      case "ice_candidate":
        if (this.targetPeerId !== msg.from_id) return;
        this.connection.handleIceCandidate(msg.candidate).catch(err => console.error("[ICE] Add candidate failed:", err));
        break;
    }
  }
}

export const webRTCManager = new WebRTCManager();
