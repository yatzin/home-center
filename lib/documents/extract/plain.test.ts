import { describe, expect, it } from "vitest"
import { decodeText, rtfToText } from "./plain"

describe("decodeText", () => {
  it("reads UTF-8 and drops a BOM", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from("café")]))).toBe("café")
  })
  it("falls back to latin1 for bytes that aren't UTF-8", () => {
    expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe("café")
  })
})

describe("rtfToText", () => {
  it("keeps body text and paragraph breaks, drops the font table", () => {
    const rtf = "{\\rtf1\\ansi{\\fonttbl\\f0\\fswiss Helvetica;}\\f0\\pard Oil change every 5000 miles.\\par Second line.\\par}"
    expect(rtfToText(rtf)).toBe("Oil change every 5000 miles.\nSecond line.\n")
  })
  it("skips \\* destinations and decodes escapes", () => {
    const rtf = "{\\rtf1{\\*\\generator Word;}Caf\\'e9 \\{x\\} tab\\tab end\\u8364?}"
    expect(rtfToText(rtf)).toBe("Café {x} tab\tend€")
  })
})
