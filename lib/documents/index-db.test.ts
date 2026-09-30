import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { createClient } from "@libsql/client"
import { openSearchIndex, searchIndexPath, type SearchIndex } from "./index-db"
import { parseSearch } from "./fts-query"
import type { Chunk } from "./chunk"

// Runs against a real SQLite file in a temp folder — FTS5 behaviour is the
// thing under test. It never touches the app database.

let dir: string
let file: string
let index: SearchIndex
let n = 0

const chunk = (text: string, page = 1, ordinal = 0): Chunk => ({ page, ordinal, text })
const q = (s: string) => parseSearch(s)!.match

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "hc-index-"))
})

afterAll(() => {
  // On Windows libsql can hold the file a moment after close(); leftovers in
  // the temp folder are harmless.
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    // ignore
  }
})

describe("search index", () => {
  beforeEach(async () => {
    file = path.join(dir, `search-index-${n++}.db`)
    index = await openSearchIndex(file)
  })

  afterEach(() => {
    index.close()
  })

  it("finds chunks by stemmed words and ranks better matches first", async () => {
    await index.replace("a1", { originalName: "Furnace manual.pdf", recordType: "WARRANTY" }, [
      chunk("Replace the furnace filter every 90 days. Filter size 16x25x1.", 31),
    ])
    await index.replace("a2", { originalName: "Auto policy.pdf", recordType: "INSURANCE" }, [
      chunk("The deductible is $500 per claim. Filters are not covered."),
    ])
    const hits = await index.search(q("furnace filters"), { limit: 10 })
    expect(hits.map((h) => h.attachmentId)).toEqual(["a1", "a2"])
    expect(hits[0].page).toBe(31)
    expect(hits[0].text).toContain("16x25x1")
  })

  it("matches the file name as well as the text", async () => {
    await index.replace("a1", { originalName: "Bosch dishwasher manual.pdf", recordType: "WARRANTY" }, [chunk("Rinse aid settings")])
    expect((await index.search(q("bosch"), { limit: 5 })).map((h) => h.attachmentId)).toEqual(["a1"])
  })

  it("replaces an attachment's chunks instead of adding to them", async () => {
    const meta = { originalName: "a.txt", recordType: "SERVICE" }
    await index.replace("a1", meta, [chunk("old words")])
    await index.replace("a1", meta, [chunk("new words")])
    expect(await index.search(q("old"), { limit: 5 })).toEqual([])
    expect((await index.search(q("new"), { limit: 5 })).length).toBe(1)
  })

  it("removes attachments and reports what is indexed", async () => {
    const meta = { originalName: "a.txt", recordType: "SERVICE" }
    await index.replace("a1", meta, [chunk("alpha")])
    await index.replace("a2", meta, [chunk("alpha")])
    await index.remove(["a1"])
    expect([...(await index.indexedIds())]).toEqual(["a2"])
    expect((await index.search(q("alpha"), { limit: 5 })).map((h) => h.attachmentId)).toEqual(["a2"])
  })

  it("filters by attachment ids and record types", async () => {
    await index.replace("s1", { originalName: "s.txt", recordType: "SERVICE" }, [chunk("receipt total")])
    await index.replace("m1", { originalName: "m.txt", recordType: "MEDICATION" }, [chunk("receipt total")])
    const ids = async (f: object) => (await index.search(q("receipt"), { limit: 5, ...f })).map((h) => h.attachmentId).sort()
    expect(await ids({ attachmentIds: ["m1"] })).toEqual(["m1"])
    expect(await ids({ attachmentIds: [] })).toEqual([])
    expect(await ids({ recordTypes: ["SERVICE"] })).toEqual(["s1"])
    expect(await ids({ excludeRecordTypes: ["MEDICATION"] })).toEqual(["s1"])
  })

  it("clear empties the index", async () => {
    await index.replace("a1", { originalName: "a.txt", recordType: "SERVICE" }, [chunk("alpha")])
    await index.clear()
    expect((await index.indexedIds()).size).toBe(0)
    expect(await index.search(q("alpha"), { limit: 5 })).toEqual([])
  })

  it("rebuilds from scratch when the schema version changes", async () => {
    await index.replace("a1", { originalName: "a.txt", recordType: "SERVICE" }, [chunk("alpha")])
    index.close()
    const raw = createClient({ url: `file:${file.replace(/\\/g, "/")}` })
    await raw.execute("UPDATE meta SET value = '0' WHERE key = 'schema_version'")
    raw.close()
    index = await openSearchIndex(file)
    expect((await index.indexedIds()).size).toBe(0)
  })

  it.each([
    'filter NEAR(size 5)', 'title:secret', '^start', 'filt*', '"unbalanced quote', 'a" OR "b', '🔥 furnace 🔥', 'x'.repeat(500),
  ])("never throws on sanitised model input: %s", async (input) => {
    await index.replace("a1", { originalName: "a.txt", recordType: "SERVICE" }, [chunk("furnace filter size")])
    const parsed = parseSearch(input)
    if (parsed) await expect(index.search(parsed.match, { limit: 5 })).resolves.toBeInstanceOf(Array)
  })
})

describe("searchIndexPath", () => {
  it("sits next to the database file by default", () => {
    expect(searchIndexPath({ DATABASE_URL: "file:/data/homecenter.db" })).toBe(path.resolve("/data/search-index.db"))
  })
  it("honours SEARCH_INDEX_PATH", () => {
    expect(searchIndexPath({ SEARCH_INDEX_PATH: "/tmp/x.db", DATABASE_URL: "file:/data/h.db" })).toBe(path.resolve("/tmp/x.db"))
  })
})
