import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  settingsUpsert: vi.fn(),
  loadConfig: vi.fn(),
  createClient: vi.fn(),
  enqueue: vi.fn(),
  reindex: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: { attachment: { findMany: h.findMany, update: h.update }, paperlessSettings: { upsert: h.settingsUpsert } },
}))
vi.mock("./config", () => ({ loadPaperlessConfig: h.loadConfig, PAPERLESS_SETTINGS_ID: "singleton" }))
vi.mock("./client", async (orig) => ({
  ...(await orig<typeof import("./client")>()),
  createPaperlessClient: h.createClient,
}))
vi.mock("@/lib/documents/indexer-server", () => ({ enqueueDocument: h.enqueue, reindexMovedDocuments: h.reindex }))

import { PaperlessError, type PaperlessClient, type PaperlessDoc } from "./client"
import { hashText } from "./diff"
import { runPaperlessCheck } from "./sync-server"
import { maxUploadBytes } from "@/lib/upload-limits"

const FAKE = "fake-token-123"
const NOW = new Date("2026-11-04T10:00:00Z")
let dir: string

type Row = Record<string, unknown> & { id: string; filename: string; paperlessId: number }
let rows: Row[]
let remote: Map<number, PaperlessDoc>
let getDocuments: ReturnType<typeof vi.fn>
let getDocument: ReturnType<typeof vi.fn>
let downloadOriginal: ReturnType<typeof vi.fn>
let client: PaperlessClient

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "paperless-sync-"))
  process.env.UPLOAD_DIR = dir
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function filesIn(recordId: string): string[] {
  const d = path.join(dir, "service", recordId)
  return existsSync(d) ? readdirSync(d).sort() : []
}

function makeRow(id: string, paperlessId: number, over: Partial<Row> = {}): Row {
  const filename = `old-${id}.pdf`
  mkdirSync(path.join(dir, "service", `rec-${id}`), { recursive: true })
  writeFileSync(path.join(dir, "service", `rec-${id}`, filename), "old bytes")
  return {
    id, filename, originalName: "My renamed.pdf", recordType: "SERVICE", serviceRecordId: `rec-${id}`,
    warrantyId: null, maintenanceScheduleId: null, healthConditionId: null, insurancePolicyId: null,
    observationId: null, medicationId: null, allergyId: null, immunizationId: null, assetId: null,
    inboxItemId: null, roomId: null,
    paperlessId, paperlessVersionId: paperlessId, paperlessChecksum: `c-${paperlessId}`,
    paperlessTextHash: hashText(`text ${paperlessId}`), paperlessLinkStatus: "OK",
    ...over,
  }
}

function makeDoc(id: number, over: Partial<PaperlessDoc> = {}): PaperlessDoc {
  return {
    id, rootId: id, title: `Doc ${id}`, originalFileName: `doc${id}.pdf`, mimeType: "application/pdf",
    content: `text ${id}`, pageCount: 1, modified: "2026-01-01T00:00:00Z", deletedAt: null,
    versions: [{ id, checksum: `c-${id}`, isRoot: true, added: "2026-01-01T00:00:00Z" }],
    ...over,
  }
}

function withNewVersion(d: PaperlessDoc, content = "new text"): PaperlessDoc {
  return {
    ...d, content, originalFileName: "scan.png",
    versions: [...d.versions, { id: d.id + 100, checksum: "c-new", isRoot: false, added: "2026-06-01T00:00:00Z" }],
  }
}

const config = (over: Record<string, unknown> = {}) => ({
  enabled: true, baseUrl: "https://paperless.example", token: FAKE, hasStoredToken: true, tokenUnreadable: false,
  access: "ADMIN", schedule: "DAILY", time: "03:30", weekday: 0,
  lastCheckedAt: null, lastCheckSummary: "previous summary", lastCheckError: null, ...over,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updates = () => h.update.mock.calls.map((c) => c[0] as { where: { id: string }; data: Record<string, any> })
const updateFor = (id: string) => updates().find((u) => u.where.id === id)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const settingsWrite = () => h.settingsUpsert.mock.calls.at(-1)?.[0].update as Record<string, any>
const run = (deps: Partial<{ client: PaperlessClient; now: Date }> = {}) =>
  runPaperlessCheck("MANUAL", { client, now: NOW, ...deps })

beforeEach(() => {
  vi.clearAllMocks()
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  rows = []
  remote = new Map()
  h.findMany.mockImplementation(async () => rows)
  h.update.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id }))
  h.settingsUpsert.mockResolvedValue({})
  h.loadConfig.mockResolvedValue(config())
  h.reindex.mockResolvedValue(undefined)
  getDocuments = vi.fn(async (ids: number[]) => ids.flatMap((id) => (remote.has(id) ? [remote.get(id)!] : [])))
  getDocument = vi.fn(async (id: number) => {
    const d = remote.get(id)
    if (!d) throw new PaperlessError("not_found")
    return d
  })
  downloadOriginal = vi.fn(async () => ({ bytes: Buffer.from("NEW PNG BYTES"), fileName: "scan.png" }))
  client = { getDocuments, getDocument, downloadOriginal } as unknown as PaperlessClient
  h.createClient.mockReturnValue(client)
})

