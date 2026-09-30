import { describe, expect, it } from "vitest"
import { passage } from "./passage"

const filler = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ")

describe("passage", () => {
  it("returns short text whole, with whitespace flattened", () => {
    expect(passage("Filter size\n16x25x1", ["filter"])).toBe("Filter size 16x25x1")
  })

  it("centres on the first matched term and marks both cuts", () => {
    const text = `${filler(200)} replace the filter with a 16x25x1 ${filler(200)}`
    const p = passage(text, ["16x25x1"])
    expect(p).toContain("16x25x1")
    expect(p.startsWith("…")).toBe(true)
    expect(p.endsWith("…")).toBe(true)
    expect(p.length).toBeLessThanOrEqual(302)
  })

  it("finds a plural or -ing form of the term", () => {
    const text = `${filler(200)} filters are in the garage ${filler(200)}`
    expect(passage(text, ["filters"])).toContain("filters are in the garage")
    expect(passage(text, ["filtering"])).toContain("filters are in the garage")
  })

  it("falls back to the start when no term is found", () => {
    const p = passage(filler(300), ["nothing"])
    expect(p.startsWith("word0 ")).toBe(true)
    expect(p.endsWith("…")).toBe(true)
  })
})
