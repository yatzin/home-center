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
    expect(await ids({ excludeAttachmentIds: ["m1"] })).toEqual(["s1"])
    expect(await ids({ attachmentIds: ["s1", "m1"], excludeAttachmentIds: ["s1"] })).toEqual(["m1"])
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

  describe("vectors", () => {
    const meta = { originalName: "a.txt", recordType: "SERVICE" }

    it("has no vector model until one is chosen", async () => {
      await index.replace("a1", meta, [chunk("alpha")])
      expect(await index.vectorModel()).toBeNull()
      expect(await index.chunksMissingVectors(10)).toEqual([])
    })

    it("stores vectors and finds the nearest chunks first", async () => {
      await index.replace("a1", meta, [chunk("east"), chunk("north", 1, 1)])
      await index.useVectorModel("m@1", 3)
      const missing = await index.chunksMissingVectors(10)
      expect(missing.map((m) => m.text).sort()).toEqual(["east", "north"])
      const byText = Object.fromEntries(missing.map((m) => [m.text, m.chunkId]))
      await index.writeVectors("m@1", [
        { chunkId: byText.east, vector: [1, 0, 0] },
        { chunkId: byText.north, vector: [0, 1, 0] },
      ])
      expect(await index.chunksMissingVectors(10)).toEqual([])
      const hits = await index.vectorSearch([0.9, 0.1, 0], { limit: 5 })
      expect(hits.map((h) => h.text)).toEqual(["east", "north"])
      expect(hits[0].chunkId).toBe(byText.east)
      expect(await index.vectorStats()).toEqual({ chunks: 2, withVectors: 2 })
    })

    it("applies the same filters as keyword search, including health exclusions", async () => {
      await index.replace("s1", { originalName: "s.txt", recordType: "SERVICE" }, [chunk("visit")])
      await index.replace("m1", { originalName: "m.txt", recordType: "MEDICATION" }, [chunk("pill")])
      await index.useVectorModel("m@1", 3)
      const missing = await index.chunksMissingVectors(10)
      await index.writeVectors("m@1", missing.map((m) => ({ chunkId: m.chunkId, vector: [1, 0, 0] })))
      const ids = async (f: object) => (await index.vectorSearch([1, 0, 0], { limit: 5, ...f })).map((h) => h.attachmentId).sort()
      expect(await ids({})).toEqual(["m1", "s1"])
      expect(await ids({ excludeRecordTypes: ["MEDICATION"] })).toEqual(["s1"])
      expect(await ids({ excludeAttachmentIds: ["s1"] })).toEqual(["m1"])
      expect(await ids({ attachmentIds: ["s1"] })).toEqual(["s1"])
      expect(await ids({ attachmentIds: [] })).toEqual([])
    })

    it("drops a file's vectors with its chunks", async () => {
      await index.replace("a1", meta, [chunk("alpha")])
      await index.useVectorModel("m@1", 3)
      const [m] = await index.chunksMissingVectors(10)
      await index.writeVectors("m@1", [{ chunkId: m.chunkId, vector: [1, 0, 0] }])
      await index.replace("a1", meta, [chunk("beta")])
      expect(await index.vectorStats()).toEqual({ chunks: 1, withVectors: 0 })
      await index.remove(["a1"])
      expect(await index.vectorSearch([1, 0, 0], { limit: 5 })).toEqual([])
    })

    it("starts over when the model changes, even to a different vector size", async () => {
      await index.replace("a1", meta, [chunk("alpha")])
      await index.useVectorModel("m@1", 3)
      const [m] = await index.chunksMissingVectors(10)
      await index.writeVectors("m@1", [{ chunkId: m.chunkId, vector: [1, 0, 0] }])
      await index.useVectorModel("other@2", 2)
      expect(await index.vectorModel()).toBe("other@2")
      expect(await index.vectorStats()).toEqual({ chunks: 1, withVectors: 0 })
      await index.writeVectors("other@2", [{ chunkId: m.chunkId, vector: [0, 1] }])
      expect((await index.vectorSearch([0, 1], { limit: 5 })).length).toBe(1)
    })

    it("ignores vectors written for a model that is no longer active", async () => {
      await index.replace("a1", meta, [chunk("alpha")])
      await index.useVectorModel("old@1", 3)
      const [m] = await index.chunksMissingVectors(10)
      await index.useVectorModel("new@1", 3)
      await index.writeVectors("old@1", [{ chunkId: m.chunkId, vector: [1, 0, 0] }])
      expect(await index.vectorStats()).toEqual({ chunks: 1, withVectors: 0 })
    })

    it("skips vectors for chunks deleted while they were being embedded", async () => {
      await index.replace("a1", meta, [chunk("alpha")])
      await index.useVectorModel("m@1", 3)
      const [m] = await index.chunksMissingVectors(10)
      await index.remove(["a1"])
      await index.writeVectors("m@1", [{ chunkId: m.chunkId, vector: [1, 0, 0] }])
      expect(await index.vectorStats()).toEqual({ chunks: 0, withVectors: 0 })
    })

    it("embeds and finds database records separately from file chunks", async () => {
      await index.replace("a1", meta, [chunk("alpha")])
      await index.replaceEntity("PROPERTY", "p1", "h1", ["east house", "notes about the east house"])
      await index.replaceEntity("VEHICLE", "v1", "h2", ["north car"])
      expect(await index.entityChunksMissingVectors(10)).toEqual([])
      await index.useVectorModel("m@1", 3)
      const missing = await index.entityChunksMissingVectors(10)
      expect(missing.map((m) => m.text)).toEqual(["east house", "notes about the east house", "north car"])
      const vec: Record<string, number[]> = { "east house": [1, 0, 0], "notes about the east house": [0.9, 0.2, 0], "north car": [0, 1, 0] }
      await index.writeEntityVectors("m@1", missing.map((m) => ({ chunkId: m.chunkId, vector: vec[m.text] })))
      // A file chunk is still waiting; records don't fill its slot.
      expect((await index.chunksMissingVectors(10)).map((m) => m.text)).toEqual(["alpha"])
      const hits = await index.entityVectorSearch([1, 0, 0], 5)
      expect(hits.map((h) => `${h.kind}:${h.entityId}`)).toEqual(["PROPERTY:p1", "PROPERTY:p1", "VEHICLE:v1"])
      expect(await index.entityStats()).toEqual({ chunks: 3, withVectors: 3 })
    })

    it("tracks record hashes and drops a record's chunks and vectors on replace or remove", async () => {
      await index.useVectorModel("m@1", 3)
      await index.replaceEntity("PROPERTY", "p1", "h1", ["old"])
      const [m] = await index.entityChunksMissingVectors(10)
      await index.writeEntityVectors("m@1", [{ chunkId: m.chunkId, vector: [1, 0, 0] }])
      await index.replaceEntity("PROPERTY", "p1", "h2", ["new"])
      expect(await index.entityHashes()).toEqual(new Map([["PROPERTY:p1", "h2"]]))
      expect(await index.entityStats()).toEqual({ chunks: 1, withVectors: 0 })
      await index.removeEntities(["PROPERTY:p1"])
      expect(await index.entityHashes()).toEqual(new Map())
      expect(await index.entityStats()).toEqual({ chunks: 0, withVectors: 0 })
    })

    it("starts record vectors over on a model switch and on clear", async () => {
      await index.replaceEntity("PROPERTY", "p1", "h1", ["house"])
      await index.useVectorModel("m@1", 3)
      const [m] = await index.entityChunksMissingVectors(10)
      await index.writeEntityVectors("m@1", [{ chunkId: m.chunkId, vector: [1, 0, 0] }])
      await index.useVectorModel("other@2", 2)
      expect(await index.entityStats()).toEqual({ chunks: 1, withVectors: 0 })
      await index.writeEntityVectors("m@1", [{ chunkId: m.chunkId, vector: [1, 0, 0] }])
      expect(await index.entityStats()).toEqual({ chunks: 1, withVectors: 0 })
      await index.clear()
      expect(await index.entityHashes()).toEqual(new Map())
    })

    it("adds the record tables to an index made before they existed", async () => {
      await index.replace("a1", meta, [chunk("alpha")])
      await index.useVectorModel("m@1", 3)
      const [m] = await index.chunksMissingVectors(10)
      await index.writeVectors("m@1", [{ chunkId: m.chunkId, vector: [1, 0, 0] }])
      index.close()
      const raw = createClient({ url: `file:${file.replace(/\\/g, "/")}` })
      await raw.batch(["DROP TABLE entity_vec", "DROP TABLE entity_chunk", "DROP TABLE entity_hash"], "write")
      raw.close()
      index = await openSearchIndex(file)
      expect(await index.vectorModel()).toBe("m@1")
      expect(await index.vectorStats()).toEqual({ chunks: 1, withVectors: 1 })
      await index.replaceEntity("PROPERTY", "p1", "h1", ["house"])
      const [e] = await index.entityChunksMissingVectors(10)
      await index.writeEntityVectors("m@1", [{ chunkId: e.chunkId, vector: [0, 1, 0] }])
      expect((await index.entityVectorSearch([0, 1, 0], 5)).map((h) => h.entityId)).toEqual(["p1"])
    })

    it("forgets the model of an old index with no stored vectors, so both tables are made fresh", async () => {
      await index.useVectorModel("m@1", 3)
      index.close()
      const raw = createClient({ url: `file:${file.replace(/\\/g, "/")}` })
      await raw.batch(["DROP TABLE entity_vec"], "write")
      raw.close()
      index = await openSearchIndex(file)
      expect(await index.vectorModel()).toBeNull()
    })

    it("keeps the model across reopen and forgets it on clear", async () => {
      await index.useVectorModel("m@1", 3)
      index.close()
      index = await openSearchIndex(file)
      expect(await index.vectorModel()).toBe("m@1")
      await index.clear()
      expect(await index.vectorModel()).toBeNull()
    })
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