describe("runPaperlessCheck", () => {
  it("queries only PAPERLESS rows with a paperlessId, including MISSING ones", async () => {
    await run()
    const where = h.findMany.mock.calls[0][0].where
    expect(where).toEqual({ source: "PAPERLESS", paperlessId: { not: null } })
  })

  it("new version: new file written, old removed, row updated, originalName kept, text replaced, reindexed", async () => {
    rows = [makeRow("a", 1)]
    remote.set(1, withNewVersion(makeDoc(1)))
    const res = await run()
    expect(res).toMatchObject({ examined: 1, updated: 1, textRefreshed: 0, broken: 0, restored: 0, skipped: 0 })
    expect(downloadOriginal).toHaveBeenCalledWith(1, maxUploadBytes(), 101)
    const u = updateFor("a")!
    expect(u.data.filename).toMatch(/^[0-9a-f-]{36}\.png$/)
    expect(u.data.mimeType).toBe("image/png")
    expect(u.data.sizeBytes).toBe(Buffer.byteLength("NEW PNG BYTES"))
    expect(u.data.paperlessVersionId).toBe(101)
    expect(u.data.paperlessChecksum).toBe("c-new")
    expect(u.data.paperlessTextHash).toBe(hashText("new text"))
    expect(u.data.paperlessLinkStatus).toBe("OK")
    expect(u.data.paperlessSyncedAt).toEqual(NOW)
    expect(u.data.paperlessUpdatedAt).toEqual(NOW)
    expect("originalName" in u.data).toBe(false)
    const t = u.data.text.upsert
    expect(t.update).toMatchObject({ status: "DONE", method: "TEXT", text: "new text", truncated: false, pageCount: 1, charCount: 8, extractorVersion: 1, attempts: 0, error: null })
    expect(t.update.extractedAt).toBeInstanceOf(Date)
    expect(t.create).toMatchObject({ status: "DONE", text: "new text" })
    expect(filesIn("rec-a")).toEqual([u.data.filename])
    expect(readFileSync(path.join(dir, "service", "rec-a", u.data.filename), "utf8")).toBe("NEW PNG BYTES")
    expect(h.reindex).toHaveBeenCalledWith(["a"])
    expect(h.enqueue).not.toHaveBeenCalled()
  })

  it("new version with empty content: text row PENDING and enqueueDocument", async () => {
    rows = [makeRow("a", 1)]
    remote.set(1, withNewVersion(makeDoc(1), "  \n"))
    await run()
    const t = updateFor("a")!.data.text.upsert
    expect(t.update).toMatchObject({ status: "PENDING", text: null, attempts: 0, extractorVersion: 0, error: null })
    expect(h.enqueue).toHaveBeenCalledWith("a")
    expect(h.reindex).not.toHaveBeenCalled()
  })

  it("DB update failure on replace: new file deleted, old file and row kept", async () => {
    rows = [makeRow("a", 1)]
    remote.set(1, withNewVersion(makeDoc(1)))
    h.update.mockRejectedValue(new Error("db down"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await run()
    expect(filesIn("rec-a")).toEqual(["old-a.pdf"])
    expect(res.updated).toBe(0)
    expect(res.skipped).toBe(1)
  })

  it("disallowed new extension: row untouched, old file kept, no download", async () => {
    rows = [makeRow("a", 1)]
    remote.set(1, { ...withNewVersion(makeDoc(1)), originalFileName: "evil.exe" })
    const res = await run()
    expect(downloadOriginal).not.toHaveBeenCalled()
    expect(updateFor("a")).toBeUndefined()
    expect(filesIn("rec-a")).toEqual(["old-a.pdf"])
    expect(res).toMatchObject({ examined: 1, updated: 0, skipped: 1 })
  })

  it("too_large download: row untouched, old file kept", async () => {
    rows = [makeRow("a", 1)]
    remote.set(1, withNewVersion(makeDoc(1)))
    downloadOriginal.mockRejectedValue(new PaperlessError("too_large"))
    const res = await run()
    expect(updateFor("a")).toBeUndefined()
    expect(filesIn("rec-a")).toEqual(["old-a.pdf"])
    expect(res).toMatchObject({ examined: 1, updated: 0, skipped: 1 })
    // The only row was skipped, so the run reports that nothing could be checked.
    expect(settingsWrite().lastCheckError).toBe("No document could be checked.")
  })

  it("text-only change: text refreshed, file and paperlessUpdatedAt untouched", async () => {
    rows = [makeRow("a", 1)]
    remote.set(1, makeDoc(1, { content: "fresh OCR" }))
    const res = await run()
    expect(res).toMatchObject({ examined: 1, updated: 0, textRefreshed: 1 })
    expect(downloadOriginal).not.toHaveBeenCalled()
    const u = updateFor("a")!
    expect(Object.keys(u.data).sort()).toEqual(["paperlessSyncedAt", "paperlessTextHash", "text"])
    expect(u.data.paperlessTextHash).toBe(hashText("fresh OCR"))
    expect(u.data.text.upsert.update).toMatchObject({ status: "DONE", text: "fresh OCR" })
    expect(filesIn("rec-a")).toEqual(["old-a.pdf"])
    expect(h.reindex).toHaveBeenCalledWith(["a"])
  })

  it("404 confirmed with a direct request: MISSING, file and text kept", async () => {
    rows = [makeRow("a", 1)]
    const res = await run()
    expect(getDocument).toHaveBeenCalledWith(1)
    expect(res).toMatchObject({ examined: 1, broken: 1 })
    const u = updateFor("a")!
    expect(u.data).toEqual({ paperlessLinkStatus: "MISSING", paperlessSyncedAt: NOW })
    expect(filesIn("rec-a")).toEqual(["old-a.pdf"])
  })

  it("trashed (deletedAt) confirmed: MISSING", async () => {
    rows = [makeRow("a", 1)]
    const trashed = makeDoc(1, { deletedAt: "2026-10-01T00:00:00Z" })
    remote.set(1, trashed)
    getDocuments.mockResolvedValue([trashed])
    const res = await run()
    expect(res.broken).toBe(1)
    expect(updateFor("a")!.data.paperlessLinkStatus).toBe("MISSING")
  })

  it("missing from batch but direct request finds it live: acted on, not MISSING", async () => {
    rows = [makeRow("a", 1)]
    remote.set(1, makeDoc(1))
    getDocuments.mockResolvedValue([])
    const res = await run()
    expect(res).toMatchObject({ broken: 0 })
    expect(updateFor("a")!.data).toEqual({ paperlessSyncedAt: NOW })
  })

  it("document back: MISSING -> OK", async () => {
    rows = [makeRow("a", 1, { paperlessLinkStatus: "MISSING" })]
    remote.set(1, makeDoc(1))
    const res = await run()
    expect(res).toMatchObject({ restored: 1 })
    expect(updateFor("a")!.data).toEqual({ paperlessLinkStatus: "OK", paperlessSyncedAt: NOW })
  })

  it("unchanged: only paperlessSyncedAt; success summary written", async () => {
    rows = [makeRow("a", 1)]
    remote.set(1, makeDoc(1))
    expect(await run()).toEqual({ examined: 1, updated: 0, textRefreshed: 0, broken: 0, restored: 0, skipped: 0 })
    expect(updateFor("a")!.data).toEqual({ paperlessSyncedAt: NOW })
    const s = settingsWrite()
    expect(s.lastCheckedAt).toEqual(NOW)
    expect(s.lastCheckError).toBeNull()
    expect(s.lastCheckSummary).toBe("Checked 1 document: 0 files updated, 0 text refreshed, 0 broken.")
  })

  it("batches unique root ids", async () => {
    rows = [makeRow("a", 1), makeRow("b", 1), makeRow("c", 2)]
    remote.set(1, makeDoc(1))
    remote.set(2, makeDoc(2))
    await run()
    expect(getDocuments).toHaveBeenCalledTimes(1)
    expect(getDocuments.mock.calls[0][0]).toEqual([1, 2])
  })

  it.each(["unreachable", "unauthorized", "bad_response"] as const)("batch throws %s: no row changed, lastCheckError set", async (kind) => {
    rows = [makeRow("a", 1), makeRow("b", 2)]
    getDocuments.mockRejectedValue(Object.assign(new PaperlessError(kind), { message: `boom ${FAKE}` }))
    const res = await run()
    expect(h.update).not.toHaveBeenCalled()
    expect(getDocument).not.toHaveBeenCalled()
    expect(res).toMatchObject({ updated: 0, broken: 0 })
    const s = settingsWrite()
    expect(s.lastCheckedAt).toEqual(NOW)
    expect(typeof s.lastCheckError).toBe("string")
    expect(s.lastCheckError).not.toContain(FAKE)
    expect("lastCheckSummary" in s).toBe(false)
  })

  it("direct getDocument throws unreachable mid-run: no MISSING, no further rows changed", async () => {
    rows = [makeRow("a", 1), makeRow("b", 2), makeRow("c", 3)]
    remote.set(1, makeDoc(1))
    remote.set(3, makeDoc(3, { content: "changed" }))
    getDocument.mockRejectedValue(new PaperlessError("unreachable"))
    await run()
    expect(updates().map((u) => u.where.id)).toEqual(["a"])
    expect(updates().some((u) => u.data.paperlessLinkStatus === "MISSING")).toBe(false)
    expect(settingsWrite().lastCheckError).toBe("Paperless-ngx could not be reached.")
  })

  it("download throws unauthorized mid-run: old file kept, no further rows changed", async () => {
    rows = [makeRow("a", 1), makeRow("b", 2)]
    remote.set(1, withNewVersion(makeDoc(1)))
    remote.set(2, makeDoc(2, { content: "changed" }))
    downloadOriginal.mockRejectedValue(new PaperlessError("unauthorized"))
    await run()
    expect(h.update).not.toHaveBeenCalled()
    expect(filesIn("rec-a")).toEqual(["old-a.pdf"])
    expect(settingsWrite().lastCheckError).toBe("Paperless-ngx rejected the API token.")
  })

  it("concurrent second call returns zeros without running", async () => {
    rows = [makeRow("a", 1)]
    remote.set(1, makeDoc(1))
    let release!: () => void
    getDocuments.mockImplementation(() => new Promise((r) => { release = () => r([remote.get(1)]) }))
    const first = run()
    await vi.waitFor(() => expect(getDocuments).toHaveBeenCalled())
    const second = await run()
    expect(second).toEqual({ examined: 0, updated: 0, textRefreshed: 0, broken: 0, restored: 0, skipped: 0 })
    expect(h.settingsUpsert).not.toHaveBeenCalled()
    release()
    await first
    expect(getDocuments).toHaveBeenCalledTimes(1)
    expect(h.settingsUpsert).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["disabled", { enabled: false }],
    ["no baseUrl", { baseUrl: null }],
    ["no token", { token: null }],
  ])("%s without an injected client: zeros, calls nothing", async (_n, over) => {
    h.loadConfig.mockResolvedValue(config(over))
    const res = await runPaperlessCheck("SCHEDULE", { now: NOW })
    expect(res).toEqual({ examined: 0, updated: 0, textRefreshed: 0, broken: 0, restored: 0, skipped: 0 })
    expect(h.createClient).not.toHaveBeenCalled()
    expect(h.findMany).not.toHaveBeenCalled()
    expect(h.settingsUpsert).not.toHaveBeenCalled()
  })

  it("configured: builds the client from config with a 60s timeout", async () => {
    await runPaperlessCheck("SCHEDULE", { now: NOW })
    expect(h.createClient).toHaveBeenCalledWith({ baseUrl: "https://paperless.example", token: FAKE, timeoutMs: 60_000 })
  })

  it("reindex throwing does not fail the run; log has no token", async () => {
    rows = [makeRow("a", 1)]
    remote.set(1, makeDoc(1, { content: "fresh" }))
    h.reindex.mockRejectedValue(new Error(`bad ${FAKE}`))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await run()
    expect(res.textRefreshed).toBe(1)
    expect(JSON.stringify(spy.mock.calls)).not.toContain(FAKE)
    spy.mockRestore()
  })

  it("an unexpected failure records a fixed error and rethrows", async () => {
    h.findMany.mockRejectedValue(new Error(`db ${FAKE}`))
    await expect(run()).rejects.toThrow()
    expect(settingsWrite()).toEqual({ lastCheckedAt: NOW, lastCheckError: "The Paperless check failed." })
  })

  it.each([
    ["generic Error", () => new Error(`odd ${FAKE}`)],
    ["too_large", () => new PaperlessError("too_large")],
  ])("CONFIRM_MISSING direct request throws %s: run aborts, nothing MISSING, lastCheckError set", async (_n, make) => {
    rows = [makeRow("a", 1), makeRow("b", 2), makeRow("c", 3)]
    remote.set(1, makeDoc(1))
    remote.set(3, makeDoc(3, { content: "changed" }))
    getDocument.mockRejectedValue(make())
    await run()
    expect(updates().map((u) => u.where.id)).toEqual(["a"])
    expect(updates().some((u) => u.data.paperlessLinkStatus === "MISSING")).toBe(false)
    const s = settingsWrite()
    expect(s).toEqual({ lastCheckedAt: NOW, lastCheckError: "The Paperless check failed." })
  })

  it("bad_response on the direct getDocument aborts with its phrase", async () => {
    rows = [makeRow("a", 1), makeRow("b", 2)]
    remote.set(2, makeDoc(2, { content: "changed" }))
    getDocuments.mockResolvedValue([remote.get(2)])
    getDocument.mockRejectedValue(new PaperlessError("bad_response"))
    await run()
    expect(h.update).not.toHaveBeenCalled()
    expect(settingsWrite()).toEqual({ lastCheckedAt: NOW, lastCheckError: "Paperless-ngx sent an unexpected response." })
  })

  it("bad_response on the download aborts with its phrase", async () => {
    rows = [makeRow("a", 1), makeRow("b", 2)]
    remote.set(1, withNewVersion(makeDoc(1)))
    remote.set(2, makeDoc(2, { content: "changed" }))
    downloadOriginal.mockRejectedValue(new PaperlessError("bad_response"))
    await run()
    expect(h.update).not.toHaveBeenCalled()
    expect(filesIn("rec-a")).toEqual(["old-a.pdf"])
    expect(settingsWrite().lastCheckError).toBe("Paperless-ngx sent an unexpected response.")
  })

  it("a per-row prisma failure is skipped, never MISSING, and the summary says so", async () => {
    rows = [makeRow("a", 1), makeRow("b", 2)]
    remote.set(1, makeDoc(1))
    h.update.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "a") throw new Error(`db ${FAKE}`)
      return { id: where.id }
    })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await run()
    expect(res).toMatchObject({ examined: 2, skipped: 1, broken: 1 })
    expect(updateFor("a")!.data.paperlessLinkStatus).toBeUndefined()
    const s = settingsWrite()
    expect(s.lastCheckError).toBeNull()
    expect(s.lastCheckSummary).toBe("Checked 2 documents: 0 files updated, 0 text refreshed, 1 broken, 1 skipped.")
    expect(JSON.stringify(spy.mock.calls)).not.toContain(FAKE)
    spy.mockRestore()
  })

  it("all rows skipped: lastCheckError 'No document could be checked.' with summary", async () => {
    rows = [makeRow("a", 1), makeRow("b", 2)]
    remote.set(1, makeDoc(1))
    remote.set(2, makeDoc(2))
    h.update.mockRejectedValue(new Error("db down"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    await run()
    expect(settingsWrite()).toEqual({
      lastCheckedAt: NOW,
      lastCheckError: "No document could be checked.",
      lastCheckSummary: "Checked 2 documents: 0 files updated, 0 text refreshed, 0 broken, 2 skipped.",
    })
  })

  it("no rows: success with no error", async () => {
    await run()
    expect(settingsWrite()).toEqual({ lastCheckedAt: NOW, lastCheckError: null, lastCheckSummary: "Checked 0 documents: 0 files updated, 0 text refreshed, 0 broken." })
  })

  it("already MISSING and still gone: syncedAt only, not counted as broken", async () => {
    rows = [makeRow("a", 1, { paperlessLinkStatus: "MISSING" })]
    const res = await run()
    expect(getDocument).toHaveBeenCalledWith(1)
    expect(res).toMatchObject({ examined: 1, broken: 0, skipped: 0 })
    expect(updateFor("a")!.data).toEqual({ paperlessSyncedAt: NOW })
    expect(settingsWrite().lastCheckSummary).toBe("Checked 1 document: 0 files updated, 0 text refreshed, 0 broken.")
  })

  it("newly missing row: summary says 1 broken", async () => {
    rows = [makeRow("a", 1)]
    await run()
    expect(settingsWrite().lastCheckSummary).toBe("Checked 1 document: 0 files updated, 0 text refreshed, 1 broken.")
  })

  it("restored row: summary says 1 restored, before skipped", async () => {
    rows = [makeRow("a", 1, { paperlessLinkStatus: "MISSING" }), makeRow("b", 2)]
    remote.set(1, makeDoc(1))
    remote.set(2, withNewVersion(makeDoc(2)))
    downloadOriginal.mockRejectedValue(new PaperlessError("too_large"))
    await run()
    expect(settingsWrite().lastCheckSummary).toBe("Checked 2 documents: 0 files updated, 0 text refreshed, 0 broken, 1 restored, 1 skipped.")
  })
})
