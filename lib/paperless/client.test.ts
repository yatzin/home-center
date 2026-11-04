import { describe, expect, it, vi } from "vitest"
import {
  MIN_API_VERSION,
  PaperlessError,
  createPaperlessClient,
  normalizeBaseUrl,
} from "./client"

const TOKEN = "tok_SECRET_value_123"

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "x-api-version": "10" },
    ...init,
  })
}

function stub(...responses: (Response | Error)[]) {
  const queue = [...responses]
  const fn = vi.fn(async (...args: unknown[]) => {
    void args
    const next = queue.shift()
    if (!next) throw new Error("unexpected extra fetch call")
    if (next instanceof Error) throw next
    return next
  })
  return fn
}

function client(fn: ReturnType<typeof stub>, baseUrl = "http://h:8777") {
  return createPaperlessClient({
    baseUrl,
    token: TOKEN,
    fetchImpl: fn as unknown as typeof fetch,
    timeoutMs: 200,
  })
}

async function catchError(p: Promise<unknown>): Promise<PaperlessError> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(PaperlessError)
    return e as PaperlessError
  }
  throw new Error("expected rejection")
}

const rawDoc = {
  id: 7,
  root_document: null,
  title: "Boiler manual",
  original_file_name: "boiler.pdf",
  mime_type: "application/pdf",
  content: "some text",
  page_count: 3,
  modified: "2026-11-04T09:03:02.735711-05:00",
  deleted_at: null,
  versions: [
    { id: 9, added: "2026-11-04T14:03:02Z", version_label: "v2", checksum: "bbb", is_root: false },
    { id: 7, added: "2026-11-04T14:02:41Z", version_label: null, checksum: "aaa", is_root: true },
  ],
}

describe("normalizeBaseUrl", () => {
  it("strips trailing slash and allows LAN http", () => {
    expect(normalizeBaseUrl("http://h:8777/")).toBe("http://h:8777")
    expect(normalizeBaseUrl("http://192.168.68.119:8777")).toBe("http://192.168.68.119:8777")
  })
  it("keeps path prefix", () => {
    expect(normalizeBaseUrl("https://h/paperless//")).toBe("https://h/paperless")
  })
  it("drops query and hash", () => {
    expect(normalizeBaseUrl("https://h/p/?a=1#x")).toBe("https://h/p")
  })
  it("throws on other schemes, junk, and credentials", () => {
    expect(() => normalizeBaseUrl("ftp://x")).toThrow()
    expect(() => normalizeBaseUrl("not a url")).toThrow()
    expect(() => normalizeBaseUrl("http://u:pw@h")).toThrow()
  })
})

describe("requests", () => {
  it("goes to the prefixed path with auth headers and manual redirect", async () => {
    const fn = stub(json({ pngx_version: "3.4.2" }))
    const out = await client(fn, "https://h/paperless//").status()
    expect(out).toEqual({ version: "3.4.2" })
    const [url, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://h/paperless/api/status/")
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Token ${TOKEN}`)
    expect(headers.Accept).toBe("application/json; version=9")
    expect(init.redirect).toBe("manual")
  })

  it("exports MIN_API_VERSION 9", () => {
    expect(MIN_API_VERSION).toBe(9)
  })

  it("rejects servers older than MIN_API_VERSION", async () => {
    const fn = stub(json({ pngx_version: "2.0.0" }, { headers: { "x-api-version": "8" } }))
    expect((await catchError(client(fn).status())).kind).toBe("bad_response")
  })

  it("maps 401 and 403 to unauthorized", async () => {
    expect((await catchError(client(stub(json({}, { status: 401 }))).status())).kind).toBe(
      "unauthorized",
    )
    expect((await catchError(client(stub(json({}, { status: 403 }))).status())).kind).toBe(
      "unauthorized",
    )
  })

  it("maps 404 to not_found", async () => {
    const e = await catchError(client(stub(json({}, { status: 404 }))).getDocument(5))
    expect(e.kind).toBe("not_found")
  })

  it("maps 500 to bad_response", async () => {
    const e = await catchError(client(stub(json({}, { status: 500 }))).status())
    expect(e.kind).toBe("bad_response")
  })

  it("maps network failure to unreachable", async () => {
    const e = await catchError(client(stub(new TypeError("fetch failed"))).status())
    expect(e.kind).toBe("unreachable")
  })

  it("maps timeout to unreachable", async () => {
    const hang = vi.fn((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))
      }),
    )
    const c = createPaperlessClient({
      baseUrl: "http://h",
      token: TOKEN,
      fetchImpl: hang as unknown as typeof fetch,
      timeoutMs: 20,
    })
    expect((await catchError(c.status())).kind).toBe("unreachable")
  })

  it("maps non-JSON body to bad_response", async () => {
    const fn = stub(new Response("<html>nope</html>", { status: 200 }))
    expect((await catchError(client(fn).status())).kind).toBe("bad_response")
  })

  it("treats a cross-origin 302 as unauthorized and never follows it", async () => {
    const fn = stub(
      new Response(null, { status: 302, headers: { location: "http://evil.example/login" } }),
      json({}),
    )
    const e = await catchError(client(fn).status())
    expect(e.kind).toBe("unauthorized")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("treats a same-origin 302 login redirect as unauthorized", async () => {
    const fn = stub(new Response(null, { status: 302, headers: { location: "/accounts/login/" } }))
    expect((await catchError(client(fn).getDocument(1))).kind).toBe("unauthorized")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("never leaks the token in errors", async () => {
    const cases: Response[] = [
      json({}, { status: 401 }),
      json({}, { status: 404 }),
      json({}, { status: 500 }),
      new Response("junk", { status: 200 }),
      new Response(null, { status: 302, headers: { location: `http://x/?t=${TOKEN}` } }),
    ]
    for (const r of cases) {
      const e = await catchError(client(stub(r)).status())
      expect(JSON.stringify(e)).not.toContain(TOKEN)
      expect(e.message).not.toContain(TOKEN)
      expect(String(e.stack)).not.toContain(TOKEN)
    }
    const net = await catchError(client(stub(new TypeError(`boom ${TOKEN}`))).status())
    expect(JSON.stringify(net)).not.toContain(TOKEN)
    expect(net.message).not.toContain(TOKEN)
  })
})

