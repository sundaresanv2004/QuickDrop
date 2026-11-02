export type SinkRequest =
  | { type: "opfs"; id: string; fileName: string }
  | { type: "picker"; handle: FileSystemFileHandle }
  | { type: "memory" }

export type StorageRequest =
  | { kind: "open"; sink: SinkRequest; size: number }
  | { kind: "block"; offset: number; crc: number; frames: ArrayBuffer[] }
  | { kind: "rewind"; offset: number }
  | { kind: "finalize" }

export type StorageErrorCode = "unavailable" | "no_space" | "failed"

export type StorageResponse =
  | { kind: "opened" }
  | { kind: "persisted"; bytes: number }
  | { kind: "corrupt"; offset: number }
  | { kind: "verifying"; bytes: number }
  | { kind: "finalized"; blob?: Blob }
  | { kind: "error"; code: StorageErrorCode; message: string }
