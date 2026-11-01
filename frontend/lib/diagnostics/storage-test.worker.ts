import { fillPattern, matchesPattern, TEST_BLOCK_BYTES } from "./pattern"
import type { StorageTestRequest, StorageTestResponse } from "./storage-test"
import { TEST_DIRECTORY } from "./storage-test"

// createSyncAccessHandle exists only in dedicated workers, so the DOM types omit it.
interface SyncHandle {
  write(buffer: BufferSource, options: { at: number }): number
  read(buffer: BufferSource, options: { at: number }): number
  truncate(size: number): void
  flush(): void
  getSize(): number
  close(): void
}
type SyncCapableHandle = FileSystemFileHandle & { createSyncAccessHandle?: () => Promise<SyncHandle> }

const scope = self as unknown as {
  postMessage(message: StorageTestResponse): void
  onmessage: ((event: MessageEvent<StorageTestRequest>) => void) | null
}

const PROGRESS_INTERVAL_MS = 250
const FLUSH_EVERY_BLOCKS = 64

let lastProgressAt = 0
let currentPhase: "write" | "verify" | "read" = "write"
let currentBytes = 0

function reportProgress(phase: typeof currentPhase, bytesDone: number, totalBytes: number) {
  currentPhase = phase
  currentBytes = bytesDone
  const now = Date.now()
  if (now - lastProgressAt < PROGRESS_INTERVAL_MS && bytesDone < totalBytes) return
  lastProgressAt = now
  scope.postMessage({ kind: "progress", phase, bytesDone, totalBytes })
}

async function openTestDirectory() {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(TEST_DIRECTORY, { create: true })
}

async function probeSyncHandle() {
  const directory = await openTestDirectory()
  const handle = (await directory.getFileHandle("probe.bin", { create: true })) as SyncCapableHandle
  try {
    if (!handle.createSyncAccessHandle) return false
    const sync = await handle.createSyncAccessHandle()
    sync.close()
    return true
  } finally {
    await directory.removeEntry("probe.bin").catch(() => {})
  }
}

async function writeAndVerify(name: string, totalBytes: number) {
  const directory = await openTestDirectory()
  const handle = (await directory.getFileHandle(name, { create: true })) as SyncCapableHandle
  if (!handle.createSyncAccessHandle) throw new Error("Sync access handles are not available")

  const sync = await handle.createSyncAccessHandle()
  const block = new Uint32Array(TEST_BLOCK_BYTES / 4)
  const expected = new Uint32Array(TEST_BLOCK_BYTES / 4)
  const blocks = totalBytes / TEST_BLOCK_BYTES

  try {
    sync.truncate(0)

    const writeStart = performance.now()
    for (let i = 0; i < blocks; i++) {
      const at = i * TEST_BLOCK_BYTES
      fillPattern(block, i)
      const written = sync.write(block, { at })
      if (written !== TEST_BLOCK_BYTES) throw new Error(`Short write at ${at}: ${written} bytes`)
      if ((i + 1) % FLUSH_EVERY_BLOCKS === 0) sync.flush()
      reportProgress("write", at + written, totalBytes)
    }
    sync.flush()
    const writeMs = performance.now() - writeStart

    if (sync.getSize() !== totalBytes) throw new Error(`Unexpected file size: ${sync.getSize()}`)

    const verifyStart = performance.now()
    for (let i = 0; i < blocks; i++) {
      const at = i * TEST_BLOCK_BYTES
      const read = sync.read(block, { at })
      if (read !== TEST_BLOCK_BYTES) throw new Error(`Short read at ${at}: ${read} bytes`)
      if (!matchesPattern(block, expected, i)) throw new Error(`Data mismatch at byte ${at}`)
      reportProgress("verify", at + read, totalBytes)
    }

    scope.postMessage({ kind: "done", bytes: totalBytes, writeMs, readMs: performance.now() - verifyStart })
  } finally {
    sync.close()
  }
}

// Reads from disk one block at a time, like the future sender, so memory stays flat.
async function readFile(file: File, verifyPattern: boolean) {
  if (verifyPattern && (file.size === 0 || file.size % TEST_BLOCK_BYTES !== 0)) {
    throw new Error(`Saved file has the wrong size: ${file.size} bytes`)
  }

  const expected = new Uint32Array(TEST_BLOCK_BYTES / 4)
  const start = performance.now()
  for (let offset = 0, i = 0; offset < file.size; offset += TEST_BLOCK_BYTES, i++) {
    const data = await file.slice(offset, offset + TEST_BLOCK_BYTES).arrayBuffer()
    if (verifyPattern && !matchesPattern(new Uint32Array(data), expected, i)) {
      throw new Error(`Data mismatch at byte ${offset}`)
    }
    reportProgress("read", offset + data.byteLength, file.size)
  }

  scope.postMessage({ kind: "done", bytes: file.size, writeMs: 0, readMs: performance.now() - start })
}

async function deleteTestFiles() {
  const root = await navigator.storage.getDirectory()
  await root.removeEntry(TEST_DIRECTORY, { recursive: true }).catch((error: DOMException) => {
    if (error.name !== "NotFoundError") throw error
  })
  scope.postMessage({ kind: "done", bytes: 0, writeMs: 0, readMs: 0 })
}

scope.onmessage = async ({ data }) => {
  lastProgressAt = 0
  currentBytes = 0
  try {
    switch (data.kind) {
      case "probe":
        scope.postMessage({ kind: "probe", syncAccessHandle: await probeSyncHandle() })
        break
      case "write-verify":
        await writeAndVerify(data.name, data.totalBytes)
        break
      case "read-file":
        await readFile(data.file, data.verifyPattern)
        break
      case "delete-files":
        await deleteTestFiles()
        break
    }
  } catch (error) {
    const { name, message } = error instanceof Error ? error : new Error(String(error))
    scope.postMessage({ kind: "error", name, message, phase: currentPhase, bytesDone: currentBytes })
  }
}
