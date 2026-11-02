import { BLOCK_BYTES, BUFFER_HIGH_BYTES, MAX_MESSAGE_BYTES } from "./constants"
import type { DeclineReason, FileOfferMessage, TransferMessage } from "./protocol"
import type { ReadRequest, ReadResponse } from "./read.worker"

const CHANNEL_POLL_MS = 250

export interface TransferTransport {
  fileChannel(): RTCDataChannel | null
  sendControl(message: TransferMessage): void
  maxMessageBytes(): number
}

export class TransferAbortedError extends Error {
  constructor(public readonly userMessage: string, public readonly declineReason?: DeclineReason) {
    super(userMessage)
  }
}

class BlockReader {
  private worker = new Worker(new URL("./read.worker.ts", import.meta.url), { type: "module" })
  private nextRequestId = 0

  read(request: Omit<ReadRequest, "requestId">): Promise<ArrayBuffer[]> {
    const requestId = this.nextRequestId++
    return new Promise((resolve, reject) => {
      this.worker.onmessage = ({ data }: MessageEvent<ReadResponse>) => {
        if (data.requestId !== requestId) return
        if (data.ok) resolve(data.frames)
        else reject(new TransferAbortedError("Couldn't read this file"))
      }
      this.worker.onerror = () => reject(new TransferAbortedError("Couldn't read this file"))
      this.worker.postMessage({ ...request, requestId })
    })
  }

  close() {
    this.worker.terminate()
  }
}

// Sends one file. It only moves forward when the receiver has room, measured by
// what has reached the receiver's disk, so a slow phone can't be overwhelmed.
export class SendSession {
  private isAccepted = false
  private isReceived = false
  private abortError: TransferAbortedError | null = null
  private nextOffset = 0
  private persistedBytes = 0
  private windowBytes = BLOCK_BYTES
  // Increases on every rewind, so work started for an older position gets dropped.
  private generation = 0
  private wakeWaiters: (() => void)[] = []

  constructor(
    private readonly offer: FileOfferMessage,
    private readonly file: File,
    private readonly transport: TransferTransport,
    private readonly onConfirmedBytes: (bytes: number) => void,
    private readonly onStarted: () => void
  ) {}

  public sendOffer() {
    this.transport.sendControl(this.offer)
  }

  public handleAccept(offset: number, windowBytes: number) {
    if (offset > this.offer.size) return
    this.windowBytes = windowBytes

    if (!this.isAccepted) {
      this.isAccepted = true
      this.onStarted()
    } else {
      console.info(`[Transfer] Resuming ${this.offer.id} from byte ${offset}`)
      if (offset !== this.nextOffset) this.generation++
    }
    this.nextOffset = offset
    this.persistedBytes = offset
    this.wake()
  }

  public handleCredit(persistedBytes: number) {
    if (persistedBytes > this.offer.size) return
    this.persistedBytes = persistedBytes
    this.onConfirmedBytes(persistedBytes)
    this.wake()
  }

  public handleReceived() {
    this.isReceived = true
    this.wake()
  }

  public abort(error: TransferAbortedError) {
    this.abortError = error
    this.wake()
  }

  // A reconnected data channel can now take frames again.
  public wake() {
    const waiters = this.wakeWaiters
    this.wakeWaiters = []
    waiters.forEach((resolve) => resolve())
  }

  public async run(): Promise<void> {
    this.sendOffer()
    while (!this.isAccepted) await this.waitForChange()

    const reader = new BlockReader()
    try {
      while (!this.isReceived) {
        this.throwIfAborted()

        if (this.nextOffset >= this.offer.size) {
          await this.waitForChange()
          continue
        }

        const end = Math.min(this.nextOffset + BLOCK_BYTES, this.offer.size)
        if (end > this.persistedBytes + this.windowBytes) {
          await this.waitForChange()
          continue
        }

        const channel = this.transport.fileChannel()
        if (channel?.readyState !== "open") {
          await this.waitForChange(CHANNEL_POLL_MS)
          continue
        }

        const generation = this.generation
        const frames = await reader.read({
          file: this.file,
          streamId: this.offer.streamId,
          offset: this.nextOffset,
          length: end - this.nextOffset,
          messageBytes: Math.min(MAX_MESSAGE_BYTES, this.transport.maxMessageBytes() || MAX_MESSAGE_BYTES),
        })

        if (await this.sendFrames(channel, frames, generation)) this.nextOffset = end
      }
    } finally {
      reader.close()
    }
    this.throwIfAborted()
  }

  private async sendFrames(channel: RTCDataChannel, frames: ArrayBuffer[], generation: number): Promise<boolean> {
    for (const frame of frames) {
      while (channel.readyState === "open" && channel.bufferedAmount >= BUFFER_HIGH_BYTES && generation === this.generation) {
        await this.waitForBuffer(channel)
      }
      this.throwIfAborted()
      if (generation !== this.generation || channel.readyState !== "open") return false

      try {
        channel.send(frame)
      } catch (error) {
        // The channel closed or filled up. The receiver asks for this block again.
        console.warn("[Transfer] Frame not sent:", error)
        return false
      }
    }
    return generation === this.generation
  }

  private throwIfAborted() {
    if (this.abortError) throw this.abortError
  }

  private async waitForChange(timeoutMs?: number) {
    await new Promise<void>((resolve) => {
      this.wakeWaiters.push(resolve)
      if (timeoutMs !== undefined) setTimeout(resolve, timeoutMs)
    })
    this.throwIfAborted()
  }

  private async waitForBuffer(channel: RTCDataChannel) {
    await new Promise<void>((resolve) => {
      const done = () => {
        channel.removeEventListener("bufferedamountlow", done)
        resolve()
      }
      channel.addEventListener("bufferedamountlow", done)
      this.wakeWaiters.push(done)
      setTimeout(done, CHANNEL_POLL_MS)
    })
  }
}
