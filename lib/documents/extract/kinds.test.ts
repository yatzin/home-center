import { describe, expect, it } from "vitest"
import { UPLOAD_TYPES } from "@/lib/upload-types"
import { EXTRACT_KIND, kindFor, NOT_EXTRACTED } from "./kinds"

describe("extract kinds", () => {
  it("decides every allowed upload type exactly once", () => {
    for (const ext of Object.keys(UPLOAD_TYPES)) {
      const decided = Number(ext in EXTRACT_KIND) + Number(NOT_EXTRACTED.includes(ext))
      expect(decided, ext).toBe(1)
    }
  })
  it("maps extensions case-insensitively and rejects unknowns", () => {
    expect(kindFor(".PDF")).toBe("pdf")
    expect(kindFor(".dotx")).toBe("office")
    expect(kindFor(".heic")).toBeNull()
    expect(kindFor(null)).toBeNull()
  })
})