describe("search", () => {
  it("builds query and maps results", async () => {
    const fn = stub(
      json({
        count: 1,
        results: [{ id: 1, title: "T", mime_type: "application/pdf", created: "2026-11-04", extra: 1 }],
      }),
    )
    const out = await client(fn).search({ query: "boiler", tag: 3, documentType: 4, page: 2 })
    expect(out).toEqual({
      count: 1,
      results: [{ id: 1, title: "T", mimeType: "application/pdf", created: "2026-11-04" }],
    })
    const url = new URL((fn.mock.calls[0] as [string])[0])
    expect(url.pathname).toBe("/api/documents/")
    expect(url.searchParams.get("query")).toBe("boiler")
    expect(url.searchParams.get("tags__id__all")).toBe("3")
    expect(url.searchParams.get("document_type__id")).toBe("4")
    expect(url.searchParams.get("page")).toBe("2")
    expect(url.searchParams.get("fields")).toBe("id,title,mime_type,created")
  })
})

describe("documents", () => {
  it("maps a document, rootId falls back to id", async () => {
    const doc = await client(stub(json(rawDoc))).getDocument(7)
    expect(doc).toEqual({
      id: 7,
      rootId: 7,
      title: "Boiler manual",
      originalFileName: "boiler.pdf",
      mimeType: "application/pdf",
      content: "some text",
      pageCount: 3,
      modified: "2026-11-04T09:03:02.735711-05:00",
      deletedAt: null,
      versions: [
        { id: 9, checksum: "bbb", isRoot: false, added: "2026-11-04T14:03:02Z" },
        { id: 7, checksum: "aaa", isRoot: true, added: "2026-11-04T14:02:41Z" },
      ],
    })
  })

  it("uses root_document when present", async () => {
    const doc = await client(stub(json({ ...rawDoc, id: 9, root_document: 7 }))).getDocument(9)
    expect(doc.rootId).toBe(7)
  })

  it("rejects a malformed document", async () => {
    const e = await catchError(client(stub(json({ title: "no id" }))).getDocument(1))
    expect(e.kind).toBe("bad_response")
  })

  it("batches id__in in chunks", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => i + 1)
    const page = (from: number, to: number) =>
      json({
        count: to - from + 1,
        results: ids.slice(from - 1, to).map((id) => ({ ...rawDoc, id })),
      })
    const fn = stub(page(1, 50), page(51, 100), page(101, 120))
    const docs = await client(fn).getDocuments(ids)
    expect(docs).toHaveLength(120)
    expect(fn).toHaveBeenCalledTimes(3)
    const url = new URL((fn.mock.calls[0] as [string])[0])
    expect(url.searchParams.get("id__in")).toBe(ids.slice(0, 50).join(","))
    expect(url.searchParams.get("page_size")).toBe("50")
  })

  it("getDocuments with no ids makes no call", async () => {
    const fn = stub()
    expect(await client(fn).getDocuments([])).toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })
})

