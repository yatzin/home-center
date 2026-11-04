import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  resolve: vi.fn(),
  enqueue: vi.fn(),
  reindex: vi.fn(),
  indexingEnabled: true,
  processInbox: vi.fn(),
  writeFile: vi.fn(),
}))
vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>()
  h.writeFile.mockImplementation(actual.writeFile)
  return { ...actual, writeFile: h.writeFile }
})
vi.mock("@/lib/prisma", () => ({ prisma: { attachment: { findFirst: h.findFirst, create: h.create } } }))
vi.mock("@/lib/attachments/create-server", async (orig) => ({
  ...(await orig<typeof import("@/lib/attachments/create-server")>()),
  resolveAttachmentRecord: h.resolve,
}))
vi.mock("@/lib/documents/indexer-server", () => ({ enqueueDocument: h.enqueue, reindexMovedDocuments: h.reindex }))
vi.mock("@/lib/documents/settings", () => ({ loadDocumentSettings: async () => ({ indexingEnabled: h.indexingEnabled }) }))
vi.mock("@/lib/capture-server", () => ({ processInboxItem: h.processInbox }))

import { PaperlessError, type PaperlessClient, type PaperlessDoc } from "./client"
import { hashText } from "./diff"
import { importPaperlessDocument, PaperlessImportError } from "./import-server"
import type { AttachmentRecordType } from "@/app/generated/prisma/client"
import { maxUploadBytes } from "@/lib/upload-limits"

const FAKE = "fake-token-123"
let dir: string
let doc: PaperlessDoc
let client: PaperlessClient
let getDocument: ReturnType<typeof vi.fn>
let downloadOriginal: ReturnType<typeof vi.fn>

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "paperless-import-"))
  process.env.UPLOAD_DIR = dir
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function filesOnDisk(): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    if (!existsSync(d)) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name))
      else out.push(path.join(d, e.name))
    }
  }
  walk(dir)
  return out
}

beforeEach(() => {
  vi.clearAllMocks()
  h.writeFile.mockImplementation(async (...a: Parameters<typeof import("node:fs/promises").writeFile>) =>
    (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).writeFile(...a))
  rmSync(dir, { recursive: true, force: true })
  h.indexingEnabled = true
  doc = {
    id: 10, rootId: 10, title: "Invoice", originalFileName: "invoice.pdf", mimeType: "application/pdf",
    content: "page one\fpage two", pageCount: 2, modified: "2026-01-01T00:00:00Z", deletedAt: null,
    versions: [{ id: 10, checksum: "c-root", isRoot: true, added: "2026-01-01T00:00:00Z" }],
  }
  getDocument = vi.fn(async () => doc)
  downloadOriginal = vi.fn(async () => ({ bytes: Buffer.from("%PDF-1.4 hi"), fileName: "2026-01-01 Formatted.pdf" }))
  client = { getDocument, downloadOriginal } as unknown as PaperlessClient
  h.resolve.mockResolvedValue({ found: true, assetType: null })
  h.findFirst.mockResolvedValue(null)
  h.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "att1", ...data }))
})

const args = { documentId: 10, recordType: "SERVICE" as AttachmentRecordType, recordId: "rec1", userId: "u1" }
const run = (over: Partial<typeof args> = {}) => importPaperlessDocument({ client, ...args, ...over })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createData = () => h.create.mock.calls[0][0].data as Record<string, any>

