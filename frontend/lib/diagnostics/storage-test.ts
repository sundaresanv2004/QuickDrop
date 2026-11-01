import { StorageTestRequest, StorageTestResponse, TEST_DIRECTORY } from "./storage-test-protocol"

export type StorageTestProgress = Extract<StorageTestResponse, { kind: "progress" }>
export type StorageTestResult = Extract<StorageTestResponse, { kind: "done" }>

export function testFileName(totalBytes: number) {
  return `quickdrop-test-${Math.round(totalBytes / 1024 ** 3)}gib.bin`
}

export class StorageTestError extends Error {
  constructor(public readonly detail: Extract<StorageTestResponse, { kind: "error" }>) {
    super(`${detail.name}: ${detail.message}`)
  }
}

export interface RunningStorageTest {
  result: Promise<StorageTestResult>
  cancel: () => void
}

function createWorker() {
  return new Worker(new URL("./storage-test.worker.ts", import.meta.url), { type: "module" })
}

export function runStorageTest(
  request: Exclude<StorageTestRequest, { kind: "probe" }>,
  onProgress?: (progress: StorageTestProgress) => void
): RunningStorageTest {
  const worker = createWorker()
  let rejectResult: (reason: Error) => void = () => {}

  const result = new Promise<StorageTestResult>((resolve, reject) => {
    rejectResult = reject
    worker.onmessage = ({ data }: MessageEvent<StorageTestResponse>) => {
      if (data.kind === "progress") onProgress?.(data)
      if (data.kind === "done") resolve(data)
      if (data.kind === "error") reject(new StorageTestError(data))
    }
    worker.onerror = (event) => reject(new Error(event.message || "Worker failed to start"))
    worker.postMessage(request)
  }).finally(() => worker.terminate())

  return {
    result,
    cancel: () => rejectResult(new DOMException("Cancelled", "AbortError")),
  }
}

export function probeSyncAccessHandle(): Promise<boolean> {
  const worker = createWorker()
  return new Promise<boolean>((resolve) => {
    worker.onmessage = ({ data }: MessageEvent<StorageTestResponse>) => {
      resolve(data.kind === "probe" && data.syncAccessHandle)
    }
    worker.onerror = () => resolve(false)
    worker.postMessage({ kind: "probe" } satisfies StorageTestRequest)
  }).finally(() => worker.terminate())
}

export async function getTestFile(name: string): Promise<File> {
  const root = await navigator.storage.getDirectory()
  const directory = await root.getDirectoryHandle(TEST_DIRECTORY)
  const handle = await directory.getFileHandle(name)
  return handle.getFile()
}
