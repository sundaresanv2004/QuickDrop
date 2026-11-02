import { ConnectionLog, createConnectionLog, describeCandidate, saveConnectionLog } from '@/lib/diagnostics/connection-log';

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export class ConnectionController {
  private pc: RTCPeerConnection | null = null;
  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private log: ConnectionLog | null = null;

  constructor(
    private onIceCandidate: (candidate: RTCIceCandidateInit) => void,
    private onConnectionStateChange: (state: string) => void,
    private onDataChannel: (channel: RTCDataChannel, label: string) => void
  ) {}

  public get isInitiator(): boolean {
    return this.log?.role === "initiator";
  }

  public get maxMessageBytes(): number {
    return this.pc?.sctp?.maxMessageSize ?? 0;
  }

  public getLog(): ConnectionLog | null {
    return this.log;
  }

  public init(isInitiator: boolean) {
    this.closePeerConnection();
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.log = createConnectionLog(isInitiator ? "initiator" : "responder");
    saveConnectionLog(this.log);

    if (isInitiator) {
      const chat = this.pc.createDataChannel("chat", { ordered: true });
      const files = this.pc.createDataChannel("files", { ordered: true });
      files.binaryType = "arraybuffer";
      files.bufferedAmountLowThreshold = 65536;
      const system = this.pc.createDataChannel("system", { ordered: true });

      this.onDataChannel(chat, "chat");
      this.onDataChannel(files, "files");
      this.onDataChannel(system, "system");
    }

    this.pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === "files") {
        channel.binaryType = "arraybuffer";
        channel.bufferedAmountLowThreshold = 65536;
      }
      this.onDataChannel(channel, channel.label);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.recordCandidate("localCandidates", event.candidate.candidate);
        this.onIceCandidate(event.candidate.toJSON());
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        this.recordState(this.pc.connectionState);
        this.onConnectionStateChange(this.pc.connectionState);
      }
    };
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc) return null;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  public async restartIce(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc || !this.log) return null;
    this.log.iceRestarts += 1;
    saveConnectionLog(this.log);
    const offer = await this.pc.createOffer({ iceRestart: true });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  public async handleOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc) return null;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.flushIceCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  public async handleAnswer(sdp: RTCSessionDescriptionInit) {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.flushIceCandidates();
  }

  public async handleIceCandidate(candidate: RTCIceCandidateInit) {
    this.recordCandidate("remoteCandidates", candidate.candidate);
    // A candidate can arrive before the offer that created this connection.
    if (!this.pc || !this.pc.remoteDescription) {
      this.iceCandidateQueue.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private async flushIceCandidates() {
    if (!this.pc) return;
    const queue = this.iceCandidateQueue;
    if (queue.length === 0) return;
    for (const candidate of queue) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[ICE] Failed to add queued candidate:", err);
      }
    }
    this.iceCandidateQueue = [];
  }

  private recordCandidate(list: "localCandidates" | "remoteCandidates", candidate?: string | null) {
    if (!this.log) return;
    const kind = describeCandidate(candidate);
    this.log[list][kind] = (this.log[list][kind] ?? 0) + 1;
    saveConnectionLog(this.log);
  }

  private recordState(state: RTCPeerConnectionState) {
    const log = this.log;
    if (!log) return;
    log.states.push(state);
    if (state === "connected" && log.connectedAfterMs === null) {
      log.connectedAfterMs = Date.now() - log.startedAt;
      log.maxMessageSize = this.pc?.sctp?.maxMessageSize ?? null;
      void this.recordSelectedPair(log);
    }
    saveConnectionLog(log);
  }

  private async recordSelectedPair(log: ConnectionLog) {
    if (!this.pc) return;
    try {
      const stats = await this.pc.getStats();
      const reports = Array.from(stats.values());
      const transport = reports.find((report) => report.type === "transport" && report.selectedCandidatePairId);
      const pair = transport
        ? stats.get(transport.selectedCandidatePairId)
        : reports.find((report) => report.type === "candidate-pair" && report.nominated && report.state === "succeeded");
      if (!pair) return;
      const local = stats.get(pair.localCandidateId);
      const remote = stats.get(pair.remoteCandidateId);
      log.selectedPair = {
        local: local?.candidateType ?? "unknown",
        remote: remote?.candidateType ?? "unknown",
        protocol: local?.protocol ?? "unknown",
      };
      saveConnectionLog(log);
    } catch (err) {
      console.warn("[Diagnostics] Could not read connection stats:", err);
    }
  }

  private closePeerConnection() {
    if (this.pc) {
      this.pc.ondatachannel = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
  }

  public close() {
    this.closePeerConnection();
    this.iceCandidateQueue = [];
    this.log = null;
  }
}
