import { getWebSocket } from "@/lib/websocket";

export type WebRTCSignalingMessage =
    | { type: "connection-request"; target: string }
    | { type: "connection-accept"; target: string }
    | { type: "connection-reject"; target: string }
    | { type: "offer"; target: string; sdp: RTCSessionDescriptionInit }
    | { type: "answer"; target: string; sdp: RTCSessionDescriptionInit }
    | { type: "ice-candidate"; target: string; candidate: RTCIceCandidateInit };

export type WebRTCIncomingMessage =
    | { type: "connection-request"; sender: string }
    | { type: "connection-accept"; sender: string }
    | { type: "connection-reject"; sender: string }
    | { type: "offer"; sender: string; sdp: RTCSessionDescriptionInit }
    | { type: "answer"; sender: string; sdp: RTCSessionDescriptionInit }
    | { type: "ice-candidate"; sender: string; candidate: RTCIceCandidateInit };

type PeerStateChangeHandler = (targetId: string, state: RTCPeerConnectionState) => void;
type DataChannelMessageHandler = (targetId: string, message: string) => void;

class PeerManager {
    private peers: Map<string, RTCPeerConnection> = new Map();
    private dataChannels: Map<string, RTCDataChannel> = new Map();

    private stateChangeHandlers: Set<PeerStateChangeHandler> = new Set();
    private messageHandlers: Set<DataChannelMessageHandler> = new Set();

    public onPeerStateChange(handler: PeerStateChangeHandler) {
        this.stateChangeHandlers.add(handler);
        return () => this.stateChangeHandlers.delete(handler);
    }

    public onMessage(handler: DataChannelMessageHandler) {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }

    private notifyStateChange(targetId: string, state: RTCPeerConnectionState) {
        this.stateChangeHandlers.forEach((h) => h(targetId, state));
    }

    private notifyMessage(targetId: string, message: string) {
        this.messageHandlers.forEach((h) => h(targetId, message));
    }

    private getIceServers() {
        return {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        };
    }

    public async createPeerConnection(targetId: string, isInitiator: boolean) {
        if (this.peers.has(targetId)) {
            console.warn(`Peer attachment for ${targetId} already exists. Cleaning up...`);
            this.cleanup(targetId);
        }

        const pc = new RTCPeerConnection(this.getIceServers());
        this.peers.set(targetId, pc);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                getWebSocket().send({
                    type: "ice-candidate",
                    target: targetId,
                    candidate: event.candidate.toJSON(),
                } as any);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${targetId}: ${pc.connectionState}`);
            this.notifyStateChange(targetId, pc.connectionState);

            if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
                this.cleanup(targetId);
            }
        };

        if (isInitiator) {
            const dc = pc.createDataChannel("quickdrop-data");
            this.setupDataChannel(targetId, dc);

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            getWebSocket().send({
                type: "offer",
                target: targetId,
                sdp: offer,
            } as any);
        } else {
            pc.ondatachannel = (event) => {
                this.setupDataChannel(targetId, event.channel);
            };
        }

        return pc;
    }

    private setupDataChannel(targetId: string, dc: RTCDataChannel) {
        this.dataChannels.set(targetId, dc);

        dc.onopen = () => {
            console.log(`Data channel with ${targetId} is open`);
        };

        dc.onmessage = (event) => {
            console.log(`Message from ${targetId}:`, event.data);
            this.notifyMessage(targetId, event.data);
        };

        dc.onclose = () => {
            console.log(`Data channel with ${targetId} closed`);
        };
    }

    public async handleOffer(senderId: string, offer: RTCSessionDescriptionInit) {
        console.log(`Handling offer from ${senderId}`);
        const pc = await this.createPeerConnection(senderId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        getWebSocket().send({
            type: "answer",
            target: senderId,
            sdp: answer,
        } as any);
    }

    public async handleAnswer(senderId: string, answer: RTCSessionDescriptionInit) {
        console.log(`Handling answer from ${senderId}`);
        const pc = this.peers.get(senderId);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } else {
            console.warn(`Received answer from ${senderId} but no peer connection exists`);
        }
    }

    public async handleIceCandidate(senderId: string, candidate: RTCIceCandidateInit) {
        const pc = this.peers.get(senderId);
        if (pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error(`Error adding ice candidate for ${senderId}`, e);
            }
        } else {
            console.warn(`Received ice candidate from ${senderId} but no peer connection exists`);
        }
    }

    public sendData(targetId: string, data: string) {
        const dc = this.dataChannels.get(targetId);
        if (dc && dc.readyState === "open") {
            dc.send(data);
            return true;
        }
        console.error(`Attempted to send data to ${targetId} but data channel is not open`);
        return false;
    }

    public cleanup(targetId: string) {
        const dc = this.dataChannels.get(targetId);
        if (dc) {
            dc.close();
        }
        this.dataChannels.delete(targetId);

        const pc = this.peers.get(targetId);
        if (pc) {
            pc.close();
        }
        this.peers.delete(targetId);
        this.notifyStateChange(targetId, "disconnected" as RTCPeerConnectionState);
    }
}

// Singleton pattern
let peerManagerInstance: PeerManager | null = null;

export function getPeerManager() {
    if (!peerManagerInstance) {
        peerManagerInstance = new PeerManager();
    }
    return peerManagerInstance;
}
