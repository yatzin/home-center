import { describe, expect, it, vi } from "vitest"
import { createIndexer, type IndexerStore, type Job, type SaveResult } from "./indexer"
import type { SearchIndex } from "./index-db"
import type { Chunk } from "./chunk"
import { ExtractError, type Extracted } from "./types"

type Row = { job: Job; result?: SaveResult; text?: string }

function setup(opts: { enabled?: boolean; ocr?: boolean; outcomes?: Record<string, Extracted | Error> } = {}) {
  const settings = { indexingEnabled: opts.enabled ?? true, ocrEnabled: opts.ocr ?? true }
  const rows = new Map<string, Row>()
  const add = (id: string, over: Partial<Job> = {}) =>
    rows.set(id, { job: { attachmentId: id, filePath: `/u/${id}.pdf`, ext: ".pdf", originalName: `${id}.pdf`, recordType: "SERVICE", attempts: 0, ...over } })
  const chunks = new Map<string, Chunk[]>()
  const replaceFails = { value: false }

  const store: IndexerStore = {
    settings: async () => ({ ...settings }),
    loadJob: async (id) => rows.get(id)?.job ?? null,
    save: async (id, result) => {
      const row = rows.get(id)
      if (!row) return // deleted meanwhile: a no-op, like updateMany
      row.result = result
      row.text = result.status === "DONE" ? result.text : undefined
      if (result.status === "FAILED") row.job.attempts++
    },
    ensureRows: async () => {},
    attachmentIds: async () => new Set(rows.keys()),
    doneIds: async () => [...rows].filter(([, r]) => r.result?.status === "DONE").map(([id]) => id),
    dueIds: async () => [...rows].filter(([, r]) => !r.result).map(([id]) => id),
    loadText: async (id) => {
      const r = rows.get(id)
      return r?.text ? { text: r.text, originalName: r.job.originalName, recordType: r.job.recordType } : null
    },
  }
  const index: SearchIndex = {
    replace: async (id, _meta, c) => {
      if (replaceFails.value) throw new Error("disk full")
      chunks.set(id, c)
    },
    remove: async (ids) => ids.forEach((id) => chunks.delete(id)),
    search: async () => [],
    indexedIds: async () => new Set(chunks.keys()),
    clear: async () => chunks.clear(),
    close: () => {},
  }
  const extract = vi.fn<(filePath: string, ext: string | null, opts: { ocr: boolean }) => Promise<Extracted>>(async (filePath) => {
    const id = filePath.replace(/^\/u\/|\.pdf$/g, "")
    const outcome = opts.outcomes?.[id] ?? { kind: "text", method: "TEXT", pages: [`text of ${id}`] }
    if (outcome instanceof Error) throw outcome
    return outcome
  })
  const idleHook = vi.fn(async () => {})
  const log = { info: vi.fn(), error: vi.fn() }
  const indexer = createIndexer({ store, index: async () => index, extract, idle: idleHook, log })
  return { settings, rows, add, chunks, replaceFails, extract, idleHook, log, indexer }
}

