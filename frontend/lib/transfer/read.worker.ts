import { crc32 } from "./crc32"
import { encodeFrames } from "./protocol"

export interface ReadRequest {
  requestId: number
  file: File
  streamId: number
  offset: number
  length: number
  messageBytes: number
}

export type ReadResponse =
  | { requestId: number; ok: true; frames: ArrayBuffer[] }
  | { requestId: number; ok: false; message: string }

const scope = self as unknown as {
  postMessage(message: ReadResponse, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<ReadRequest>) => void) | null
}

// Reads, checksums, and packages each block here, so the page only has to hand
// finished frames to the data channel.
scope.onmessage = async ({ data }) => {
  const { requestId, file, streamId, offset, length, messageBytes } = data
  try {
    const block = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer())
    if (block.length !== length) throw new Error(`Read ${block.length} of ${length} bytes at ${offset}`)

    const frames = encodeFrames(streamId, offset, crc32(block), block, messageBytes)
    scope.postMessage({ requestId, ok: true, frames }, frames)
  } catch (error) {
    scope.postMessage({ requestId, ok: false, message: error instanceof Error ? error.message : String(error) })
  }
}
