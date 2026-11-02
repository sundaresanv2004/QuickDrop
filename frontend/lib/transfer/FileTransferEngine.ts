import { getDeviceType } from "@/lib/device"
import { formatFileSize } from "@/lib/utils"
import type { ChatMessage, FileInfo } from "@/types/chat"
import {
  ACCEPT_THRESHOLD_BYTES,
  BUFFER_LOW_BYTES,
  DESKTOP_WINDOW_BYTES,
  MAX_FILE_BYTES,
  MOBILE_WINDOW_BYTES,
  PROGRESS_INTERVAL_MS,
} from "./constants"
import {
  decodeFrameHeader,
  DeclineReason,
  FileOfferMessage,
  isOfferAllowed,
  parseTransferMessage,
  TransferMessage,
} from "./protocol"
import { ReceiveSession } from "./ReceiveSession"
import { SendSession, TransferAbortedError, TransferTransport } from "./SendSession"
import { canPickSaveLocation, pickSaveLocation } from "./storage/save"
import { checkAvailableStorage, deleteStoredFile, holdFileLock, sweepAbandonedFiles } from "./storage/StorageClient"
import type { SinkRequest } from "./storage/storage-protocol"

const DECLINE_MESSAGES: Record<DeclineReason, string> = {
  declined: "They declined this file",
  storage: "Not enough space on their device",
  too_large: "Too large for their device",
  failed: "Their device couldn't save this file",
}

const STORAGE_FAILURE_MESSAGES = {
  no_space: "Ran out of storage. Free up some space, and avoid private windows.",
  unavailable: "This browser can't store a file this large here. Try a normal window, not a private one.",
  failed: "Couldn't save this file",
}

export interface TransferCallbacks {
  onMessage: (message: ChatMessage) => void
  onUpdate: (fileId: string, changes: Partial<FileInfo>) => void
  onNotice: (message: string) => void
}

interface OutgoingTransfer {
  session: SendSession
  offer: FileOfferMessage
}

interface IncomingTransfer {
  session: ReceiveSession
  releaseLock: (() => void) | null
  file: File | null
}

// Coordinates every file in a chat session: sending one at a time in order,
// receiving, and keeping finished files until the session ends.
export class FileTransferEngine {
  private fileChannel: RTCDataChannel | null = null
  private systemChannel: RTCDataChannel | null = null
  private maxMessageBytes = 0

  private outgoing = new Map<string, OutgoingTransfer>()
  private sendQueue: OutgoingTransfer[] = []
  private isSending = false
  private nextStreamId = 1

  private incoming = new Map<string, IncomingTransfer>()
  private incomingByStream = new Map<number, ReceiveSession>()

  private lastProgressAt = new Map<string, number>()

  constructor(private readonly callbacks: TransferCallbacks) {
    if (typeof window !== "undefined") void sweepAbandonedFiles()
  }

  private readonly transport: TransferTransport = {
    fileChannel: () => this.fileChannel,
    sendControl: (message) => this.sendControl(message),
    maxMessageBytes: () => this.maxMessageBytes,
  }

  // ─── Channels ───

  public setChannels(fileChannel: RTCDataChannel | null, systemChannel: RTCDataChannel | null) {
    this.fileChannel = fileChannel
    this.systemChannel = systemChannel

    if (fileChannel) {
      fileChannel.binaryType = "arraybuffer"
      fileChannel.bufferedAmountLowThreshold = BUFFER_LOW_BYTES
      fileChannel.onmessage = (event) => this.handleFrame(event)
    }
  }

  // All channels are open, possibly on a rebuilt connection. Repeating each offer
  // tells the receiver to report where it got to, so the transfer continues from there.
  public handleChannelsReady(maxMessageBytes: number) {
    this.maxMessageBytes = maxMessageBytes
    for (const { session } of this.outgoing.values()) {
      session.sendOffer()
      session.wake()
    }
  }

  private sendControl(message: TransferMessage) {
    if (this.systemChannel?.readyState === "open") {
      this.systemChannel.send(JSON.stringify(message))
    }
  }

  // ─── Sending ───

