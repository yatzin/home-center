import { describe, expect, it } from "vitest"
import { fuse } from "./fusion"
import type { Hit } from "../index-db"

const hit = (chunkId: number): Hit => ({ chunkId, attachmentId: `a${chunkId}`, page: 1, text: `t${chunkId}`, score: 0 })

describe("fuse", () => {
  it("ranks a chunk found by both searches above the top of either one", () => {
    const keyword = [hit(1), hit(2)]
    const vector = [hit(3), hit(2)]
    expect(fuse([keyword, vector], 10).map((h) => h.chunkId)).toEqual([2, 1, 3])
  })

  it("keeps a single list's order when the other is empty", () => {
    expect(fuse([[hit(5), hit(6), hit(7)], []], 10).map((h) => h.chunkId)).toEqual([5, 6, 7])
  })

  it("returns lower-is-better scores and honours the limit", () => {
    const out = fuse([[hit(1), hit(2), hit(3)]], 2)
    expect(out).toHaveLength(2)
    expect(out[0].score).toBeLessThan(out[1].score)
    expect(out[0].score).toBeCloseTo(-1 / 61)
  })
})
