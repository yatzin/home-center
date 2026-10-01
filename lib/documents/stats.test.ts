import { describe, expect, it } from "vitest"
import { formatIndexStats } from "./stats"

describe("formatIndexStats", () => {
  it("lists only the non-zero groups after the searchable count", () => {
    expect(formatIndexStats({ DONE: 412, PENDING: 6, FAILED: 3, UNSUPPORTED: 9 }, true)).toBe("412 searchable · 6 waiting · 3 failed · 9 not supported")
    expect(formatIndexStats({}, true)).toBe("0 searchable")
    expect(formatIndexStats({ DONE: 1, EMPTY: 2 }, true)).toBe("1 searchable · 2 with no text")
  })
  it("says indexing is off, with the backlog", () => {
    expect(formatIndexStats({ DONE: 4, PENDING: 6 }, false)).toBe("Indexing is off — 6 uploads waiting.")
    expect(formatIndexStats({ PENDING: 1 }, false)).toBe("Indexing is off — 1 upload waiting.")
    expect(formatIndexStats({ DONE: 4 }, false)).toBe("Indexing is off.")
  })

  it("shows meaning-vector progress while embedding, and readiness when done", () => {
    expect(formatIndexStats({ DONE: 3 }, true, { withVectors: 40, chunks: 100 })).toBe("3 searchable · 40 of 100 chunks have meaning vectors")
    expect(formatIndexStats({ DONE: 3 }, true, { withVectors: 100, chunks: 100 })).toBe("3 searchable · meaning search ready")
    expect(formatIndexStats({ DONE: 3 }, true, null)).toBe("3 searchable")
  })
})
