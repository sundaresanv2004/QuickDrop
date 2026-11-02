import { describe, expect, it } from "vitest"
import { BLOCK_BYTES, MAX_FILE_BYTES } from "../constants"
import { crc32 } from "../crc32"
import {
  decodeFrameHeader,
  encodeFrames,
  FRAME_HEADER_BYTES,
  isOfferAllowed,
  parseTransferMessage,
  sanitizeFileName,
} from "../protocol"

const ID = "6f1c2f0e-1234-4abc-8def-001122334455"

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926)
  })

  it("handles empty input", () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it("detects a single flipped bit", () => {
    const bytes = new Uint8Array(4096).fill(7)
    const before = crc32(bytes)
    bytes[2048] ^= 1
    expect(crc32(bytes)).not.toBe(before)
  })
})

describe("frames", () => {
  const block = Uint8Array.from({ length: 2500 }, (_, index) => index % 251)

  function reassemble(frames: ArrayBuffer[]) {
    const parts = frames.map((frame) => new Uint8Array(frame, FRAME_HEADER_BYTES))
    return Uint8Array.from(parts.flatMap((part) => Array.from(part)))
  }

  it("splits a block into frames within the message limit", () => {
    const frames = encodeFrames(7, 0, 1234, block, 1000)
    expect(frames).toHaveLength(3)
    frames.forEach((frame) => expect(frame.byteLength).toBeLessThanOrEqual(1000))
    expect(reassemble(frames)).toEqual(block)
  })

  it("records where each frame belongs", () => {
    const start = 3 * BLOCK_BYTES
    const headers = encodeFrames(7, start, 0xfedcba98, block, 1000).map(decodeFrameHeader)

    expect(headers.map((header) => header?.offset)).toEqual([start, start + 980, start + 1960])
    headers.forEach((header) => {
      expect(header?.streamId).toBe(7)
      expect(header?.blockCrc).toBe(0xfedcba98)
    })
    expect(headers[2]?.payloadBytes).toBe(540)
  })

  it("keeps offsets exact beyond 4 GB", () => {
    const offset = MAX_FILE_BYTES - BLOCK_BYTES
    const [frame] = encodeFrames(1, offset, 0, block, 4000)
    expect(decodeFrameHeader(frame)?.offset).toBe(offset)
  })

  it("rejects malformed frames", () => {
    expect(decodeFrameHeader(new ArrayBuffer(FRAME_HEADER_BYTES))).toBeNull()
    expect(decodeFrameHeader(new ArrayBuffer(4))).toBeNull()

    const wrongVersion = encodeFrames(1, 0, 0, block, 1000)[0]
    new DataView(wrongVersion).setUint8(0, 1)
    expect(decodeFrameHeader(wrongVersion)).toBeNull()

    const badOffset = encodeFrames(1, 0, 0, block, 1000)[0]
    new DataView(badOffset).setFloat64(8, 1.5)
    expect(decodeFrameHeader(badOffset)).toBeNull()

    const negativeOffset = encodeFrames(1, 0, 0, block, 1000)[0]
    new DataView(negativeOffset).setFloat64(8, -1048576)
    expect(decodeFrameHeader(negativeOffset)).toBeNull()
  })
})

describe("parseTransferMessage", () => {
  const offer = { type: "file_offer", id: ID, streamId: 1, name: "a.zip", size: 10, mimeType: "application/zip" }

  it("accepts valid messages", () => {
    expect(parseTransferMessage(offer)).toEqual(offer)
    expect(parseTransferMessage({ type: "file_accept", id: ID, offset: BLOCK_BYTES, windowBytes: BLOCK_BYTES })).not.toBeNull()
    expect(parseTransferMessage({ type: "file_credit", id: ID, persistedBytes: 5 })).not.toBeNull()
    expect(parseTransferMessage({ type: "file_received", id: ID })).not.toBeNull()
    expect(parseTransferMessage({ type: "file_cancel", id: ID })).not.toBeNull()
  })

  it("rejects an ID that could escape its folder", () => {
    expect(parseTransferMessage({ ...offer, id: "../../secrets" })).toBeNull()
    expect(parseTransferMessage({ ...offer, id: "a/b" })).toBeNull()
    expect(parseTransferMessage({ ...offer, id: "" })).toBeNull()
    expect(parseTransferMessage({ ...offer, id: 5 })).toBeNull()
  })

  it("rejects invalid numbers", () => {
    expect(parseTransferMessage({ ...offer, size: -1 })).toBeNull()
    expect(parseTransferMessage({ ...offer, size: 1.5 })).toBeNull()
    expect(parseTransferMessage({ ...offer, size: "10" })).toBeNull()
    expect(parseTransferMessage({ ...offer, streamId: 2 ** 32 })).toBeNull()
    expect(parseTransferMessage({ type: "file_accept", id: ID, offset: 5, windowBytes: BLOCK_BYTES })).toBeNull()
    expect(parseTransferMessage({ type: "file_accept", id: ID, offset: 0, windowBytes: 0 })).toBeNull()
  })

  it("rejects unknown shapes", () => {
    expect(parseTransferMessage(null)).toBeNull()
    expect(parseTransferMessage("file_offer")).toBeNull()
    expect(parseTransferMessage({ type: "file_unknown", id: ID })).toBeNull()
  })

  it("treats an unknown decline reason as a plain decline", () => {
    expect(parseTransferMessage({ type: "file_decline", id: ID, reason: "whatever" })).toEqual({
      type: "file_decline",
      id: ID,
      reason: "declined",
    })
  })
})

describe("isOfferAllowed", () => {
  const offer = { type: "file_offer" as const, id: ID, streamId: 1, name: "a", mimeType: "" }

  it("enforces the 5 GB limit", () => {
    expect(isOfferAllowed({ ...offer, size: MAX_FILE_BYTES })).toBe(true)
    expect(isOfferAllowed({ ...offer, size: MAX_FILE_BYTES + 1 })).toBe(false)
  })
})

describe("sanitizeFileName", () => {
  it("keeps ordinary names", () => {
    expect(sanitizeFileName("Holiday photo (1).jpg")).toBe("Holiday photo (1).jpg")
    expect(sanitizeFileName("நோட்ஸ்.pdf")).toBe("நோட்ஸ்.pdf")
  })

  it("removes path separators and control characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("_.._etc_passwd")
    expect(sanitizeFileName("a\\b:c*d?e\"f<g>h|i")).toBe("a_b_c_d_e_f_g_h_i")
    expect(sanitizeFileName("a\u0000b\nc")).toBe("a_b_c")
  })

  it("removes leading dots", () => {
    expect(sanitizeFileName(".bashrc")).toBe("bashrc")
    expect(sanitizeFileName("...")).toBe("file")
  })

  it("never returns an empty name", () => {
    expect(sanitizeFileName("")).toBe("file")
    expect(sanitizeFileName("   ")).toBe("file")
  })

  it("shortens long names but keeps the extension", () => {
    const name = sanitizeFileName(`${"x".repeat(500)}.mp4`)
    expect(name.length).toBe(200)
    expect(name.endsWith(".mp4")).toBe(true)
  })
})
