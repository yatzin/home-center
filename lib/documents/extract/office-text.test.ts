import { describe, expect, it } from "vitest"
import { nodeText, officePages, type OfficeNode } from "./office-text"

const text = (t: string): OfficeNode => ({ type: "text", text: t })
const para = (t: string): OfficeNode => ({ type: "paragraph", text: t, children: [text(t)] })
const cell = (t: string): OfficeNode => ({ type: "cell", text: t, children: [text(t)] })

describe("officePages", () => {
  it("joins paragraphs of a flat document into one page", () => {
    expect(officePages([para("One."), para("Two.")])).toEqual(["One.\nTwo."])
  })
  it("makes one page per slide", () => {
    const slides = [1, 2].map((n): OfficeNode => ({ type: "slide", metadata: { slideNumber: n }, children: [para(`Slide ${n}`)] }))
    expect(officePages(slides)).toEqual(["Slide 1", "Slide 2"])
  })
  it("makes one page per sheet, titled, with tab-separated cells", () => {
    const sheet: OfficeNode = {
      type: "sheet",
      metadata: { sheetName: "Parts" },
      children: [{ type: "row", children: [cell("Air filter"), cell("16x25x1")] }],
    }
    expect(officePages([sheet])).toEqual(["Parts\nAir filter\t16x25x1"])
  })
  it("folds nodes outside pages into the neighbouring page", () => {
    const slide: OfficeNode = { type: "slide", children: [para("Body")] }
    expect(officePages([para("Lead"), slide, { type: "note", children: [para("Speaker note")] }])).toEqual(["Lead\nBody\nSpeaker note"])
  })
  it("joins inline runs without separators", () => {
    expect(nodeText({ type: "paragraph", children: [text("Fil"), text("ter")] })).toBe("Filter")
  })
})
