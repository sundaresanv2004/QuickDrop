import { BLOCK_BYTES, PROGRESS_INTERVAL_MS, TRANSFER_DIRECTORY } from "../constants"
import { crc32 } from "../crc32"
import { FRAME_HEADER_BYTES } from "../protocol"
import type { SinkRequest, StorageErrorCode, StorageRequest, StorageResponse } from "./storage-protocol"

const scope = self as unknown as {
  postMessage(message: StorageResponse): void
  onmessage: ((event: MessageEvent<StorageRequest>) => void) | null
}

class StorageFailure extends Error {
  constructor(public readonly code: StorageErrorCode, message: string) {
    super(message)
  }
}

// ─── Where a file's bytes go ───

interface Sink {
  write(offset: number, bytes: Uint8Array<ArrayBuffer>): Promise<void> | void
  // Finishes writing and checks every block against the checksum it arrived with.
  finalize(checksums: Uint32Array, size: number): Promise<{ corruptOffset?: number; blob?: Blob }>
  close(): Promise<void> | void
}

// createSyncAccessHandle exists only in dedicated workers, so the DOM types omit it.
interface SyncHandle {
  write(buffer: BufferSource, options: { at: number }): number
  read(buffer: BufferSource, options: { at: number }): number
  truncate(size: number): void
  flush(): void
  close(): void
}
type SyncCapableHandle = FileSystemFileHandle & { createSyncAccessHandle?: () => Promise<SyncHandle> }

const FLUSH_EVERY_BLOCKS = 64

let lastVerifyReport = 0
function reportVerified(bytes: number, size: number) {
  const now = Date.now()
  if (now - lastVerifyReport < PROGRESS_INTERVAL_MS && bytes < size) return
  lastVerifyReport = now
  scope.postMessage({ kind: "verifying", bytes })
}

function verifyBlock(checksums: Uint32Array, offset: number, bytes: Uint8Array): boolean {
  return crc32(bytes) === checksums[offset / BLOCK_BYTES]
}

class OpfsSink implements Sink {
  private writesSinceFlush = 0

  private constructor(private readonly sync: SyncHandle) {}

  static async open(id: string, fileName: string): Promise<OpfsSink> {
    try {
      const root = await navigator.storage.getDirectory()
      const transfers = await root.getDirectoryHandle(TRANSFER_DIRECTORY, { create: true })
      const folder = await transfers.getDirectoryHandle(id, { create: true })
      const handle = (await folder.getFileHandle(fileName, { create: true })) as SyncCapableHandle
      if (!handle.createSyncAccessHandle) throw new Error("Sync access handles are unavailable")

      const sync = await handle.createSyncAccessHandle()
      sync.truncate(0)
      return new OpfsSink(sync)
    } catch (error) {
      throw new StorageFailure("unavailable", error instanceof Error ? error.message : String(error))
    }
  }

  write(offset: number, bytes: Uint8Array<ArrayBuffer>) {
    let written: number
    try {
      written = this.sync.write(bytes, { at: offset })
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        throw new StorageFailure("no_space", error.message)
      }
      throw error
    }
    // Chromium can report a full disk through this return value instead of throwing.
    if (written !== bytes.length) throw new StorageFailure("no_space", `Write returned ${written} at byte ${offset}`)

    if (++this.writesSinceFlush >= FLUSH_EVERY_BLOCKS) {
      this.sync.flush()
      this.writesSinceFlush = 0
    }
  }

  async finalize(checksums: Uint32Array, size: number) {
    this.sync.flush()
    const block = new Uint8Array(BLOCK_BYTES)

    for (let offset = 0; offset < size; offset += BLOCK_BYTES) {
      const expected = Math.min(BLOCK_BYTES, size - offset)
      const view = block.subarray(0, expected)
      const read = this.sync.read(view, { at: offset })
      if (read !== expected || !verifyBlock(checksums, offset, view)) return { corruptOffset: offset }
      reportVerified(offset + expected, size)
    }

    this.sync.close()
    return {}
  }

  close() {
    this.sync.close()
  }
}

// A file the person chose with the save dialog. Writes appear there when it closes.
class PickerSink implements Sink {
  private constructor(
    private readonly handle: FileSystemFileHandle,
    private readonly writable: FileSystemWritableFileStream
  ) {}

  static async open(handle: FileSystemFileHandle): Promise<PickerSink> {
    try {
      return new PickerSink(handle, await handle.createWritable())
    } catch (error) {
      throw new StorageFailure("unavailable", error instanceof Error ? error.message : String(error))
    }
  }

