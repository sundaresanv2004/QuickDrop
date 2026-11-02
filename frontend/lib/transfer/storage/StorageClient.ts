import { TRANSFER_DIRECTORY } from "../constants"
import type { SinkRequest, StorageRequest, StorageResponse } from "./storage-protocol"

const LOCK_PREFIX = "quickdrop-transfer-"
const LEGACY_DATABASE = "QuickDropDB"

// Runs one file's storage worker.
export class StorageClient {
  private worker: Worker

  constructor(private readonly onResponse: (response: StorageResponse) => void) {
    this.worker = new Worker(new URL("./storage.worker.ts", import.meta.url), { type: "module" })
    this.worker.onmessage = ({ data }: MessageEvent<StorageResponse>) => this.onResponse(data)
    this.worker.onerror = (event) => {
      this.onResponse({ kind: "error", code: "failed", message: event.message || "Storage worker failed" })
    }
  }

  private post(request: StorageRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(request, transfer)
  }

  open(sink: SinkRequest, size: number) {
    this.post({ kind: "open", sink, size })
  }

  writeBlock(offset: number, crc: number, frames: ArrayBuffer[]) {
    this.post({ kind: "block", offset, crc, frames }, frames)
  }

  rewind(offset: number) {
    this.post({ kind: "rewind", offset })
  }

  finalize() {
    this.post({ kind: "finalize" })
  }

  close() {
    this.worker.terminate()
  }
}

// ─── Files kept for the current session ───

async function transfersDirectory(create: boolean) {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(TRANSFER_DIRECTORY, { create })
}

export async function readStoredFile(id: string, fileName: string): Promise<File> {
  const transfers = await transfersDirectory(false)
  const folder = await transfers.getDirectoryHandle(id)
  return (await folder.getFileHandle(fileName)).getFile()
}

export async function deleteStoredFile(id: string) {
  try {
    const transfers = await transfersDirectory(false)
    await transfers.removeEntry(id, { recursive: true })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) {
      console.warn("[Transfer] Couldn't delete a stored file:", error)
    }
  }
}

// A held lock tells other tabs this file is in use. The browser releases it if
// the tab closes, which is how a later sweep knows the file was left behind.
export function holdFileLock(id: string): Promise<() => void> {
  if (!navigator.locks) return Promise.resolve(() => {})

  return new Promise((resolveHeld) => {
    void navigator.locks.request(LOCK_PREFIX + id, () =>
      new Promise<void>((release) => resolveHeld(release))
    )
  })
}

export async function sweepAbandonedFiles() {
  try {
    if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase(LEGACY_DATABASE)
    if (!navigator.locks || !navigator.storage?.getDirectory) return

    const transfers = await transfersDirectory(true)
    const directory = transfers as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }
    for await (const id of directory.keys()) {
      await navigator.locks.request(LOCK_PREFIX + id, { ifAvailable: true }, async (lock) => {
        if (lock) await deleteStoredFile(id)
      })
    }
  } catch (error) {
    // Disk storage may be unavailable, such as in a private window.
    console.info("[Transfer] Skipped cleaning up old files:", error)
  }
}

export interface StorageCheck {
  availableBytes: number | null
}

export async function checkAvailableStorage(): Promise<StorageCheck> {
  try {
    const { quota, usage } = await navigator.storage.estimate()
    return { availableBytes: quota === undefined ? null : quota - (usage ?? 0) }
  } catch {
    return { availableBytes: null }
  }
}
