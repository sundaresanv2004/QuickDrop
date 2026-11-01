import { describe, expect, it } from "vitest"
import { buildPairLink, formatCountdown, readPairToken } from "../pair-link"

describe("pair links", () => {
  it("keeps the token in the fragment", () => {
    const link = new URL(buildPairLink("https://quickdrop.example", "abc_123-XYZ"))
    expect(link.pathname).toBe("/")
    expect(link.search).toBe("")
    expect(link.hash).toBe("#pair=abc_123-XYZ")
  })

  it("reads back the token it built", () => {
    const { hash } = new URL(buildPairLink("https://quickdrop.example", "abc_123-XYZ"))
    expect(readPairToken(hash)).toBe("abc_123-XYZ")
  })

  it("ignores anything else in the fragment", () => {
    expect(readPairToken("")).toBeNull()
    expect(readPairToken("#section")).toBeNull()
    expect(readPairToken("#pair=")).toBeNull()
    expect(readPairToken("#pair=abc&next=/evil")).toBeNull()
    expect(readPairToken("#pair=<script>")).toBeNull()
  })
})

describe("formatCountdown", () => {
  it("formats minutes and seconds", () => {
    expect(formatCountdown(300)).toBe("5:00")
    expect(formatCountdown(61)).toBe("1:01")
    expect(formatCountdown(9)).toBe("0:09")
  })

  it("rounds up and never goes negative", () => {
    expect(formatCountdown(0.2)).toBe("0:01")
    expect(formatCountdown(-5)).toBe("0:00")
  })
})
