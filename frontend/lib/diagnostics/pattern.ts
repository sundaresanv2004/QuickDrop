// Test files use repeatable pseudo-random data. A saved file can be checked
// later without keeping a copy of it or holding the whole file in memory.

export const TEST_BLOCK_BYTES = 4 * 1024 * 1024

export function fillPattern(words: Uint32Array, blockIndex: number) {
  // xorshift32. The state must never be zero.
  let state = (Math.imul(blockIndex + 1, 0x9e3779b1) >>> 0) || 1
  for (let i = 0; i < words.length; i++) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    words[i] = state >>> 0
  }
}

export function matchesPattern(words: Uint32Array, expected: Uint32Array, blockIndex: number): boolean {
  fillPattern(expected, blockIndex)
  for (let i = 0; i < words.length; i++) {
    if (words[i] !== expected[i]) return false
  }
  return true
}
