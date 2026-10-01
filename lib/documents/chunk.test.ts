import { describe, expect, it } from "vitest"
import { chunkPages } from "./chunk"

const words = (n: number, prefix = "w") => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(4, "0")}`).join(" ")

describe("chunkPages", () => {
  it("keeps a short page as one chunk", () => {
    expect(chunkPages(["Filter size 16x25x1."])).toEqual([{ page: 1, ordinal: 0, text: "Filter size 16x25x1." }])
  })

  it("never lets a chunk cross a page, and keeps page numbers after a blank page", () => {
    const chunks = chunkPages(["first page", "", "third page"])
    expect(chunks.map((c) => [c.page, c.text])).toEqual([[1, "first page"], [3, "third page"]])
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1])
  })

  it("splits long pages into chunks no longer than the size, overlapping", () => {
    const chunks = chunkPages([words(500)]) // 2,999 chars
    expect(chunks.length).toBeGreaterThan(2)
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1000)
    for (let i = 1; i < chunks.length; i++) {
      const firstWord = chunks[i].text.split(" ")[0]
      expect(chunks[i - 1].text).toContain(firstWord)
    }
    // Nothing lost: every word appears in some chunk.
    const all = chunks.map((c) => c.text).join(" ")
    for (const w of words(500).split(" ")) expect(all).toContain(w)
  })

  it("prefers paragraph breaks over mid-sentence cuts", () => {
    const para = "x".repeat(700)
    const chunks = chunkPages([`${para}\n\n${"y".repeat(700)}`])
    expect(chunks[0].text).toBe(para)
  })

  it("hard-cuts text with no spaces at all", () => {
    const chunks = chunkPages(["z".repeat(2500)])
    expect(chunks[0].text.length).toBe(1000)
    expect(chunks.length).toBe(3)
  })
})
