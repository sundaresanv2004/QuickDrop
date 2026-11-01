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

  public init(isInitiator: boolean) {
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
    if (!this.pc) return;
    this.recordCandidate("remoteCandidates", candidate.candidate);
    if (!this.pc.remoteDescription) {
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
      const reports = Array.from((await this.pc.getStats()).values());
      const byId = new Map(reports.map((report) => [report.id, report]));
      const transport = reports.find((report) => report.type === "transport" && report.selectedCandidatePairId);
      const pair = transport
        ? byId.get(transport.selectedCandidatePairId)
        : reports.find((report) => report.type === "candidate-pair" && report.nominated && report.state === "succeeded");
      if (!pair) return;
      const local = byId.get(pair.localCandidateId);
      const remote = byId.get(pair.remoteCandidateId);
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

  public close() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.iceCandidateQueue = [];
    this.log = null;
  }
}