  public sendFile(file: File): string {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than ${formatFileSize(MAX_FILE_BYTES)}`)

    const id = crypto.randomUUID()
    const mimeType = file.type || "application/octet-stream"
    const offer: FileOfferMessage = {
      type: "file_offer",
      id,
      streamId: this.nextStreamId++,
      name: file.name,
      size: file.size,
      mimeType,
    }

    const session = new SendSession(
      offer,
      file,
      this.transport,
      (bytes) => this.reportProgress(id, bytes, file.size),
      () => this.callbacks.onUpdate(id, { status: "sending" })
    )
    const transfer = { session, offer }
    this.outgoing.set(id, transfer)
    this.sendQueue.push(transfer)

    this.callbacks.onMessage({
      id,
      type: "file",
      direction: "sent",
      timestamp: Date.now(),
      file: { fileId: id, name: file.name, size: file.size, mimeType, status: "waiting", progress: 0 },
    })

    void this.processSendQueue()
    return id
  }

  private async processSendQueue() {
    if (this.isSending) return
    this.isSending = true

    let next: OutgoingTransfer | undefined
    while ((next = this.sendQueue.shift())) {
      const { session, offer } = next
      try {
        await session.run()
        this.callbacks.onUpdate(offer.id, { status: "complete", progress: 100 })
      } catch (error) {
        const message = error instanceof TransferAbortedError ? error.userMessage : "Couldn't send this file"
        if (!(error instanceof TransferAbortedError)) console.error("[Transfer] Send failed:", error)
        this.callbacks.onUpdate(offer.id, { status: "error", statusReason: message })
      }
      this.outgoing.delete(offer.id)
    }
    this.isSending = false
  }

  // ─── Receiving ───

  private handleOffer(offer: FileOfferMessage) {
    const existing = this.incoming.get(offer.id)
    if (existing) {
      existing.session.handleRepeatedOffer()
      return
    }

    if (!isOfferAllowed(offer)) {
      this.sendControl({ type: "file_decline", id: offer.id, reason: "too_large" })
      return
    }

    const session = this.createReceiveSession(offer)
    this.incoming.set(offer.id, { session, releaseLock: null, file: null })
    this.incomingByStream.set(offer.streamId, session)

    const needsAcceptance = offer.size >= ACCEPT_THRESHOLD_BYTES
    this.callbacks.onMessage({
      id: offer.id,
      type: "file",
      direction: "received",
      timestamp: Date.now(),
      file: {
        fileId: offer.id,
        name: offer.name,
        size: offer.size,
        mimeType: offer.mimeType,
        status: needsAcceptance ? "awaiting_accept" : "receiving",
        progress: 0,
      },
    })

    if (!needsAcceptance) void this.startReceiving(offer.id, { type: "opfs", id: offer.id, fileName: session.fileName })
  }

  private createReceiveSession(offer: FileOfferMessage) {
    const id = offer.id
    return new ReceiveSession(
      offer,
      ["mobile", "tablet"].includes(getDeviceType()) ? MOBILE_WINDOW_BYTES : DESKTOP_WINDOW_BYTES,
      {
        sendControl: (message) => this.sendControl(message),
        onPersisted: (bytes) => this.reportProgress(id, bytes, offer.size),
        onVerifying: (bytes) => {
          this.callbacks.onUpdate(id, {
            status: "verifying",
            progress: offer.size ? Math.floor((bytes / offer.size) * 100) : 100,
          })
        },
        onComplete: ({ file, savedToDevice }) => {
          const transfer = this.incoming.get(id)
          if (transfer) transfer.file = file
          this.callbacks.onUpdate(id, { status: "complete", progress: 100, savedToDevice })
        },
        onFailed: (code) => {
          this.sendControl({ type: "file_decline", id, reason: code === "no_space" ? "storage" : "failed" })
          this.callbacks.onUpdate(id, { status: "error", statusReason: STORAGE_FAILURE_MESSAGES[code] })
          void this.discardStoredFile(id)
        },
      }
    )
  }

  // Must run directly from the Accept click, because the save dialog needs one.
  public async acceptFile(id: string) {
    const transfer = this.incoming.get(id)
    if (!transfer) return
    const { session } = transfer

    if (canPickSaveLocation()) {
      try {
        const handle = await pickSaveLocation(session.fileName)
        void this.startReceiving(id, { type: "picker", handle })
      } catch (error) {
        // Closing the dialog leaves the offer waiting, so it can be accepted again.
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[Transfer] Save dialog failed, using browser storage instead:", error)
          void this.startReceiving(id, { type: "opfs", id, fileName: session.fileName })
        }
      }
      return
    }
    void this.startReceiving(id, { type: "opfs", id, fileName: session.fileName })
  }

  public declineFile(id: string) {
    const transfer = this.incoming.get(id)
    if (!transfer) return
    transfer.session.stop()
    this.sendControl({ type: "file_decline", id, reason: "declined" })
    this.callbacks.onUpdate(id, { status: "error", statusReason: "You declined this file" })
  }

  private async startReceiving(id: string, sink: SinkRequest) {
    const transfer = this.incoming.get(id)
    if (!transfer) return
    const { session } = transfer
    const { size } = session.offer

    this.callbacks.onUpdate(id, { status: "receiving", progress: 0 })

    if (sink.type === "opfs") {
      const { availableBytes } = await checkAvailableStorage()
      if (availableBytes !== null && availableBytes < size) {
        session.stop()
        this.sendControl({ type: "file_decline", id, reason: "storage" })
        this.callbacks.onUpdate(id, {
          status: "error",
          statusReason: `Needs ${formatFileSize(size)} of browser storage, but only ${formatFileSize(Math.max(availableBytes, 0))} is free. Private windows have much less.`,
        })
        return
      }
      // Saving from browser storage makes a second copy.
      if (availableBytes !== null && availableBytes < size * 2 && size >= ACCEPT_THRESHOLD_BYTES) {
        this.callbacks.onNotice(`Saving ${session.fileName} may need about ${formatFileSize(size * 2)} free in total.`)
      }
      if (size >= ACCEPT_THRESHOLD_BYTES) await navigator.storage.persist?.().catch(() => false)

      transfer.releaseLock = await holdFileLock(id)
    }

    session.start(sink)
  }

  private handleFrame(event: MessageEvent) {
    if (!(event.data instanceof ArrayBuffer)) return
    const header = decodeFrameHeader(event.data)
    if (header) this.incomingByStream.get(header.streamId)?.handleFrame(event.data, header)
  }

  public getReceivedFile(id: string): File | null {
    return this.incoming.get(id)?.file ?? null
  }

  private async discardStoredFile(id: string) {
    const transfer = this.incoming.get(id)
    await deleteStoredFile(id)
    transfer?.releaseLock?.()
    if (transfer) transfer.releaseLock = null
  }

  // ─── Progress and control messages ───

  private reportProgress(id: string, bytes: number, size: number) {
    const now = Date.now()
    if (now - (this.lastProgressAt.get(id) ?? 0) < PROGRESS_INTERVAL_MS) return
    this.lastProgressAt.set(id, now)
    this.callbacks.onUpdate(id, { progress: size ? Math.floor((bytes / size) * 100) : 100 })
  }

  public cancelTransfer(id: string) {
    const outgoing = this.outgoing.get(id)
    if (outgoing) {
      this.sendControl({ type: "file_cancel", id })
      outgoing.session.abort(new TransferAbortedError("You cancelled this file"))
      this.removeFromQueue(id)
      return
    }

    const incoming = this.incoming.get(id)
    if (incoming && !incoming.session.isDone && !incoming.session.isStopped) {
      incoming.session.stop()
      this.sendControl({ type: "file_cancel", id })
      this.callbacks.onUpdate(id, { status: "error", statusReason: "You cancelled this file" })
      void this.discardStoredFile(id)
    }
  }

  // A file still in the queue never starts running, so it reports its own result.
  private removeFromQueue(id: string) {
    const queued = this.sendQueue.findIndex((transfer) => transfer.offer.id === id)
    if (queued !== -1) {
      this.sendQueue.splice(queued, 1)
      this.outgoing.delete(id)
      this.callbacks.onUpdate(id, { status: "error", statusReason: "You cancelled this file" })
    }
  }

  public handleControlMessage(raw: unknown): boolean {
    if (typeof raw !== "object" || raw === null) return false
    const type = (raw as { type?: unknown }).type
    if (typeof type !== "string" || !type.startsWith("file_")) return false

    const message = parseTransferMessage(raw)
    if (!message) {
      console.warn("[Transfer] Ignored an invalid message")
      return true
    }

    const outgoing = this.outgoing.get(message.id)?.session
    switch (message.type) {
      case "file_offer":
        this.handleOffer(message)
        break
      case "file_accept":
        outgoing?.handleAccept(message.offset, message.windowBytes)
        break
      case "file_credit":
        outgoing?.handleCredit(message.persistedBytes)
        break
      case "file_received":
        outgoing?.handleReceived()
        break
      case "file_decline":
        outgoing?.abort(new TransferAbortedError(DECLINE_MESSAGES[message.reason], message.reason))
        break
      case "file_cancel":
        outgoing?.abort(new TransferAbortedError("They cancelled this file"))
        this.handleRemoteCancel(message.id)
        break
    }
    return true
  }

  private handleRemoteCancel(id: string) {
    const incoming = this.incoming.get(id)
    if (incoming && !incoming.session.isDone && !incoming.session.isStopped) {
      incoming.session.stop()
      this.callbacks.onUpdate(id, { status: "error", statusReason: "They cancelled this file" })
      void this.discardStoredFile(id)
    }
  }

  // ─── Ending ───

  public failAllActiveTransfers(reason: string) {
    for (const { session } of this.outgoing.values()) {
      session.abort(new TransferAbortedError(reason))
    }
    for (const { offer } of this.sendQueue) {
      this.outgoing.delete(offer.id)
      this.callbacks.onUpdate(offer.id, { status: "error", statusReason: reason })
    }
    this.sendQueue = []

    for (const [id, { session }] of this.incoming) {
      if (!session.isDone && !session.isStopped) {
        session.stop()
        this.callbacks.onUpdate(id, { status: "error", statusReason: reason })
      }
    }
  }

  public cleanup() {
    this.failAllActiveTransfers("Connection closed")
    for (const id of this.incoming.keys()) void this.discardStoredFile(id)
    this.incoming.clear()
    this.incomingByStream.clear()
    this.lastProgressAt.clear()
    this.fileChannel = null
    this.systemChannel = null
  }
}
