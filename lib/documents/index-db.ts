import path from "path"
import { mkdirSync } from "fs"
import { createClient, type Client, type InStatement } from "@libsql/client"
import type { Chunk } from "./chunk"
import { INDEX_SCHEMA_VERSION } from "./limits"

// The keyword index lives in its own SQLite file, not the Prisma database:
// FTS5 virtual tables (and their shadow tables) can't be declared in
// schema.prisma, and `prisma migrate dev` would treat them as drift. It holds
// nothing that isn't also in AttachmentText, so it can be deleted and rebuilt
// at any time — reconcile() re-indexes every DONE row missing from it.

export type Hit = { chunkId: number; attachmentId: string; page: number; text: string; score: number }

export type SearchFilter = {
  /** null/undefined = every attachment; [] = none. */
  attachmentIds?: string[] | null
  recordTypes?: string[] | null
  excludeRecordTypes?: string[]
  /** e.g. health files owned by a person, which the record type alone can't identify. */
  excludeAttachmentIds?: string[]
  limit: number
}

export type SearchIndex = {
  replace(attachmentId: string, meta: { originalName: string; recordType: string }, chunks: Chunk[]): Promise<void>
  remove(attachmentIds: string[]): Promise<void>
  /** `match` must come from parseSearch — it is passed to FTS5 as-is. */
  search(match: string, filter: SearchFilter): Promise<Hit[]>
  indexedIds(): Promise<Set<string>>
  clear(): Promise<void>
  close(): void
  /** The modelKey the stored vectors belong to; null = none yet. */
  vectorModel(): Promise<string | null>
  /** Same key: no-op. Otherwise drop every vector and start a table of `dims`. */
  useVectorModel(key: string, dims: number): Promise<void>
  /** Chunks without a vector for the current model; [] when there is none. */
  chunksMissingVectors(limit: number): Promise<{ chunkId: number; text: string }[]>
  /** Ignored unless `key` is the current model; chunks deleted meanwhile are skipped. */
  writeVectors(key: string, rows: { chunkId: number; vector: number[] }[]): Promise<void>
  /** Best-first; score = cosine distance. The filters apply as in search(). */
  vectorSearch(vector: number[], filter: SearchFilter): Promise<Hit[]>
  vectorStats(): Promise<{ chunks: number; withVectors: number }>
}

