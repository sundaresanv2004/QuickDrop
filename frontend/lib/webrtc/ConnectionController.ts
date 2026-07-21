export class ConnectionController {
  private pc: RTCPeerConnection | null = null;
  private iceCandidateQueue: RTCIceCandidateInit[] = [];

  constructor(
    private onIceCandidate: (candidate: RTCIceCandidateInit) => void,
    private onConnectionStateChange: (state: string) => void,
    private onDataChannel: (channel: RTCDataChannel, label: string) => void
  ) {}

  public init(isInitiator: boolean) {
    this.pc = new RTCPeerConnection({ 
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] 
    });

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
        this.onIceCandidate(event.candidate.toJSON());
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
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

  public close() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.iceCandidateQueue = [];
  }
}