describe("indexer", () => {
  it("extracts, saves normalised text and indexes chunks", async () => {
    const t = setup({ outcomes: { a: { kind: "text", method: "TEXT", pages: ["Filter  size\t16x25x1", "page two"] } } })
    t.add("a")
    t.indexer.enqueue("a")
    await t.indexer.idle()
    expect(t.rows.get("a")!.result).toEqual({ status: "DONE", method: "TEXT", text: "Filter size 16x25x1\fpage two", pageCount: 2, truncated: false })
    expect(t.chunks.get("a")!.map((c) => [c.page, c.text])).toEqual([[1, "Filter size 16x25x1"], [2, "page two"]])
    expect(t.idleHook).toHaveBeenCalled()
  })

  it("marks unsupported and empty files and keeps them out of the index", async () => {
    const t = setup({ outcomes: { u: { kind: "unsupported" }, e: { kind: "text", method: "TEXT", pages: ["  ", ""] } } })
    t.add("u")
    t.add("e")
    t.chunks.set("u", [{ page: 1, ordinal: 0, text: "stale" }])
    t.indexer.enqueue("u")
    t.indexer.enqueue("e")
    await t.indexer.idle()
    expect(t.rows.get("u")!.result).toEqual({ status: "UNSUPPORTED" })
    expect(t.rows.get("e")!.result).toEqual({ status: "EMPTY" })
    expect(t.chunks.size).toBe(0)
  })

  it("stores fixed phrases for failures and carries on with the next file", async () => {
    const t = setup({ outcomes: { p: new ExtractError("Password-protected PDF"), x: new Error("secret document text in a stack") } })
    t.add("p")
    t.add("x")
    t.add("ok")
    for (const id of ["p", "x", "ok"]) t.indexer.enqueue(id)
    await t.indexer.idle()
    expect(t.rows.get("p")!.result).toEqual({ status: "FAILED", error: "Password-protected PDF" })
    expect(t.rows.get("x")!.result).toEqual({ status: "FAILED", error: "Couldn't read this file" })
    expect(t.rows.get("x")!.job.attempts).toBe(1)
    expect(t.rows.get("ok")!.result?.status).toBe("DONE")
    expect(JSON.stringify(t.log.error.mock.calls)).not.toContain("secret")
  })

  it("fails a job with no file path without calling the extractor", async () => {
    const t = setup()
    t.add("m", { filePath: null })
    t.indexer.enqueue("m")
    await t.indexer.idle()
    expect(t.rows.get("m")!.result).toEqual({ status: "FAILED", error: "File missing on disk" })
    expect(t.extract).not.toHaveBeenCalled()
  })

  it("passes the OCR switch through to the extractor", async () => {
    const t = setup({ ocr: false })
    t.add("a")
    t.indexer.enqueue("a")
    await t.indexer.idle()
    expect(t.extract).toHaveBeenCalledWith("/u/a.pdf", ".pdf", { ocr: false })
  })

  it("saving a result for a row that disappeared is a no-op", async () => {
    const t = setup()
    t.add("gone")
    t.extract.mockImplementationOnce(async () => {
      t.rows.delete("gone") // attachment deleted mid-extraction
      return { kind: "text", method: "TEXT", pages: ["late text"] }
    })
    t.indexer.enqueue("gone")
    await t.indexer.idle()
    expect(t.rows.has("gone")).toBe(false)
    // The chunks written for it are orphans; reconcile removes them.
    await t.indexer.reconcile()
    await t.indexer.idle()
    expect(t.chunks.has("gone")).toBe(false)
  })

  it("keeps a DONE row when the index write fails, and reconcile re-indexes it without re-extracting", async () => {
    const t = setup()
    t.add("a")
    t.replaceFails.value = true
    t.indexer.enqueue("a")
    await t.indexer.idle()
    expect(t.rows.get("a")!.result?.status).toBe("DONE")
    expect(t.chunks.has("a")).toBe(false)
    expect(t.log.error).toHaveBeenCalled()

    t.replaceFails.value = false
    t.extract.mockClear()
    await t.indexer.reconcile()
    await t.indexer.idle()
    expect(t.chunks.get("a")!.length).toBe(1)
    expect(t.extract).not.toHaveBeenCalled()
  })

  it("does nothing while indexing is off, then processes the backlog when it's back on", async () => {
    const t = setup({ enabled: false })
    t.add("a")
    t.add("b")
    t.indexer.enqueue("a")
    await t.indexer.idle()
    expect(await t.indexer.reconcile()).toEqual({ queued: 0 })
    expect(t.extract).not.toHaveBeenCalled()
    expect(t.rows.get("a")!.result).toBeUndefined()

    t.settings.indexingEnabled = true
    expect(await t.indexer.reconcile()).toEqual({ queued: 2 })
    await t.indexer.idle()
    expect(t.rows.get("a")!.result?.status).toBe("DONE")
    expect(t.rows.get("b")!.result?.status).toBe("DONE")
  })

  it("picks up a job enqueued while the queue is finishing", async () => {
    const t = setup()
    t.add("a")
    t.add("b")
    t.extract.mockImplementationOnce(async () => {
      t.indexer.enqueue("b")
      return { kind: "text", method: "TEXT", pages: ["a"] }
    })
    t.indexer.enqueue("a")
    await t.indexer.idle()
    expect(t.rows.get("b")!.result?.status).toBe("DONE")
  })
})