describe("importPaperlessDocument", () => {
  it("imports a PDF: file on disk, PAPERLESS row, DONE text, reindex", async () => {
    expect(await run()).toEqual({ attachmentId: "att1" })
    const d = createData()
    expect(d.source).toBe("PAPERLESS")
    expect(d.paperlessId).toBe(10)
    expect(d.paperlessVersionId).toBe(10)
    expect(d.paperlessChecksum).toBe("c-root")
    expect(d.paperlessTextHash).toBe(hashText(doc.content))
    expect(d.paperlessLinkStatus).toBe("OK")
    expect(d.paperlessSyncedAt).toBeInstanceOf(Date)
    expect(d.paperlessUpdatedAt).toBeUndefined()
    expect(d.originalName).toBe("invoice.pdf")
    expect(d.mimeType).toBe("application/pdf")
    expect(d.filename).toMatch(/^[0-9a-f-]{36}\.pdf$/)
    expect(d.serviceRecordId).toBe("rec1")
    expect(d.uploadedById).toBe("u1")
    expect(d.sizeBytes).toBe(Buffer.byteLength("%PDF-1.4 hi"))
    expect(d.text.create).toMatchObject({ status: "DONE", method: "TEXT", text: doc.content, truncated: false, pageCount: 2, charCount: doc.content.length, extractorVersion: 1 })
    expect(d.text.create.extractedAt).toBeInstanceOf(Date)
    expect(filesOnDisk()).toEqual([path.join(dir, "service", "rec1", d.filename)])
    expect(h.reindex).toHaveBeenCalledWith(["att1"])
    expect(h.enqueue).not.toHaveBeenCalled()
  })

  it("empty content: PENDING text row and enqueueDocument", async () => {
    doc.content = "  \n "
    await run()
    expect(createData().text).toEqual({ create: {} })
    expect(h.enqueue).toHaveBeenCalledWith("att1")
    expect(h.reindex).not.toHaveBeenCalled()
  })

  it("caps text at MAX_TEXT_CHARS and flags truncated", async () => {
    doc.content = "x".repeat(2_000_005)
    await run()
    const t = createData().text.create
    expect(t.text.length).toBe(2_000_000)
    expect(t.truncated).toBe(true)
    expect(t.charCount).toBe(2_000_000)
  })

  it("a version id resolves to the root id and downloads the newest version", async () => {
    const root: PaperlessDoc = {
      ...doc, id: 10, rootId: 10,
      versions: [
        { id: 10, checksum: "c-root", isRoot: true, added: "2026-01-01T00:00:00Z" },
        { id: 11, checksum: "c-new", isRoot: false, added: "2026-02-01T00:00:00Z" },
      ],
    }
    getDocument.mockImplementation(async (id: number) => (id === 11 ? { ...root, id: 11, rootId: 10 } : root))
    await run({ documentId: 11 })
    expect(getDocument).toHaveBeenCalledWith(11)
    expect(getDocument).toHaveBeenCalledWith(10)
    expect(downloadOriginal).toHaveBeenCalledWith(10, maxUploadBytes(), 11)
    const d = createData()
    expect(d.paperlessId).toBe(10)
    expect(d.paperlessVersionId).toBe(11)
    expect(d.paperlessChecksum).toBe("c-new")
  })

  it("INBOX record: row on the inbox item, settles inbox when indexing is off", async () => {
    h.indexingEnabled = false
    await run({ recordType: "INBOX", recordId: "inb1" })
    expect(createData().inboxItemId).toBe("inb1")
    expect(filesOnDisk()[0]).toContain(path.join("inbox", "inb1"))
    expect(h.processInbox).toHaveBeenCalledWith("inb1")
  })

  it("INBOX + text + indexing on: processInboxItem once (reindex never fires the hook)", async () => {
    await run({ recordType: "INBOX", recordId: "inb1" })
    expect(h.processInbox).toHaveBeenCalledTimes(1)
    expect(h.processInbox).toHaveBeenCalledWith("inb1")
  })

  it("INBOX + text + indexing off: processInboxItem exactly once", async () => {
    h.indexingEnabled = false
    await run({ recordType: "INBOX", recordId: "inb1" })
    expect(h.processInbox).toHaveBeenCalledTimes(1)
  })

  it("INBOX + empty content + indexing on: left to the indexer hook", async () => {
    doc.content = ""
    await run({ recordType: "INBOX", recordId: "inb1" })
    expect(h.enqueue).toHaveBeenCalledWith("att1")
    expect(h.processInbox).not.toHaveBeenCalled()
  })

  it("INBOX + empty content + indexing off: settled by the import", async () => {
    doc.content = ""
    h.indexingEnabled = false
    await run({ recordType: "INBOX", recordId: "inb1" })
    expect(h.processInbox).toHaveBeenCalledTimes(1)
  })

  it("non-INBOX record never calls processInboxItem", async () => {
    await run()
    h.indexingEnabled = false
    await run()
    expect(h.processInbox).not.toHaveBeenCalled()
  })

  it("processInboxItem rejecting still returns the attachment id", async () => {
    h.processInbox.mockRejectedValue(new Error("boom"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await run({ recordType: "INBOX", recordId: "inb1" })).toEqual({ attachmentId: "att1" })
  })

  it.each(["malware.exe", "README"])("rejects %s before download: no file, no row", async (name) => {
    doc.originalFileName = name
    await expect(run()).rejects.toMatchObject({ code: "TYPE_NOT_ALLOWED" })
    expect(downloadOriginal).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
    expect(filesOnDisk()).toEqual([])
  })

  it("too_large from the client -> TOO_LARGE, nothing written", async () => {
    downloadOriginal.mockRejectedValue(new PaperlessError("too_large"))
    await expect(run()).rejects.toMatchObject({ code: "TOO_LARGE" })
    expect(h.create).not.toHaveBeenCalled()
    expect(filesOnDisk()).toEqual([])
  })

  it("same document twice on one record -> ALREADY_IMPORTED, no download", async () => {
    h.findFirst.mockResolvedValue({ id: "old" })
    await expect(run()).rejects.toMatchObject({ code: "ALREADY_IMPORTED" })
    expect(h.findFirst.mock.calls[0][0].where).toMatchObject({ paperlessId: 10, recordType: "SERVICE", serviceRecordId: "rec1" })
    expect(getDocument).not.toHaveBeenCalled()
    expect(downloadOriginal).not.toHaveBeenCalled()
  })

  it("version id of an already imported root -> ALREADY_IMPORTED after root lookup", async () => {
    getDocument.mockResolvedValue({ ...doc, id: 11, rootId: 10 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h.findFirst.mockImplementation(async ({ where }: any) => (where.paperlessId === 10 ? { id: "old" } : null))
    await expect(run({ documentId: 11 })).rejects.toMatchObject({ code: "ALREADY_IMPORTED" })
    expect(downloadOriginal).not.toHaveBeenCalled()
  })

  it("unknown record -> RECORD_NOT_FOUND before any Paperless call", async () => {
    h.resolve.mockResolvedValue({ found: false })
    await expect(run()).rejects.toMatchObject({ code: "RECORD_NOT_FOUND" })
    expect(getDocument).not.toHaveBeenCalled()
    expect(downloadOriginal).not.toHaveBeenCalled()
    expect(h.findFirst).not.toHaveBeenCalled()
  })

  it("DB insert failure after the download leaves no file behind", async () => {
    h.create.mockRejectedValue(new Error("db down"))
    await expect(run()).rejects.toThrow("db down")
    expect(filesOnDisk()).toEqual([])
  })

  it("indexing throwing after create still resolves; row and file remain", async () => {
    h.reindex.mockRejectedValue(new Error(`secret path ${FAKE}`))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await run()).toEqual({ attachmentId: "att1" })
    expect(filesOnDisk()).toHaveLength(1)
    expect(h.create).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(spy.mock.calls)).not.toContain(FAKE)
    spy.mockRestore()
  })

  it("enqueue / processInbox throwing after create still resolves", async () => {
    doc.content = ""
    h.enqueue.mockImplementation(() => { throw new Error("x") })
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await run()).toEqual({ attachmentId: "att1" })
  })

  it("writeFile failing mid-write leaves no file and no new directory", async () => {
    const { writeFile: real } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
    h.writeFile.mockImplementation(async (p: string) => {
      await real(p, "partial")
      throw new Error("ENOSPC")
    })
    await expect(run()).rejects.toThrow("ENOSPC")
    expect(filesOnDisk()).toEqual([])
    expect(existsSync(path.join(dir, "service", "rec1"))).toBe(false)
    expect(h.create).not.toHaveBeenCalled()
  })

  it("a trashed document is treated as not found; nothing downloaded", async () => {
    doc.deletedAt = "2026-03-01T00:00:00Z"
    const err = await run().catch((e) => e)
    expect(err).toMatchObject({ code: "UPSTREAM", message: "That document was not found in Paperless-ngx." })
    expect(downloadOriginal).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })

  it.each(["unreachable", "unauthorized", "bad_response", "not_found"] as const)("upstream %s -> UPSTREAM, JSON lacks the token", async (kind) => {
    getDocument.mockRejectedValue(Object.assign(new PaperlessError(kind), { message: `boom ${FAKE}` }))
    const err = await run().catch((e) => e)
    expect(err).toBeInstanceOf(PaperlessImportError)
    expect(err.code).toBe("UPSTREAM")
    expect(JSON.stringify(err)).not.toContain(FAKE)
    expect(err.message).not.toContain(FAKE)
    expect(h.create).not.toHaveBeenCalled()
  })

  it("every error code serialises without a token", () => {
    for (const code of ["TYPE_NOT_ALLOWED", "TOO_LARGE", "ALREADY_IMPORTED", "RECORD_NOT_FOUND", "UPSTREAM"] as const) {
      expect(JSON.stringify(new PaperlessImportError(code))).not.toContain(FAKE)
    }
  })
})
