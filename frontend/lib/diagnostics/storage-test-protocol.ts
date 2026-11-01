// Shared by the page and the worker. It stays separate from storage-test.ts so
// the worker bundle never imports the code that starts the worker.

export const TEST_DIRECTORY = "quickdrop-diagnostics"

export type StorageTestRequest =
  | { kind: "probe" }
  | { kind: "write-verify"; name: string; totalBytes: number }
  | { kind: "read-file"; file: File; verifyPattern: boolean }
  | { kind: "delete-files" }

export type StorageTestResponse =
  | { kind: "probe"; syncAccessHandle: boolean }
  | { kind: "progress"; phase: "write" | "verify" | "read"; bytesDone: number; totalBytes: number }
  | { kind: "done"; bytes: number; writeMs: number; readMs: number }
  | { kind: "error"; name: string; message: string; phase: string; bytesDone: number }
