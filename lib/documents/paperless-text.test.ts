import { beforeEach, describe, expect, it, vi } from "vitest"

// Imported Paperless OCR text must survive "re-extract all", an extractor bump
// and "clear text". A tiny in-memory evaluator runs the real where clauses.
type Text = { attachmentId: string; status: string; extractorVersion: number; attempts: number; source: string }
type Att = { id: string; source: string; paperlessTextHash: string | null }

const h = vi.hoisted(() => ({
  texts: [] as Text[],
  atts: [] as Att[],
  clear: vi.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matches(row: Record<string, any>, where: Record<string, any> | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as object[]).some((w) => matches(row, w as Record<string, unknown>))
    if (k === "AND") return (v as object[]).every((w) => matches(row, w as Record<string, unknown>))
    if (k === "NOT") return !(Array.isArray(v) ? v.some((w) => matches(row, w)) : matches(row, v))
    if (k === "attachment") {
      const att = h.atts.find((a) => a.id === row.attachmentId)!
      return matches(att, "is" in v ? v.is : v)
    }
    if (v && typeof v === "object") {
      if ("lt" in v) return row[k] < v.lt
      if ("not" in v) return row[k] !== v.not
      if ("in" in v) return v.in.includes(row[k])
      throw new Error(`unsupported filter ${k}`)
    }
    return row[k] === v
  })
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    attachmentText: {
      findMany: vi.fn(async ({ where }) => h.texts.filter((t) => matches(t, where)).map((t) => ({ attachmentId: t.attachmentId }))),
      updateMany: vi.fn(async ({ where, data }) => {
        const hit = h.texts.filter((t) => matches(t, where))
        hit.forEach((t) => Object.assign(t, data))
        return { count: hit.length }
      }),
    },
    attachment: {
      updateMany: vi.fn(async ({ where, data }) => {
        const hit = h.atts.filter((a) => matches(a, where))
        hit.forEach((a) => Object.assign(a, data))
        return { count: hit.length }
      }),
    },
  },
}))
vi.mock("./index-db", () => ({ openSearchIndex: async () => ({ clear: h.clear }), searchIndexPath: () => "x" }))
vi.mock("./indexer", () => ({ createIndexer: () => ({ reconcile: async () => ({ queued: 0 }), enqueue: vi.fn(), embedNow: vi.fn() }) }))
vi.mock("./embed/server", () => ({ activeModel: async () => null, embedderFor: vi.fn() }))
vi.mock("@/lib/search/entities/changes", () => ({ entitiesChanged: vi.fn() }))
vi.mock("./settings", () => ({ loadDocumentSettings: async () => ({ indexingEnabled: true }) }))

import { prismaIndexerStore } from "./store"
import { clearAllText, reextractAll } from "./indexer-server"
import { EXTRACTOR_VERSION } from "./limits"

const OLD = EXTRACTOR_VERSION - 1

function seed(rows: Array<[id: string, source: string, status: string, version: number]>) {
  h.atts = rows.map(([id, source]) => ({ id, source, paperlessTextHash: source === "PAPERLESS" ? `hash-${id}` : null }))
  h.texts = rows.map(([attachmentId, source, status, extractorVersion]) => ({ attachmentId, source, status, extractorVersion, attempts: 0 }))
}
const text = (id: string) => h.texts.find((t) => t.attachmentId === id)!
const att = (id: string) => h.atts.find((a) => a.id === id)!

beforeEach(() => vi.clearAllMocks())

describe("Paperless OCR text is kept from local extraction", () => {
  it("dueIds skips PAPERLESS+DONE with an old extractorVersion; keeps LOCAL old and PAPERLESS PENDING/FAILED", async () => {
    seed([
      ["p-done-old", "PAPERLESS", "DONE", OLD],
      ["l-done-old", "LOCAL", "DONE", OLD],
      ["p-pending", "PAPERLESS", "PENDING", 0],
      ["p-failed", "PAPERLESS", "FAILED", OLD],
      ["l-done-new", "LOCAL", "DONE", EXTRACTOR_VERSION],
    ])
    expect((await prismaIndexerStore.dueIds()).sort()).toEqual(["l-done-old", "p-failed", "p-pending"])
  })

  it("reextractAll leaves PAPERLESS+DONE rows untouched", async () => {
    seed([
      ["p-done", "PAPERLESS", "DONE", EXTRACTOR_VERSION],
      ["l-done", "LOCAL", "DONE", EXTRACTOR_VERSION],
      ["p-empty", "PAPERLESS", "EMPTY", EXTRACTOR_VERSION],
    ])
    text("p-done").attempts = 2
    await reextractAll()
    expect(text("p-done")).toMatchObject({ extractorVersion: EXTRACTOR_VERSION, attempts: 2 })
    expect(text("l-done").extractorVersion).toBe(0)
    expect(text("p-empty").extractorVersion).toBe(0)
  })

  it("clearAllText nulls paperlessTextHash on PAPERLESS rows only, so the next check re-copies the text", async () => {
    seed([
      ["p", "PAPERLESS", "DONE", EXTRACTOR_VERSION],
      ["l", "LOCAL", "DONE", EXTRACTOR_VERSION],
    ])
    att("l").paperlessTextHash = "keep"
    await clearAllText()
    expect(att("p").paperlessTextHash).toBeNull()
    expect(att("l").paperlessTextHash).toBe("keep")
    expect(text("p").status).toBe("PENDING")
    expect(h.clear).toHaveBeenCalled()
  })
})
