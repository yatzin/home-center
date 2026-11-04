import { describe, expect, it } from "vitest"
import { paperlessBadgeInfo, paperlessIdFromLink, paperlessLinkHref } from "./badge"

const base = { source: "PAPERLESS", paperlessId: 7, paperlessUpdatedAt: null, paperlessLinkStatus: null as "OK" | "MISSING" | null }

describe("paperlessBadgeInfo", () => {
  it("hides for LOCAL attachments", () => {
    expect(paperlessBadgeInfo({ ...base, source: "LOCAL" }).show).toBe(false)
  })
  it("shows for PAPERLESS with no update and no break", () => {
    expect(paperlessBadgeInfo(base)).toEqual({ show: true, updatedOn: null, broken: false })
  })
  it("returns the update date from a Date or a string", () => {
    const d = new Date("2026-05-01T10:00:00Z")
    expect(paperlessBadgeInfo({ ...base, paperlessUpdatedAt: d }).updatedOn).toEqual(d)
    expect(paperlessBadgeInfo({ ...base, paperlessUpdatedAt: d.toISOString() }).updatedOn).toEqual(d)
  })
  it("ignores an invalid date string", () => {
    expect(paperlessBadgeInfo({ ...base, paperlessUpdatedAt: "nope" }).updatedOn).toBeNull()
  })
  it("flags MISSING as broken", () => {
    expect(paperlessBadgeInfo({ ...base, paperlessLinkStatus: "MISSING" }).broken).toBe(true)
    expect(paperlessBadgeInfo({ ...base, paperlessLinkStatus: "OK" }).broken).toBe(false)
  })
})

describe("paperlessLinkHref", () => {
  it("builds the details URL", () => {
    expect(paperlessLinkHref("https://p.example", 42)).toBe("https://p.example/documents/42/details")
  })
  it("is null when either part is missing", () => {
    expect(paperlessLinkHref(null, 42)).toBeNull()
    expect(paperlessLinkHref("https://p.example", null)).toBeNull()
  })
})

describe("paperlessIdFromLink", () => {
  it("accepts a bare positive integer", () => {
    expect(paperlessIdFromLink(" 42 ")).toBe(42)
  })
  it("extracts from a URL", () => {
    expect(paperlessIdFromLink("http://h/documents/42/details")).toBe(42)
    expect(paperlessIdFromLink("https://h/sub/documents/7")).toBe(7)
  })
  it("rejects everything else", () => {
    expect(paperlessIdFromLink("")).toBeNull()
    expect(paperlessIdFromLink("abc")).toBeNull()
    expect(paperlessIdFromLink("0")).toBeNull()
    expect(paperlessIdFromLink("-3")).toBeNull()
    expect(paperlessIdFromLink("1.5")).toBeNull()
    expect(paperlessIdFromLink("http://h/documents/abc")).toBeNull()
    expect(paperlessIdFromLink("http://h/documents/0")).toBeNull()
    expect(paperlessIdFromLink("99999999999999999999")).toBeNull()
    expect(paperlessIdFromLink("http://h/documents/99999999999999999999/details")).toBeNull()
  })
})
