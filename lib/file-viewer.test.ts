import { describe, expect, it } from "vitest"
import { fileKind, inInstalledTouchApp, parseViewerSrc, viewerHref } from "./file-viewer"

const env = (o: { standalone?: boolean; coarse?: boolean; iosStandalone?: boolean }) => ({
  matchMedia: (q: string) => ({ matches: q.includes("display-mode") ? !!o.standalone : q.includes("pointer: coarse") ? !!o.coarse : false }),
  navigator: { standalone: o.iosStandalone },
})

describe("inInstalledTouchApp", () => {
  it("is true for an installed app on a touch device (Android and iOS)", () => {
    expect(inInstalledTouchApp(env({ standalone: true, coarse: true }))).toBe(true)
    expect(inInstalledTouchApp(env({ iosStandalone: true, coarse: true }))).toBe(true)
  })

  it("is false on a PC browser, a phone's browser and an app installed on a PC", () => {
    expect(inInstalledTouchApp(env({}))).toBe(false)
    expect(inInstalledTouchApp(env({ coarse: true }))).toBe(false)
    expect(inInstalledTouchApp(env({ standalone: true }))).toBe(false)
    expect(inInstalledTouchApp(env({ iosStandalone: false, coarse: false }))).toBe(false)
  })
})

describe("parseViewerSrc", () => {
  it("accepts upload paths and reads a PDF page", () => {
    expect(parseViewerSrc("/api/files/service/abc/1f2e.pdf")).toEqual({ path: "/api/files/service/abc/1f2e.pdf", page: null })
    expect(parseViewerSrc("/api/files/maintenance/m1/man.pdf#page=42")).toEqual({ path: "/api/files/maintenance/m1/man.pdf", page: 42 })
  })

  it("refuses anything that is not one of our uploads", () => {
    for (const bad of [
      "", null, undefined, "https://evil.example/x.pdf", "//evil.example/x.pdf", "/api/files/", "/api/other/x.pdf",
      "/api/files/../../etc/passwd", "/api/files/a/%2e%2e/b.pdf", `/api/files/a${String.fromCharCode(92)}b.pdf`, "/api/files/a/b.pdf?size=thumb", "javascript:alert(1)",
    ]) expect(parseViewerSrc(bad), String(bad)).toBeNull()
  })
})

describe("viewerHref and fileKind", () => {
  it("round-trips the file address and name", () => {
    const href = viewerHref("/api/files/x/y/z.pdf#page=3", "Owner's manual & more.pdf")
    const url = new URL(href, "http://x")
    expect(url.pathname).toBe("/view")
    expect(parseViewerSrc(url.searchParams.get("src"))).toEqual({ path: "/api/files/x/y/z.pdf", page: 3 })
    expect(url.searchParams.get("name")).toBe("Owner's manual & more.pdf")
  })

  it("sorts files by extension, case-insensitively", () => {
    expect(fileKind("/api/files/a/b/c.PDF")).toBe("pdf")
    expect(fileKind("/api/files/a/b/c.jpeg")).toBe("image")
    expect(fileKind("/api/files/a/b/c.docx")).toBe("other")
    expect(fileKind("/api/files/a/b/noext")).toBe("other")
  })
})
