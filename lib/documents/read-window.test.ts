import { describe, expect, it } from "vitest"
import { readWindow } from "./read-window"

describe("readWindow", () => {
  it("returns every page with headers when they fit", () => {
    const w = readWindow(["alpha", "beta"])
    expect(w).toEqual({ text: "[Page 1]\nalpha\n\n[Page 2]\nbeta", next: null })
  })

  it("leaves out the header for a single-page document", () => {
    expect(readWindow(["only page"]).text).toBe("only page")
  })

  it("starts at the requested page", () => {
    expect(readWindow(["a", "b", "c"], 2).text).toBe("[Page 2]\nb\n\n[Page 3]\nc")
  })

  it("stops at a page boundary when the next page would mostly not fit", () => {
    const page = "p".repeat(4000)
    const w = readWindow([page, page, page])
    expect(w.text).toContain("[Page 2]")
    expect(w.text).not.toContain("[Page 3]")
    expect(w.next).toEqual({ fromPage: 3, offset: 0 })
  })

  it("pages through one huge page with offsets and loses nothing", () => {
    const words = Array.from({ length: 6000 }, (_, i) => `w${i}`).join(" ")
    let from = 1
    let offset = 0
    const parts: string[] = []
    for (let calls = 0; calls < 20; calls++) {
      const w = readWindow([words], from, offset)
      expect(w.text.length).toBeLessThanOrEqual(9_002)
      parts.push(w.text.replace(/ …$/, ""))
      if (!w.next) break
      ;({ fromPage: from, offset } = w.next)
    }
    // Each window is trimmed, so the space at a cut is dropped — join with one.
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join(" ").replace(/\s+/g, " ").trim()).toBe(words)
  })
})
