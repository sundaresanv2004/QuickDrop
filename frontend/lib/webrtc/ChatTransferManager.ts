import { ChatMessage, TextMessagePayload, ReactionMessagePayload, LinkPreview } from '@/types/chat';

export class ChatTransferManager {
  private chatChannel: RTCDataChannel | null = null;

  constructor(
    private getMyDeviceId: () => string | null,
    private onMessageReceived: (msg: ChatMessage) => void,
    private onReactionReceived: (messageId: string, emoji: string, fromId: string) => void
  ) {}

  public setChannel(channel: RTCDataChannel | null) {
    this.chatChannel = channel;
    if (this.chatChannel) {
      this.chatChannel.onmessage = this.handleMessage.bind(this);
    }
  }

  private handleMessage(event: MessageEvent) {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "text_message") {
        this.onMessageReceived({ 
          id: payload.id, 
          type: "text", 
          direction: "received", 
          content: payload.content, 
          timestamp: payload.timestamp,
          linkPreview: payload.linkPreview 
        });
      } else if (payload.type === "reaction_message") {
        this.onReactionReceived(payload.messageId, payload.emoji, payload.fromId);
      }
    } catch { 
      console.error("[Chat] Failed to parse chat message"); 
    }
  }

  public sendChatMessage(content: string, linkPreview?: LinkPreview): ChatMessage | null {
    if (!this.chatChannel || this.chatChannel.readyState !== "open") return null;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const payload: TextMessagePayload = { type: "text_message", id, content, timestamp, linkPreview };
    
    this.chatChannel.send(JSON.stringify(payload));
    
    return { id, type: "text", direction: "sent", content, timestamp, linkPreview };
  }

  public sendReaction(messageId: string, emoji: string) {
    const myDeviceId = this.getMyDeviceId();
    if (!this.chatChannel || this.chatChannel.readyState !== "open" || !myDeviceId) return;
    
    const payload: ReactionMessagePayload = { type: "reaction_message", messageId, emoji, fromId: myDeviceId };
    this.chatChannel.send(JSON.stringify(payload));

    // Emit locally so the UI updates for the sender
    this.onReactionReceived(messageId, emoji, myDeviceId);
  }

  public close() {
    if (this.chatChannel) {
      this.chatChannel.close();
      this.chatChannel = null;
    }
  }
}
