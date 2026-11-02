export const MAX_FILE_BYTES = 5 * 1024 ** 3

// Larger files wait for an explicit Accept, because they use real storage.
export const ACCEPT_THRESHOLD_BYTES = 100 * 1024 * 1024

// Used only where disk storage is unavailable, such as some private windows.
// iOS Safari has been reported to crash at around 400 MB of page memory.
export const MEMORY_FALLBACK_LIMIT_BYTES = 200 * 1024 * 1024

export const BLOCK_BYTES = 1024 * 1024

// Fits every browser's data channel limit, including the 64 KB default.
export const MAX_MESSAGE_BYTES = 64000

// How far the sender can get ahead of what the receiver has written to disk.
export const DESKTOP_WINDOW_BYTES = 16 * 1024 * 1024
export const MOBILE_WINDOW_BYTES = 4 * 1024 * 1024

export const BUFFER_HIGH_BYTES = 2 * 1024 * 1024
export const BUFFER_LOW_BYTES = 512 * 1024

export const PROGRESS_INTERVAL_MS = 250
export const MAX_CORRUPT_RETRIES = 3

export const TRANSFER_DIRECTORY = "quickdrop-transfers"
