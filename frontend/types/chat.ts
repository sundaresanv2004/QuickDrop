// ─── Message Direction ───
export type MessageDirection = "sent" | "received"

// ─── Message Type Discriminator ───
export type ChatMessageType = "text" | "file"

// ─── File Transfer Status ───
export type FileStatus = "sending" | "receiving" | "complete" | "error"

// ─── File Info attached to a file message ───
export interface FileInfo {
  fileId:    string
  name:      string
  size:      number          // bytes
  mimeType:  string
  status:    FileStatus
  progress:  number          // 0–100
  objectUrl: string | null   // set only when status === "complete"
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
}

// ─── In-progress file being received (stored separately, not in messages) ───
export interface PendingFileTransfer {
  meta: {
    fileId:      string
    name:        string
    size:        number
    mimeType:    string
    totalChunks: number
  }
  chunks:   ArrayBuffer[]
  received: number            // chunk count received so far
}

// ─── Payload shapes for DataChannel JSON messages ───

export interface TextMessagePayload {
  type:      "text_message"
  id:        string
  content:   string
  timestamp: number
}

export interface FileMetaPayload {
  type:        "file_meta"
  fileId:      string
  name:        string
  size:        number
  mimeType:    string
  totalChunks: number
}

export interface TypingPayload {
  type: "typing_start" | "typing_stop"
}

export interface ByePayload {
  type: "bye"
}

// Union of all system channel payloads
export type SystemPayload =
  | FileMetaPayload
  | TypingPayload
  | ByePayload

// Union of all chat channel payloads
export type ChatPayload = TextMessagePayload
