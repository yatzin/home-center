import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ route: vi.fn(), thumb: vi.fn(), search: vi.fn(), importDoc: vi.fn() }))
vi.mock("@/lib/paperless/config", () => ({ paperlessRoute: h.route }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/paperless/import-server", async (orig) => ({
  ...(await orig<typeof import("@/lib/paperless/import-server")>()),
  importPaperlessDocument: h.importDoc,
}))

import { NextRequest, NextResponse } from "next/server"
import { PaperlessError } from "./client"
import { PaperlessImportError } from "./import-server"
import { GET as thumbGET } from "@/app/api/paperless/thumb/[id]/route"
import { GET as searchGET } from "@/app/api/paperless/search/route"
import { POST as importPOST } from "@/app/api/paperless/import/route"
import { GET as tagsGET } from "@/app/api/paperless/tags/route"
import { GET as docTypesGET } from "@/app/api/paperless/document-types/route"

const FAKE = "fake-token-123"
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://localhost${url}`, init)

beforeEach(() => {
  vi.clearAllMocks()
  h.route.mockResolvedValue({ denied: null, client: { thumb: h.thumb, search: h.search }, session: { user: { id: "u1" } } })
})

describe("thumb route", () => {
  it("returns the denied response", async () => {
    h.route.mockResolvedValue({ denied: NextResponse.json({ error: "Not found" }, { status: 404 }), client: null })
    expect((await thumbGET(req("/x"), ctx("5"))).status).toBe(404)
    expect(h.thumb).not.toHaveBeenCalled()
  })
  it.each(["abc", "0", "-1", "1.5", "1e3"])("rejects id %s", async (id) => {
    expect((await thumbGET(req("/x"), ctx(id))).status).toBe(400)
    expect(h.thumb).not.toHaveBeenCalled()
  })
  it("serves an allow-listed image with fixed headers", async () => {
    h.thumb.mockResolvedValue({ bytes: Buffer.from("img"), contentType: "image/webp; charset=x" })
    const res = await thumbGET(req("/x"), ctx("5"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/webp")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600")
  })
  it("502 for a non-image upstream type", async () => {
    h.thumb.mockResolvedValue({ bytes: Buffer.from("<script>"), contentType: "text/html" })
    expect((await thumbGET(req("/x"), ctx("5"))).status).toBe(502)
  })
  it("502 for unauthorized, no token in body", async () => {
    h.thumb.mockRejectedValue(Object.assign(new PaperlessError("unauthorized"), { message: FAKE }))
    const res = await thumbGET(req("/x"), ctx("5"))
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).toContain("token")
    expect(text).not.toContain(FAKE)
  })
})

describe("search route", () => {
  it("passes validated params and returns count/results", async () => {
    h.search.mockResolvedValue({ count: 1, results: [{ id: 1 }], extra: "no" })
    const res = await searchGET(req("/s?query=tax&tag=3&documentType=4&page=2"))
    expect(h.search).toHaveBeenCalledWith({ query: "tax", tag: 3, documentType: 4, page: 2 })
    expect(await res.json()).toEqual({ count: 1, results: [{ id: 1 }] })
  })
  it.each(["tag=0", "tag=x", "page=-1", "documentType=1.5"])("400 for %s", async (q) => {
    expect((await searchGET(req(`/s?${q}`))).status).toBe(400)
    expect(h.search).not.toHaveBeenCalled()
  })
})

describe("import route", () => {
  const post = (body: unknown) => importPOST(req("/i", { method: "POST", body: JSON.stringify(body) }))
  const ok = { documentId: 7, recordType: "SERVICE", recordId: "r1" }
  it("400 for a bad body", async () => {
    for (const b of [{ ...ok, documentId: 0 }, { ...ok, recordType: "NOPE" }, { ...ok, recordId: "" }, null]) {
      expect((await post(b)).status).toBe(400)
    }
    expect(h.importDoc).not.toHaveBeenCalled()
  })
  it("returns attachmentId", async () => {
    h.importDoc.mockResolvedValue({ attachmentId: "a1" })
    const res = await post(ok)
    expect(await res.json()).toEqual({ attachmentId: "a1" })
    expect(h.importDoc.mock.calls[0][0]).toMatchObject({ ...ok, userId: "u1" })
  })
  it.each([["ALREADY_IMPORTED", 409], ["RECORD_NOT_FOUND", 404], ["TYPE_NOT_ALLOWED", 400], ["TOO_LARGE", 400], ["UPSTREAM", 502]] as const)("maps %s to %i", async (code, status) => {
    h.importDoc.mockRejectedValue(new PaperlessImportError(code))
    expect((await post(ok)).status).toBe(status)
  })
  it("unauthorized upstream: 502 mentioning the token check", async () => {
    h.importDoc.mockRejectedValue(new PaperlessError("unauthorized"))
    const res = await post(ok)
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain("token")
  })
})

describe.each([
  ["tags", "/api/paperless/tags", tagsGET, "tags"],
  ["document-types", "/api/paperless/document-types", docTypesGET, "documentTypes"],
] as const)("%s route", (_n, url, handler, method) => {
  const fn = vi.fn()
  beforeEach(() => {
    fn.mockReset()
    h.route.mockResolvedValue({ denied: null, client: { [method]: fn }, session: { user: { id: "u1" } } })
  })
  it.each([401, 404])("passes through denied %i", async (status) => {
    h.route.mockResolvedValue({ denied: NextResponse.json({ error: "x" }, { status }), client: null })
    expect((await handler(req(url))).status).toBe(status)
    expect(fn).not.toHaveBeenCalled()
  })
  it("returns results with no-store", async () => {
    fn.mockResolvedValue([{ id: 1, name: "A" }])
    const res = await handler(req(url))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [{ id: 1, name: "A" }] })
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(fn).toHaveBeenCalledWith({ name: undefined })
  })
  it("trims name", async () => {
    fn.mockResolvedValue([])
    await handler(req(`${url}?name=%20%20tax%20`))
    expect(fn).toHaveBeenCalledWith({ name: "tax" })
  })
  it("caps name at 100 chars", async () => {
    fn.mockResolvedValue([])
    await handler(req(`${url}?name=${"a".repeat(150)}`))
    expect(fn).toHaveBeenCalledWith({ name: "a".repeat(100) })
  })
  it("blank name becomes undefined", async () => {
    fn.mockResolvedValue([])
    await handler(req(`${url}?name=%20%20`))
    expect(fn).toHaveBeenCalledWith({ name: undefined })
  })
  it("maps upstream error, no token in body", async () => {
    fn.mockRejectedValue(Object.assign(new PaperlessError("unauthorized"), { message: FAKE }))
    const res = await handler(req(url))
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).toContain("token")
    expect(text).not.toContain(FAKE)
  })
})
