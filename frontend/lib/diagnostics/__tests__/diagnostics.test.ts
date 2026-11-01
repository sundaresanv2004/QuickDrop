import { describe, expect, it } from "vitest"
import { describeCandidate } from "../connection-log"
import { fillPattern, matchesPattern } from "../pattern"
import { createResult, markInterrupted } from "../results"

describe("describeCandidate", () => {
  it("separates hidden local names from visible local addresses", () => {
    expect(describeCandidate("candidate:1 1 udp 2122 abc-123.local 5000 typ host")).toBe("host-mdns")
    expect(describeCandidate("candidate:1 1 udp 2122 192.168.1.5 5000 typ host")).toBe("host-ip")
  })

  it("recognises other candidate types", () => {
    expect(describeCandidate("candidate:2 1 udp 1686 203.0.113.7 5000 typ srflx raddr 0.0.0.0 rport 0")).toBe("srflx")
    expect(describeCandidate("candidate:3 1 udp 41 203.0.113.9 5000 typ relay")).toBe("relay")
  })

  it("handles missing or malformed values", () => {
    expect(describeCandidate(null)).toBe("unknown")
    expect(describeCandidate("")).toBe("unknown")
    expect(describeCandidate("not a candidate")).toBe("unknown")
  })
})

describe("test file pattern", () => {
  it("is repeatable and differs between blocks", () => {
    const first = new Uint32Array(1024)
    const again = new Uint32Array(1024)
    const next = new Uint32Array(1024)

    fillPattern(first, 0)
    fillPattern(again, 0)
    fillPattern(next, 1)

    expect(again).toEqual(first)
    expect(next).not.toEqual(first)
  })

  it("detects a single changed value", () => {
    const block = new Uint32Array(1024)
    const scratch = new Uint32Array(1024)
    fillPattern(block, 7)
    expect(matchesPattern(block, scratch, 7)).toBe(true)

    block[512] ^= 1
    expect(matchesPattern(block, scratch, 7)).toBe(false)
  })
})

describe("markInterrupted", () => {
  it("reports only tests that were still running", () => {
    const running = createResult("Disk", 1, 1)
    const awaiting = { ...createResult("Save", 1, 2), status: "awaiting-confirmation" as const }
    const passed = { ...createResult("Disk", 1, 3), status: "pass" as const }

    const [first, second, third] = markInterrupted([running, awaiting, passed])

    expect(first.status).toBe("interrupted")
    expect(second.status).toBe("awaiting-confirmation")
    expect(third.status).toBe("pass")
  })
})
