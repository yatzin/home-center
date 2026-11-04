import { describe, expect, it } from "vitest"
import { cleanAttachmentName } from "./attachment-name"

describe("cleanAttachmentName", () => {
  it("trims and keeps a typed name that already has the extension", () => {
    expect(cleanAttachmentName("  2024 Invoice.pdf ", "scan.pdf")).toEqual({ name: "2024 Invoice.pdf" })
  })
  it("restores the original extension when left off", () => {
    expect(cleanAttachmentName("Invoice", "scan.pdf")).toEqual({ name: "Invoice.pdf" })
  })
  it("matches the extension case-insensitively", () => {
    expect(cleanAttachmentName("Invoice.PDF", "scan.pdf")).toEqual({ name: "Invoice.PDF" })
  })
  it("leaves a name alone when the original has no extension", () => {
    expect(cleanAttachmentName("Notes", "README")).toEqual({ name: "Notes" })
  })
  it("rejects blank, slashes, control characters and over-long names", () => {
    expect(cleanAttachmentName("   ", "a.pdf")).toHaveProperty("error")
    expect(cleanAttachmentName("a/b", "a.pdf")).toHaveProperty("error")
    expect(cleanAttachmentName("a\\b", "a.pdf")).toHaveProperty("error")
    expect(cleanAttachmentName("a\tb", "a.pdf")).toHaveProperty("error")
    expect(cleanAttachmentName("x".repeat(200), "a.pdf")).toHaveProperty("error")
  })
})
