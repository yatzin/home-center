import { describe, expect, it } from "vitest"
import { hasText, isBlankPage, joinPages, normalizePage, splitPages } from "./normalize"

describe("normalizePage", () => {
  it("collapses runs of spaces and tabs but keeps line breaks", () => {
    expect(normalizePage("Filter   size\t\t16x25x1  \n  MERV 8")).toBe("Filter size 16x25x1\nMERV 8")
  })
  it("turns CRLF into LF and squeezes blank lines to one", () => {
    expect(normalizePage("a\r\n\r\n\r\n\r\nb\rc")).toBe("a\n\nb\nc")
  })
  it("replaces control characters, including a stray page break", () => {
    expect(normalizePage("a\u0000b\fc\u0007d")).toBe("a b c d")
  })
  it("treats non-breaking spaces as spaces and trims", () => {
    expect(normalizePage("  total  42 ")).toBe("total 42")
  })
})

describe("joinPages / splitPages", () => {
  it("joins normalised pages with form feeds and counts them", () => {
    const j = joinPages(["one  ", "", "three"])
    expect(j).toEqual({ text: "one\f\fthree", pageCount: 3, truncated: false })
    expect(splitPages(j.text)).toEqual(["one", "", "three"])
  })
  it("caps the total length and says so", () => {
    const j = joinPages(["x".repeat(30), "y".repeat(30)], 40)
    expect(j.text.length).toBe(40)
    expect(j.truncated).toBe(true)
    expect(j.pageCount).toBe(2)
  })
})

describe("hasText / isBlankPage", () => {
  it("sees text anywhere but not in whitespace and page breaks", () => {
    expect(hasText("\f \n\f")).toBe(false)
    expect(hasText("\f\fx")).toBe(true)
  })
  it("calls a page blank under 20 visible characters", () => {
    expect(isBlankPage("  Page 3  ")).toBe(true)
    expect(isBlankPage("Replace the filter every ninety days")).toBe(false)
  })
})
