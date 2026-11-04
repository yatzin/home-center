import { describe, expect, it } from "vitest"
import type { PaperlessDoc } from "./client"
import { hashText, planSync, type SyncRow } from "./diff"

function doc(over: Partial<PaperlessDoc> = {}): PaperlessDoc {
  return {
    id: 1,
    rootId: 1,
    title: "T",
    originalFileName: "a.pdf",
    mimeType: "application/pdf",
    content: "hello",
    pageCount: 1,
    modified: "2026-01-01T00:00:00Z",
    deletedAt: null,
    versions: [{ id: 10, checksum: "c1", isRoot: true, added: "2026-01-01T00:00:00Z" }],
    ...over,
  }
}

function row(over: Partial<SyncRow> = {}): SyncRow {
  return {
    paperlessId: 1,
    paperlessVersionId: 10,
    paperlessChecksum: "c1",
    paperlessTextHash: hashText("hello"),
    paperlessLinkStatus: "OK",
    ...over,
  }
}

describe("hashText", () => {
  it("is stable sha256 hex", () => {
    expect(hashText("a")).toBe(hashText("a"))
    expect(hashText("a")).not.toBe(hashText("b"))
    expect(hashText("")).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("planSync", () => {
  it("CONFIRM_MISSING when remote undefined", () => {
    expect(planSync(row(), undefined)).toEqual({ kind: "CONFIRM_MISSING" })
  })

  it("CONFIRM_MISSING when deleted", () => {
    expect(planSync(row(), doc({ deletedAt: "2026-02-01T00:00:00Z" }))).toEqual({
      kind: "CONFIRM_MISSING",
    })
  })

  it("UNCHANGED when same", () => {
    expect(planSync(row(), doc())).toEqual({ kind: "UNCHANGED" })
  })

  it("metadata-only change is UNCHANGED", () => {
    expect(planSync(row(), doc({ modified: "2027-01-01T00:00:00Z", title: "New" }))).toEqual({
      kind: "UNCHANGED",
    })
  })

  it("REPLACE_FILE on new newest version", () => {
    const remote = doc({
      versions: [
        { id: 10, checksum: "c1", isRoot: true, added: "2026-01-01T00:00:00Z" },
        { id: 11, checksum: "c2", isRoot: false, added: "2026-03-01T00:00:00Z" },
      ],
      content: "new text",
    })
    expect(planSync(row(), remote)).toEqual({
      kind: "REPLACE_FILE",
      versionId: 11,
      checksum: "c2",
      textHash: hashText("new text"),
    })
  })

  it("REPLACE_FILE on checksum change, same version id", () => {
    const remote = doc({
      versions: [{ id: 10, checksum: "zzz", isRoot: true, added: "2026-01-01T00:00:00Z" }],
    })
    expect(planSync(row(), remote)).toEqual({
      kind: "REPLACE_FILE",
      versionId: 10,
      checksum: "zzz",
      textHash: hashText("hello"),
    })
  })

  it("newest picked by added date not array order; ties by higher id", () => {
    const remote = doc({
      versions: [
        { id: 12, checksum: "c3", isRoot: false, added: "2026-03-01T00:00:00Z" },
        { id: 10, checksum: "c1", isRoot: true, added: "2026-01-01T00:00:00Z" },
        { id: 13, checksum: "c4", isRoot: false, added: "2026-03-01T00:00:00Z" },
      ],
    })
    expect(planSync(row(), remote)).toMatchObject({ kind: "REPLACE_FILE", versionId: 13 })
  })

  it("stored null version/checksum counts as differing", () => {
    expect(planSync(row({ paperlessVersionId: null }), doc())).toMatchObject({
      kind: "REPLACE_FILE",
    })
    expect(planSync(row({ paperlessChecksum: null }), doc())).toMatchObject({
      kind: "REPLACE_FILE",
    })
  })

  it("empty versions never REPLACE_FILE", () => {
    expect(planSync(row(), doc({ versions: [] }))).toEqual({ kind: "UNCHANGED" })
    expect(planSync(row(), doc({ versions: [], content: "other" }))).toEqual({
      kind: "REFRESH_TEXT",
      textHash: hashText("other"),
    })
  })

  it("REFRESH_TEXT when only text differs", () => {
    expect(planSync(row(), doc({ content: "edited" }))).toEqual({
      kind: "REFRESH_TEXT",
      textHash: hashText("edited"),
    })
  })

  it("stored null text hash counts as differing", () => {
    expect(planSync(row({ paperlessTextHash: null }), doc())).toEqual({
      kind: "REFRESH_TEXT",
      textHash: hashText("hello"),
    })
  })

  it("RESTORE_LINK when MISSING row reappears unchanged", () => {
    expect(planSync(row({ paperlessLinkStatus: "MISSING" }), doc())).toEqual({
      kind: "RESTORE_LINK",
    })
  })

  it("MISSING row reappearing with new version is REPLACE_FILE", () => {
    const remote = doc({
      versions: [{ id: 11, checksum: "c2", isRoot: false, added: "2026-03-01T00:00:00Z" }],
    })
    expect(planSync(row({ paperlessLinkStatus: "MISSING" }), remote)).toMatchObject({
      kind: "REPLACE_FILE",
    })
  })

  it("MISSING row with text-only change is REFRESH_TEXT", () => {
    expect(planSync(row({ paperlessLinkStatus: "MISSING" }), doc({ content: "x" }))).toMatchObject({
      kind: "REFRESH_TEXT",
    })
  })
})
