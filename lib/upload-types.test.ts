import { describe, expect, it } from "vitest"
import { extensionForFilename, mimeForFilename } from "./upload-types"

describe("upload types", () => {
  it("maps allowed extensions case-insensitively", () => {
    expect(mimeForFilename("receipt.PDF")).toBe("application/pdf")
    expect(mimeForFilename("card.jpeg")).toBe("image/jpeg")
    expect(extensionForFilename("Scan.HEIC")).toBe(".heic")
  })

  it("rejects anything not on the list", () => {
    expect(mimeForFilename("page.html")).toBeNull()
    expect(mimeForFilename("receipt.pdf.exe")).toBeNull()
    expect(extensionForFilename("noextension")).toBeNull()
    expect(extensionForFilename(".")).toBeNull()
  })
})