  async write(offset: number, bytes: Uint8Array<ArrayBuffer>) {
    try {
      await this.writable.write({ type: "write", position: offset, data: bytes })
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        throw new StorageFailure("no_space", error.message)
      }
      throw error
    }
  }

  async finalize(checksums: Uint32Array, size: number) {
    await this.writable.close()
    const file = await this.handle.getFile()
    if (file.size !== size) throw new StorageFailure("failed", `Saved file is ${file.size} of ${size} bytes`)

    for (let offset = 0; offset < size; offset += BLOCK_BYTES) {
      const bytes = new Uint8Array(await file.slice(offset, offset + BLOCK_BYTES).arrayBuffer())
      if (!verifyBlock(checksums, offset, bytes)) {
        // The file is closed by now, so there's no way to rewrite this block.
        throw new StorageFailure("failed", `The saved file was damaged at byte ${offset}`)
      }
      reportVerified(offset + bytes.length, size)
    }
    return {}
  }

  async close() {
    await this.writable.abort().catch(() => {})
  }
}

class MemorySink implements Sink {
  private readonly blocks: Uint8Array<ArrayBuffer>[] = []

  write(offset: number, bytes: Uint8Array<ArrayBuffer>) {
    // The shared block buffer is reused for the next write.
    this.blocks[offset / BLOCK_BYTES] = bytes.slice()
  }

  async finalize() {
    return { blob: new Blob(this.blocks) }
  }

  close() {}
}

function openSink(request: SinkRequest): Promise<Sink> | Sink {
  switch (request.type) {
    case "opfs": return OpfsSink.open(request.id, request.fileName)
    case "picker": return PickerSink.open(request.handle)
    case "memory": return new MemorySink()
  }
}

// ─── Handling requests ───

let sink: Sink | null = null
let size = 0
let checksums = new Uint32Array(0)
let nextOffset = 0
const assembled = new Uint8Array(BLOCK_BYTES)

function writeBlock(offset: number, crc: number, frames: ArrayBuffer[]) {
  // Blocks that follow a damaged one are dropped until the sender rewinds.
  if (offset !== nextOffset || !sink) return

  let length = 0
  for (const frame of frames) {
    const payload = new Uint8Array(frame, FRAME_HEADER_BYTES)
    if (length + payload.length > BLOCK_BYTES) {
      scope.postMessage({ kind: "corrupt", offset })
      return
    }
    assembled.set(payload, length)
    length += payload.length
  }

  const bytes = assembled.subarray(0, length)
  if (crc32(bytes) !== crc) {
    scope.postMessage({ kind: "corrupt", offset })
    return
  }

  checksums[offset / BLOCK_BYTES] = crc
  return Promise.resolve(sink.write(offset, bytes)).then(() => {
    nextOffset = offset + length
    scope.postMessage({ kind: "persisted", bytes: nextOffset })
  })
}

async function handleRequest(request: StorageRequest) {
  switch (request.kind) {
    case "open":
      size = request.size
      checksums = new Uint32Array(Math.ceil(size / BLOCK_BYTES))
      nextOffset = 0
      sink = await openSink(request.sink)
      scope.postMessage({ kind: "opened" })
      break
    case "block":
      await writeBlock(request.offset, request.crc, request.frames)
      break
    case "rewind":
      nextOffset = request.offset
      break
    case "finalize": {
      if (!sink) break
      const { corruptOffset, blob } = await sink.finalize(checksums, size)
      if (corruptOffset !== undefined) {
        nextOffset = corruptOffset
        scope.postMessage({ kind: "corrupt", offset: corruptOffset })
      } else {
        sink = null
        scope.postMessage({ kind: "finalized", blob })
      }
      break
    }
  }
}

// Requests run strictly in order, even though some writes are asynchronous.
let queue: Promise<void> = Promise.resolve()

scope.onmessage = ({ data }) => {
  queue = queue.then(() => handleRequest(data)).catch((error) => {
    const failure = error instanceof StorageFailure
      ? error
      : new StorageFailure("failed", error instanceof Error ? error.message : String(error))
    console.error("[Transfer] Storage failed:", failure.message)
    Promise.resolve(sink?.close()).catch(() => {})
    sink = null
    scope.postMessage({ kind: "error", code: failure.code, message: failure.message })
  })
}
