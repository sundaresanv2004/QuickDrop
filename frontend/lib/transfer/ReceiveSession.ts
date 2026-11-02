import { BLOCK_BYTES, MAX_CORRUPT_RETRIES, MEMORY_FALLBACK_LIMIT_BYTES } from "./constants"
import type { FileOfferMessage, FrameHeader, TransferMessage } from "./protocol"
import { sanitizeFileName } from "./protocol"
import { readStoredFile, StorageClient } from "./storage/StorageClient"
import type { SinkRequest, StorageResponse } from "./storage/storage-protocol"

type ReceivePhase = "idle" | "opening" | "receiving" | "finalizing" | "done" | "stopped"

export interface ReceiveCallbacks {
  sendControl: (message: TransferMessage) => void
  onPersisted: (bytes: number) => void
  onVerifying: (bytes: number) => void
  onComplete: (result: { file: File; savedToDevice: boolean }) => void
  onFailed: (code: "no_space" | "unavailable" | "failed") => void
}

// Receives one file. Frames are collected here and handed to a worker a block at
// a time, so the page never holds more than one block of the file.
export class ReceiveSession {
  public readonly fileName: string
  private phase: ReceivePhase = "idle"
  private storage: StorageClient | null = null
  private sink: SinkRequest | null = null
  private triedMemory = false
  private expectedOffset = 0
  private blockStart = 0
  private frames: ArrayBuffer[] = []
  private corruptRetries = 0

  constructor(
    public readonly offer: FileOfferMessage,
    private readonly windowBytes: number,
    private readonly callbacks: ReceiveCallbacks
  ) {
    this.fileName = sanitizeFileName(offer.name)
  }

  public get isActive() {
    return this.phase === "opening" || this.phase === "receiving" || this.phase === "finalizing"
  }

  public get isDone() {
    return this.phase === "done"
  }

  public get isStopped() {
    return this.phase === "stopped"
  }

  public start(sink: SinkRequest) {
    if (this.phase === "stopped") return
    this.sink = sink
    this.phase = "opening"
    this.storage = new StorageClient((response) => this.handleStorageResponse(response))
    this.storage.open(sink, this.offer.size)
  }

  public handleFrame(frame: ArrayBuffer, header: FrameHeader) {
    if (this.phase !== "receiving" || header.offset !== this.expectedOffset) return

    const end = header.offset + header.payloadBytes
    const blockEnd = Math.min(this.blockStart + BLOCK_BYTES, this.offer.size)
    if (end > blockEnd) return

    this.frames.push(frame)
    this.expectedOffset = end

    if (end === blockEnd) {
      this.storage?.writeBlock(this.blockStart, header.blockCrc, this.frames)
      this.frames = []
      this.blockStart = end
    }
  }

  // Asks the sender to continue from the start of the block in progress.
  public requestFromCurrentBlock() {
    this.frames = []
    this.expectedOffset = this.blockStart
    this.sendAccept(this.blockStart)
  }

  public stop() {
    this.phase = "stopped"
    this.frames = []
    this.closeStorage()
  }

  private sendAccept(offset: number) {
    this.callbacks.sendControl({ type: "file_accept", id: this.offer.id, offset, windowBytes: this.windowBytes })
  }

  private closeStorage() {
    this.storage?.close()
    this.storage = null
  }

  private rewindTo(offset: number) {
    this.corruptRetries++
    if (this.corruptRetries > MAX_CORRUPT_RETRIES) {
      this.fail("failed")
      return
    }
    console.warn(`[Transfer] Block at byte ${offset} failed its checksum, asking for it again`)
    this.phase = "receiving"
    this.frames = []
    this.blockStart = offset
    this.expectedOffset = offset
    this.storage?.rewind(offset)
    this.sendAccept(offset)
  }

  private fail(code: "no_space" | "unavailable" | "failed") {
    this.stop()
    this.callbacks.onFailed(code)
  }

  private handleStorageResponse(response: StorageResponse) {
    if (this.phase === "stopped") return

    switch (response.kind) {
      case "opened":
        this.phase = "receiving"
        this.sendAccept(0)
        if (this.offer.size === 0) this.beginFinalizing()
        break
      case "persisted":
        this.callbacks.sendControl({ type: "file_credit", id: this.offer.id, persistedBytes: response.bytes })
        this.callbacks.onPersisted(response.bytes)
        if (response.bytes === this.offer.size) this.beginFinalizing()
        break
      case "corrupt":
        this.rewindTo(response.offset)
        break
      case "verifying":
        this.callbacks.onVerifying(response.bytes)
        break
      case "finalized":
        void this.finish(response.blob)
        break
      case "error":
        this.handleStorageError(response.code)
        break
    }
  }

  private beginFinalizing() {
    this.phase = "finalizing"
    this.callbacks.onVerifying(0)
    this.storage?.finalize()
  }

  private handleStorageError(code: "unavailable" | "no_space" | "failed") {
    // Disk storage can be missing, such as in some private windows, so a small file falls back to memory.
    if (
      code === "unavailable" && this.phase === "opening" && this.sink?.type === "opfs" &&
      !this.triedMemory && this.offer.size <= MEMORY_FALLBACK_LIMIT_BYTES
    ) {
      this.triedMemory = true
      this.closeStorage()
      this.start({ type: "memory" })
      return
    }
    this.fail(code)
  }

  private async finish(blob?: Blob) {
    this.closeStorage()
    try {
      let file: File
      if (blob) {
        file = new File([blob], this.fileName)
      } else if (this.sink?.type === "picker") {
        file = await this.sink.handle.getFile()
      } else {
        file = await readStoredFile(this.offer.id, this.fileName)
      }
      this.phase = "done"
      this.callbacks.sendControl({ type: "file_received", id: this.offer.id })
      this.callbacks.onComplete({ file, savedToDevice: this.sink?.type === "picker" })
    } catch (error) {
      console.error("[Transfer] Couldn't open the finished file:", error)
      this.fail("failed")
    }
  }

  // The other device reconnected and is repeating its offer.
  public handleRepeatedOffer() {
    if (this.phase === "done") {
      this.callbacks.sendControl({ type: "file_received", id: this.offer.id })
    } else if (this.phase === "receiving") {
      this.requestFromCurrentBlock()
    }
  }
}
