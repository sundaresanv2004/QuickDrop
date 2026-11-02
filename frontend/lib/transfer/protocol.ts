import { BLOCK_BYTES, MAX_FILE_BYTES } from "./constants"

// ─── Control messages, sent as JSON on the system channel ───

export interface FileOfferMessage {
  type: "file_offer"
  id: string
  streamId: number
  name: string
  size: number
  mimeType: string
}

// Asks the sender to send from this offset. It starts a transfer, and also
// rewinds one after a dropped connection or a failed checksum.
export interface FileAcceptMessage {
  type: "file_accept"
  id: string
  offset: number
  windowBytes: number
}

// Reports how many bytes the receiver has written to disk, which lets the sender continue.
export interface FileCreditMessage {
  type: "file_credit"
  id: string
  persistedBytes: number
}

export interface FileReceivedMessage {
  type: "file_received"
  id: string
}

export type DeclineReason = "declined" | "storage" | "too_large" | "failed"

export interface FileDeclineMessage {
  type: "file_decline"
  id: string
  reason: DeclineReason
}

export interface FileCancelMessage {
  type: "file_cancel"
  id: string
}

export type TransferMessage =
  | FileOfferMessage
  | FileAcceptMessage
  | FileCreditMessage
  | FileReceivedMessage
  | FileDeclineMessage
  | FileCancelMessage

const ID_PATTERN = /^[\w-]{1,64}$/
const DECLINE_REASONS: DeclineReason[] = ["declined", "storage", "too_large", "failed"]

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

// Everything on the data channel comes from the other device, which isn't trusted.
// The ID also becomes a folder name on this device.
export function parseTransferMessage(value: unknown): TransferMessage | null {
  if (typeof value !== "object" || value === null) return null
  const message = value as Record<string, unknown>
  if (typeof message.id !== "string" || !ID_PATTERN.test(message.id)) return null

  const { id } = message
  switch (message.type) {
    case "file_offer":
      if (
        !isWholeNumber(message.streamId) || message.streamId > 0xffffffff ||
        typeof message.name !== "string" ||
        !isWholeNumber(message.size) ||
        typeof message.mimeType !== "string"
      ) return null
      return { type: "file_offer", id, streamId: message.streamId, name: message.name, size: message.size, mimeType: message.mimeType }
    case "file_accept":
      if (
        !isWholeNumber(message.offset) || message.offset % BLOCK_BYTES !== 0 ||
        !isWholeNumber(message.windowBytes) || message.windowBytes < BLOCK_BYTES
      ) return null
      return { type: "file_accept", id, offset: message.offset, windowBytes: message.windowBytes }
    case "file_credit":
      if (!isWholeNumber(message.persistedBytes)) return null
      return { type: "file_credit", id, persistedBytes: message.persistedBytes }
    case "file_received":
      return { type: "file_received", id }
    case "file_decline":
      return {
        type: "file_decline",
        id,
        reason: DECLINE_REASONS.includes(message.reason as DeclineReason) ? (message.reason as DeclineReason) : "declined",
      }
    case "file_cancel":
      return { type: "file_cancel", id }
    default:
      return null
  }
}

export function isOfferAllowed(offer: FileOfferMessage) {
  return offer.size <= MAX_FILE_BYTES
}

// ─── Binary frames, sent on the files channel ───
//
// Each frame states where its data belongs, so stale or out-of-place frames can
// be discarded. Every frame of a block carries that block's checksum.
//
//   0  version    u8
//   1  reserved   3 bytes
//   4  streamId   u32
//   8  offset     f64
//  16  blockCrc   u32
//  20  payload

export const FRAME_VERSION = 2
export const FRAME_HEADER_BYTES = 20

export interface FrameHeader {
  streamId: number
  offset: number
  blockCrc: number
  payloadBytes: number
}

export function encodeFrames(
  streamId: number,
  blockOffset: number,
  blockCrc: number,
  block: Uint8Array,
  messageBytes: number
): ArrayBuffer[] {
  const payloadBytes = messageBytes - FRAME_HEADER_BYTES
  const frames: ArrayBuffer[] = []

  for (let start = 0; start < block.length; start += payloadBytes) {
    const payload = block.subarray(start, start + payloadBytes)
    const frame = new ArrayBuffer(FRAME_HEADER_BYTES + payload.length)
    const view = new DataView(frame)
    view.setUint8(0, FRAME_VERSION)
    view.setUint32(4, streamId)
    view.setFloat64(8, blockOffset + start)
    view.setUint32(16, blockCrc)
    new Uint8Array(frame, FRAME_HEADER_BYTES).set(payload)
    frames.push(frame)
  }
  return frames
}

export function decodeFrameHeader(frame: ArrayBuffer): FrameHeader | null {
  if (frame.byteLength <= FRAME_HEADER_BYTES) return null
  const view = new DataView(frame)
  if (view.getUint8(0) !== FRAME_VERSION) return null

  const offset = view.getFloat64(8)
  if (!Number.isSafeInteger(offset) || offset < 0) return null
  return {
    streamId: view.getUint32(4),
    offset,
    blockCrc: view.getUint32(16),
    payloadBytes: frame.byteLength - FRAME_HEADER_BYTES,
  }
}

// ─── File names ───

const UNSAFE_NAME_CHARACTERS = /[\u0000-\u001f\u007f/\\:*?"<>|]/g
const MAX_NAME_LENGTH = 200

// The name comes from the other device and becomes a real file name here.
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(UNSAFE_NAME_CHARACTERS, "_").replace(/^\.+/, "").trim()
  if (!cleaned) return "file"
  if (cleaned.length <= MAX_NAME_LENGTH) return cleaned

  const dot = cleaned.lastIndexOf(".")
  const extension = dot > 0 && cleaned.length - dot <= 16 ? cleaned.slice(dot) : ""
  return cleaned.slice(0, MAX_NAME_LENGTH - extension.length) + extension
}
