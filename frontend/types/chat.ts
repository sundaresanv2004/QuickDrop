import type { TransferMessage } from "@/lib/transfer/protocol"

// ─── Message Direction ───
export type MessageDirection = "sent" | "received"

// ─── Message Type Discriminator ───
export type ChatMessageType = "text" | "file"

// ─── File Transfer Status ───
export type FileStatus =
  | "waiting"          // sent, and waiting for its turn or for the other device to accept
  | "awaiting_accept"  // received offer, waiting for this person to accept
  | "sending"
  | "receiving"
  | "verifying"
  | "complete"
  | "error"

// ─── File Info attached to a file message ───
export interface FileInfo {
  fileId:    string
  name:      string
  size:      number          // bytes
  mimeType:  string
  status:    FileStatus
  progress:  number          // 0–100
  statusReason?: string      // e.g. "Declined" or "Network Error"
  savedToDevice?: boolean    // written straight to a file the person chose
}

export interface LinkPreview {
  url: string
  title?: string
  description?: string
  image?: string
}

// ─── Single chat message (text or file) ───
export interface ChatMessage {
  id:        string           // UUID, generated at send time
  type:      ChatMessageType
  direction: MessageDirection
  timestamp: number           // Date.now()

  // Only for type === "text"
  content?: string

  // Only for type === "file"
  file?: FileInfo

  // Emoji Reactions: { "👍": ["device-id-1", "device-id-2"], ... }
  reactions?: Record<string, string[]>

  // Link Preview (WhatsApp style)
  linkPreview?: LinkPreview
}

// ─── Payload shapes for DataChannel JSON messages ───

export interface TextMessagePayload {
  type:      "text_message"
  id:        string
  content:   string
  timestamp: number
  linkPreview?: LinkPreview
}

export interface TypingPayload {
  type: "typing_start" | "typing_stop"
}

export interface ByePayload {
  type: "bye"
}

// Union of all system channel payloads
export type SystemPayload =
  | TypingPayload
  | ByePayload
  | TransferMessage

export interface ReactionMessagePayload {
  type:      "reaction_message"
  messageId: string
  emoji:     string
  fromId:    string   // The device ID of the person who reacted
}

// Union of all chat channel payloads
export type ChatPayload = TextMessagePayload | ReactionMessagePayload
