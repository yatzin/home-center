import { describe, expect, it, vi } from "vitest"
import { MAX_OCR_EDGE_PX } from "../limits"
import { extractPdf, ocrScale } from "./pdf"
import { textPdf } from "./test-fixtures"

// OCR (or rendering the page for it) can fail on its own — e.g. no canvas
// binary for the platform. A blank cover page must not cost the text pages.
vi.mock("./ocr", () => ({
  ocrImage: vi.fn(async () => {
    throw new Error("canvas binary missing")
  }),
}))

describe("ocrScale", () => {
  it("renders a letter page at 2x and shrinks a big one to the edge limit", () => {
    expect(ocrScale(612, 792)).toBe(2)
    // A 36x48 inch plan sheet: 2x would be a 5184x6912 bitmap.
    expect(Math.round(3456 * ocrScale(2592, 3456))).toBe(MAX_OCR_EDGE_PX)
  })
})

describe("extractPdf", () => {
  it("keeps the text pages when OCR of a blank page fails", async () => {
    const r = await extractPdf(new Uint8Array(textPdf(["Deductible is 500 dollars", ""])), { ocr: true })
    expect(r).toEqual({ kind: "text", method: "TEXT", pages: ["Deductible is 500 dollars", ""] })
  })

  it("fails a fully scanned PDF when OCR can't run, so Retry failed can pick it up", async () => {
    await expect(extractPdf(new Uint8Array(textPdf(["", ""])), { ocr: true })).rejects.toThrow("Couldn't OCR this scanned PDF")
  })
})