describe("downloadOriginal", () => {
  function file(body: string, headers: Record<string, string> = {}) {
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="2026-11-04 Doc.pdf"; filename*=utf-8''2026-11-04%20Doc.pdf`,
        ...headers,
      },
    })
  }

  it("downloads original and parses filename", async () => {
    const fn = stub(file("hello"))
    const out = await client(fn).downloadOriginal(7, 1000)
    expect(out.bytes.toString()).toBe("hello")
    expect(out.fileName).toBe("2026-11-04 Doc.pdf")
    const url = new URL((fn.mock.calls[0] as [string])[0])
    expect(url.pathname).toBe("/api/documents/7/download/")
    expect(url.searchParams.get("original")).toBe("true")
    expect(url.searchParams.has("version")).toBe(false)
  })

  it("selects a version", async () => {
    const fn = stub(file("v"))
    await client(fn).downloadOriginal(7, 1000, 9)
    const url = new URL((fn.mock.calls[0] as [string])[0])
    expect(url.searchParams.get("version")).toBe("9")
  })

  it("falls back to a generated filename", async () => {
    const fn = stub(new Response("x", { status: 200 }))
    expect((await client(fn).downloadOriginal(7, 10)).fileName).toBe("document-7")
  })

  it("too_large on content-length without reading", async () => {
    const fn = stub(file("x", { "content-length": "5000" }))
    expect((await catchError(client(fn).downloadOriginal(7, 100))).kind).toBe("too_large")
  })

  it("too_large while streaming, stops reading past the cap", async () => {
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(new Uint8Array(40))
        if (pulled > 50) controller.close()
      },
    })
    const fn = stub(new Response(stream, { status: 200 }))
    const e = await catchError(client(fn).downloadOriginal(7, 100))
    expect(e.kind).toBe("too_large")
    expect(pulled).toBeLessThan(10)
  })

  it("maps 404 to not_found and 302 to unauthorized", async () => {
    expect(
      (await catchError(client(stub(new Response("", { status: 404 }))).downloadOriginal(1, 10))).kind,
    ).toBe("not_found")
    expect(
      (await catchError(client(stub(new Response(null, { status: 302 }))).downloadOriginal(1, 10)))
        .kind,
    ).toBe("unauthorized")
  })
})

describe("thumb", () => {
  it("returns bytes and content type", async () => {
    const fn = stub(new Response("img", { status: 200, headers: { "content-type": "image/webp" } }))
    const out = await client(fn).thumb(7)
    expect(out.contentType).toBe("image/webp")
    expect(out.bytes.toString()).toBe("img")
    expect(new URL((fn.mock.calls[0] as [string])[0]).pathname).toBe("/api/documents/7/thumb/")
  })
})

describe.each([
  ["tags", "/api/tags/"],
  ["documentTypes", "/api/document_types/"],
] as const)("%s", (method, path) => {
  it("returns only id and name, with page_size and ordering", async () => {
    const fn = stub(
      json({ count: 2, results: [{ id: 1, name: "A", color: "#fff", owner: 3 }, { id: 2, name: "B", slug: "b" }] }),
    )
    const out = await client(fn)[method]()
    expect(out).toEqual([{ id: 1, name: "A" }, { id: 2, name: "B" }])
    const url = new URL((fn.mock.calls[0] as [string])[0])
    expect(url.pathname).toBe(path)
    expect(url.searchParams.get("page_size")).toBe("100")
    expect(url.searchParams.get("ordering")).toBe("name")
    expect(url.searchParams.has("name__icontains")).toBe(false)
  })
  it("adds name__icontains when a name is given", async () => {
    const fn = stub(json({ count: 0, results: [] }))
    await client(fn)[method]({ name: "tax & co" })
    const url = new URL((fn.mock.calls[0] as [string])[0])
    expect(url.searchParams.get("name__icontains")).toBe("tax & co")
  })
  it("caps at 100 entries", async () => {
    const results = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, name: `n${i}` }))
    const out = await client(stub(json({ count: 150, results })))[method]()
    expect(out).toHaveLength(100)
  })
  it.each([
    [401, "unauthorized"],
    [404, "not_found"],
  ])("maps %i to %s without leaking the token", async (status, kind) => {
    const err = await catchError(client(stub(new Response("nope", { status })))[method]())
    expect(err.kind).toBe(kind)
    expect(err.message).not.toContain(TOKEN)
  })
  it.each([
    ["junk text", new Response("not json", { status: 200 })],
    ["no results", json({ count: 0 })],
    ["bad entry", json({ results: [{ id: "x", name: "A" }] })],
    ["missing name", json({ results: [{ id: 1 }] })],
  ])("bad_response for %s", async (_l, res) => {
    const err = await catchError(client(stub(res))[method]())
    expect(err.kind).toBe("bad_response")
    expect(err.message).not.toContain(TOKEN)
  })
})