export function searchIndexPath(env: Record<string, string | undefined> = process.env): string {
  if (env.SEARCH_INDEX_PATH) return path.resolve(env.SEARCH_INDEX_PATH)
  const db = (env.DATABASE_URL ?? "").replace(/^file:/, "")
  return path.join(db ? path.dirname(path.resolve(db)) : process.cwd(), "search-index.db")
}

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  `CREATE TABLE IF NOT EXISTS chunk (
     id INTEGER PRIMARY KEY,
     attachment_id TEXT NOT NULL,
     record_type TEXT NOT NULL,
     page INTEGER NOT NULL,
     ordinal INTEGER NOT NULL,
     text TEXT NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS chunk_attachment ON chunk(attachment_id)",
  // Contentless: chunk.text already holds the text; contentless_delete lets
  // rows go by rowid (SQLite >= 3.43, libsql ships 3.45).
  `CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
     text, original_name,
     content = '', contentless_delete = 1,
     tokenize = 'porter unicode61 remove_diacritics 2'
   )`,
]
const DROP = ["DROP TABLE IF EXISTS chunk_vec", "DROP TABLE IF EXISTS chunk_fts", "DROP TABLE IF EXISTS chunk", "DROP TABLE IF EXISTS meta"]
const setVersion: InStatement = {
  sql: "INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)",
  args: [String(INDEX_SCHEMA_VERSION)],
}

const marks = (n: number) => Array(n).fill("?").join(",")

/** Nearest-neighbour candidates fetched before filters; the filters then trim them. */
export const VECTOR_CANDIDATES = 200

function filterSql(f: SearchFilter): { where: string[]; args: (string | number)[] } {
  const where: string[] = []
  const args: (string | number)[] = []
  if (f.attachmentIds) {
    where.push(`c.attachment_id IN (${marks(f.attachmentIds.length)})`)
    args.push(...f.attachmentIds)
  }
  if (f.recordTypes?.length) {
    where.push(`c.record_type IN (${marks(f.recordTypes.length)})`)
    args.push(...f.recordTypes)
  }
  if (f.excludeRecordTypes?.length) {
    where.push(`c.record_type NOT IN (${marks(f.excludeRecordTypes.length)})`)
    args.push(...f.excludeRecordTypes)
  }
  if (f.excludeAttachmentIds?.length) {
    where.push(`c.attachment_id NOT IN (${marks(f.excludeAttachmentIds.length)})`)
    args.push(...f.excludeAttachmentIds)
  }
  return { where, args }
}

const toHit = (row: Record<string, unknown>): Hit => ({
  chunkId: Number(row.id),
  attachmentId: String(row.attachment_id),
  page: Number(row.page),
  text: String(row.text),
  score: Number(row.score),
})

async function prepare(db: Client) {
  const version = await db
    .execute("SELECT value FROM meta WHERE key = 'schema_version'")
    .then((r) => (r.rows[0]?.value as string | undefined) ?? null, () => null)
  if (version !== String(INDEX_SCHEMA_VERSION)) await db.batch([...DROP, ...SCHEMA, setVersion], "write")
}

export async function openSearchIndex(file: string): Promise<SearchIndex> {
  mkdirSync(path.dirname(file), { recursive: true })
  const db = createClient({ url: `file:${file.replace(/\\/g, "/")}` })
  await db.execute("PRAGMA journal_mode=WAL")
  await prepare(db)

  // Which model the vectors belong to; null = no vector table yet.
  let vecKey: string | null = await db
    .execute("SELECT value FROM meta WHERE key = 'embedding_model'")
    .then((r) => (r.rows[0]?.value as string | undefined) ?? null)
  const deleteVectorsFor = (idsSql: string) => `DELETE FROM chunk_vec WHERE chunk_id IN (SELECT id FROM chunk WHERE attachment_id ${idsSql})`

  return {
    async replace(attachmentId, meta, chunks) {
      const stmts: InStatement[] = [
        ...(vecKey ? [{ sql: deleteVectorsFor("= ?"), args: [attachmentId] }] : []),
        { sql: "DELETE FROM chunk_fts WHERE rowid IN (SELECT id FROM chunk WHERE attachment_id = ?)", args: [attachmentId] },
        { sql: "DELETE FROM chunk WHERE attachment_id = ?", args: [attachmentId] },
      ]
      for (const c of chunks) {
        stmts.push({
          sql: "INSERT INTO chunk(attachment_id, record_type, page, ordinal, text) VALUES (?, ?, ?, ?, ?)",
          args: [attachmentId, meta.recordType, c.page, c.ordinal, c.text],
        })
        stmts.push({
          sql: "INSERT INTO chunk_fts(rowid, text, original_name) VALUES (last_insert_rowid(), ?, ?)",
          args: [c.text, meta.originalName],
        })
      }
      await db.batch(stmts, "write")
    },

    async remove(attachmentIds) {
      for (let i = 0; i < attachmentIds.length; i += 500) {
        const part = attachmentIds.slice(i, i + 500)
        await db.batch(
          [
            ...(vecKey ? [{ sql: deleteVectorsFor(`IN (${marks(part.length)})`), args: part }] : []),
            { sql: `DELETE FROM chunk_fts WHERE rowid IN (SELECT id FROM chunk WHERE attachment_id IN (${marks(part.length)}))`, args: part },
            { sql: `DELETE FROM chunk WHERE attachment_id IN (${marks(part.length)})`, args: part },
          ],
          "write"
        )
      }
    },

    async search(match, f) {
      if (f.attachmentIds && f.attachmentIds.length === 0) return []
      const { where, args } = filterSql(f)
      const r = await db.execute({
        sql: `SELECT c.id, c.attachment_id, c.page, c.text, bm25(chunk_fts, 1.0, 0.5) AS score
              FROM chunk_fts JOIN chunk c ON c.id = chunk_fts.rowid
              WHERE ${["chunk_fts MATCH ?", ...where].join(" AND ")}
              ORDER BY score LIMIT ?`,
        args: [match, ...args, f.limit],
      })
      return r.rows.map(toHit)
    },

    async indexedIds() {
      const r = await db.execute("SELECT DISTINCT attachment_id FROM chunk")
      return new Set(r.rows.map((row) => String(row.attachment_id)))
    },

    async clear() {
      await db.batch([...DROP, ...SCHEMA, setVersion], "write")
      vecKey = null
    },

    close() {
      db.close()
    },

    async vectorModel() {
      return vecKey
    },

    async useVectorModel(key, dims) {
      if (key === vecKey) return
      if (!Number.isInteger(dims) || dims < 1 || dims > 4096) throw new Error("Invalid vector size")
      await db.batch(
        [
          "DROP TABLE IF EXISTS chunk_vec",
          // dims is a checked integer — F32_BLOB's size can't be a bound parameter.
          `CREATE TABLE chunk_vec (chunk_id INTEGER PRIMARY KEY, embedding F32_BLOB(${dims}) NOT NULL)`,
          "CREATE INDEX chunk_vec_idx ON chunk_vec (libsql_vector_idx(embedding, 'metric=cosine'))",
          { sql: "INSERT OR REPLACE INTO meta(key, value) VALUES ('embedding_model', ?)", args: [key] },
        ],
        "write"
      )
      vecKey = key
    },

    async chunksMissingVectors(limit) {
      if (!vecKey) return []
      const r = await db.execute({
        sql: `SELECT c.id, c.text FROM chunk c LEFT JOIN chunk_vec v ON v.chunk_id = c.id
              WHERE v.chunk_id IS NULL ORDER BY c.id LIMIT ?`,
        args: [limit],
      })
      return r.rows.map((row) => ({ chunkId: Number(row.id), text: String(row.text) }))
    },

    async writeVectors(key, rows) {
      // A batch from a model that has since been switched away from (possibly
      // one with the same vector size) must not mix into the new model's space.
      if (!vecKey || key !== vecKey || !rows.length) return
      await db.batch(
        rows.map((r) => ({
          sql: `INSERT OR REPLACE INTO chunk_vec(chunk_id, embedding)
                SELECT ?, vector32(?) WHERE EXISTS (SELECT 1 FROM chunk WHERE id = ?)`,
          args: [r.chunkId, JSON.stringify(r.vector), r.chunkId],
        })),
        "write"
      )
    },

    async vectorSearch(vector, f) {
      if (!vecKey || (f.attachmentIds && f.attachmentIds.length === 0)) return []
      const { where, args } = filterSql(f)
      const v = JSON.stringify(vector)
      const r = await db.execute({
        // Columns are qualified: vector_top_k and chunk both expose "id".
        sql: `SELECT c.id, c.attachment_id, c.page, c.text, vector_distance_cos(cv.embedding, vector32(?)) AS score
              FROM vector_top_k('chunk_vec_idx', vector32(?), ?) AS t
              JOIN chunk_vec cv ON cv.rowid = t.id
              JOIN chunk c ON c.id = cv.chunk_id
              ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
              ORDER BY score LIMIT ?`,
        args: [v, v, VECTOR_CANDIDATES, ...args, f.limit],
      })
      return r.rows.map(toHit)
    },

    async vectorStats() {
      const chunks = Number((await db.execute("SELECT count(*) AS n FROM chunk")).rows[0].n)
      const withVectors = vecKey ? Number((await db.execute("SELECT count(*) AS n FROM chunk_vec")).rows[0].n) : 0
      return { chunks, withVectors }
    },
  }
}
