# Semantic Document Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add meaning-based search next to the keyword index. Every chunk gets a vector from a local embedding model running in a worker thread. `search_documents` merges keyword and vector rankings. Admins choose, download, switch and delete models from a vetted list, with `bge-small-en-v1.5` built into the image.

**Architecture:** `@huggingface/transformers` on `onnxruntime-node` runs in a `worker_threads` worker (`workers/embed-worker.mjs`), started on demand and terminated to unload. A main-thread `Embedder` wraps it, governed by a pure unload state machine:
- after indexing drains, unload right away;
- after a search, unload 10 idle minutes later.

Vectors live in `search-index.db` (`chunk_vec`, libsql `F32_BLOB` + `libsql_vector_idx`), tagged with the model they came from. The indexer embeds chunks that lack vectors after each drain. `search_documents` fuses BM25 and vector hits with reciprocal rank fusion. The Docker image moves to Debian slim, because ONNX Runtime needs glibc.

**Tech Stack:** Next.js 16.2, Prisma 7 + SQLite (libsql), `@libsql/client` vectors, `@huggingface/transformers` 4.3 (Apache-2.0), `onnxruntime-node` 1.30 (MIT), `worker_threads`, Vitest, zod.

**Spec:** `docs/superpowers/specs/2026-10-01-semantic-search-design.md` (approved). It builds on `docs/superpowers/specs/2026-09-30-document-search-design.md`.

## Global Constraints

- Branch `FEAT/document-search` (continue it). Commit after every task. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019Vv2sPfo1u4y7bxkVnWMDG
  ```
- Next.js 16: read the matching guide in `node_modules/next/dist/docs/` before touching `next.config.ts`, routes or pages.
- **Vetted models only.** Ids, repos, revisions, file sizes and sha256 values are fixed in `lib/documents/embed/models.ts` (Task 1). No user-supplied model ids or URLs anywhere.
- Built-in model `bge-small-en-v1.5`: **cannot be deleted**; it lives in `models/builtin/` (image: `/app/models/builtin`).
- Downloads go to `MODELS_DIR` (Docker `/data/models`, dev default `./models/downloads`), only from `https://huggingface.co/<repo>/resolve/<revision>/<file>`, checked for size and sha256 before rename. Network is used **only** on an admin's Download click (and at Docker build time for the built-in model).
- The worker loads with `env.allowRemoteModels = false`.
- Unload policy (verbatim from spec): after an embed batch, if the queue is empty and the last search was ≥ `EMBEDDING_IDLE_MINUTES` ago (or there was none), unload now. After a query, unload `EMBEDDING_IDLE_MINUTES` (default **10**) later unless indexing is running. `0` = unload right after each search.
- Cold search **waits** for the model to load.
- Hybrid ranking: BM25 top **60** + vector top **60** (from `vector_top_k` k = **200**, then filters) → RRF with k = **60**.
- Embedding batches of **16** chunks.
- The semantic layer can never break search: any embedder failure is logged by error *name* only, and search falls back to keyword-only.
- Health exclusion applies to vector results exactly as to keyword results (`excludeRecordTypes` + `excludeAttachmentIds`).
- Vitest runs `lib/**/*.test.ts`. Tests must not import `@/lib/prisma`. Prisma-bound code: `lib/documents/embed/server.ts`, `lib/documents/indexer-server.ts`, `lib/documents/settings.ts`, `lib/actions/*`, tools.
- Line endings: many existing files are CRLF. Edit them with the Edit tool, not `sed`/string replace with `\n`.
- No local Docker: the image is verified on the user's NAS (Task 9).
- Verification per task: `npx vitest run`, `npx tsc --noEmit`, `npx eslint <changed paths>` (the repo has 13 pre-existing lint errors elsewhere; no new ones).

## Review Focus

1. **Switching between two 768-dimension models while indexing** (arctic ↔ bge-base ↔ nomic). An in-flight batch from the old model must not land in the new model's table; vectors from different models are silently incomparable. Pinned in Task 3 (`index-db.test.ts` "ignores vectors written for a model that is no longer active").
2. **Model download interrupted, wrong bytes, disk full, or HTTP error.** Expect no `.part` or half-written files left, the model not listed as installed, and a retry that works. Pinned in Task 4 (`download.test.ts`, `manager.test.ts`).
3. **Semantic search on but the active model is missing** (dev without `models:fetch-builtin`, or files deleted by hand). Expect keyword-only search, Settings showing the model as not installed, no errors in the chat. Pinned in Task 5 (embedder failing-load test) and Task 7 (tsx check with the model folder renamed).
4. **A question with no searchable keywords** ("anything about mould?", only stop-words). Expect vector-only results instead of the "give some words" error when semantic is available. Pinned in Task 7 (tsx check).
5. **Health files through the vector path.** A person's visit or medication file must never come back from vector search while health documents are off. Pinned in Task 3 (`vectorSearch` honours `excludeAttachmentIds` / `excludeRecordTypes`) and Task 7 (tsx check with health off).

---

## File Map

**Create**
| File | Responsibility |
|---|---|
| `lib/documents/embed/models.ts` (+ test) | Vetted registry, `modelById`, `modelKey`, `modelSize`, `BUILTIN_MODEL_ID` |
| `lib/documents/embed/fusion.ts` (+ test) | Reciprocal rank fusion |
| `lib/documents/embed/lifecycle.ts` (+ test) | Unload state machine (fake-clock tested) |
| `lib/documents/embed/files.ts` (+ test) | Model folders: built-in / downloads roots, `isInstalled`, `deleteModelFiles` |
| `lib/documents/embed/download.ts` (+ test) | Verified streaming download of one model |
| `lib/documents/embed/manager.ts` (+ test) | One download at a time, progress, last error |
| `lib/documents/embed/embedder.ts` (+ test) | Worker client: load, embed, unload, lifecycle |
| `lib/documents/embed/server.ts` | Per-process embedder + download manager, active model, model status |
| `workers/embed-worker.mjs` | Worker entry (plain ESM, not bundled) |
| `scripts/fetch-builtin-model.ts` | Downloads the built-in model into `models/builtin/` |
| `prisma/migrations/<ts>_add_semantic_settings/migration.sql` | Two `DocumentSettings` columns (generated) |

**Modify**
| File | Change |
|---|---|
| `package.json` | `@huggingface/transformers`; `models:fetch-builtin` script |
| `next.config.ts` | `serverExternalPackages` += `@huggingface/transformers`, `onnxruntime-node` |
| `.gitignore` | `/models/` |
| `prisma/schema.prisma` | `DocumentSettings.semanticEnabled`, `embeddingModel` |
| `lib/documents/settings.ts` | Load the two fields |
| `lib/documents/index-db.ts` (+ test) | `Hit.chunkId`; shared filter SQL; vector table and methods |
| `lib/documents/indexer.ts` (+ test) | Embedding stage after each drain |
| `lib/documents/indexer-server.ts` | Wire semantic deps; `semanticSearchModel()`; stats with vectors |
| `lib/documents/stats.ts` (+ test) | Vector progress in the status line |
| `lib/documents/tool-helpers.ts` (+ test) | Description mentions meaning; `Hit` fixtures gain `chunkId` |
| `lib/llm/tools/documents.ts` | Hybrid search, vector-only fallback |
| `lib/actions/document-settings.ts` | `semanticEnabled`; model status/download/use/delete actions |
| `components/settings/document-settings.tsx` | Semantic section and model table |
| `app/(app)/settings/page.tsx` | Pass model status |
| `Dockerfile`, `docker-entrypoint.sh` | Debian slim, gosu, built-in model, ONNX pruning, worker copy |
| `README.md` | Semantic search section |

---

### Task 1: Dependency, model registry, settings fields

**Files:**
- Modify: `package.json`, `next.config.ts`, `.gitignore`, `prisma/schema.prisma`, `lib/documents/settings.ts`
- Create: `lib/documents/embed/models.ts`, `lib/documents/embed/models.test.ts`
- Generated: `prisma/migrations/<ts>_add_semantic_settings/migration.sql`

**Interfaces:**
- Produces:
  - `type ModelFile = { path: string; size: number; sha256: string }`
  - `type EmbeddingModel = { id: string; label: string; purpose: string; repo: string; revision: string; dims: number; pooling: "cls" | "mean"; queryPrefix: string; passagePrefix: string; license: string; builtIn?: true; files: ModelFile[] }`
  - `EMBEDDING_MODELS: EmbeddingModel[]`, `BUILTIN_MODEL_ID = "bge-small-en-v1.5"`
  - `modelById(id: string): EmbeddingModel | null`, `modelKey(m): string` (`"<id>@<revision>"`), `modelSize(m): number`
  - `DocumentSettingsValue` gains `semanticEnabled: boolean`, `embeddingModel: string`

- [ ] **Step 1: Install and configure**

```bash
npm install @huggingface/transformers@^4.3.0
```

In `next.config.ts`, add `"@huggingface/transformers"` and `"onnxruntime-node"` to `serverExternalPackages`.

Append to `.gitignore`:
```
# embedding models (built-in is fetched by npm run models:fetch-builtin)
/models/
```

- [ ] **Step 2: Settings columns**

In `prisma/schema.prisma`, `model DocumentSettings`, after `ocrEnabled` (use the Edit tool):

```prisma
  /// Embed chunks and use them in search_documents. Needs indexingEnabled.
  semanticEnabled Boolean  @default(true)
  /// Vetted model id (lib/documents/embed/models.ts). Default is the built-in one.
  embeddingModel  String   @default("bge-small-en-v1.5")
```

```bash
npx prisma migrate dev --name add_semantic_settings
npx prisma generate
```

Expected: the migration adds two columns to `DocumentSettings`; no drift.

In `lib/documents/settings.ts`:

```ts
export type DocumentSettingsValue = {
  indexingEnabled: boolean
  ocrEnabled: boolean
  semanticEnabled: boolean
  embeddingModel: string
}

/** The singleton row, or the defaults when nobody has saved it yet. */
export async function loadDocumentSettings(): Promise<DocumentSettingsValue> {
  const row = await prisma.documentSettings.findUnique({ where: { id: DOCUMENT_SETTINGS_ID } })
  return {
    indexingEnabled: row?.indexingEnabled ?? true,
    ocrEnabled: row?.ocrEnabled ?? true,
    semanticEnabled: row?.semanticEnabled ?? true,
    embeddingModel: row?.embeddingModel ?? "bge-small-en-v1.5",
  }
}
```

`updateDocumentSettings` needs no change yet: its upsert only writes the fields it parses (Task 8 adds `semanticEnabled`).

- [ ] **Step 3: Write the failing registry test**

Create `lib/documents/embed/models.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { BUILTIN_MODEL_ID, EMBEDDING_MODELS, modelById, modelKey, modelSize } from "./models"

describe("embedding model registry", () => {
  it("has unique ids and exactly one built-in model, the default", () => {
    const ids = EMBEDDING_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const builtIn = EMBEDDING_MODELS.filter((m) => m.builtIn)
    expect(builtIn.map((m) => m.id)).toEqual([BUILTIN_MODEL_ID])
  })

  it.each(EMBEDDING_MODELS.map((m) => [m.id, m] as const))("pins everything needed to download and run %s", (_id, m) => {
    expect(m.revision).toMatch(/^[0-9a-f]{40}$/)
    expect([384, 768, 1024]).toContain(m.dims)
    expect(["cls", "mean"]).toContain(m.pooling)
    const paths = m.files.map((f) => f.path)
    for (const needed of ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"]) {
      expect(paths).toContain(needed)
    }
    for (const f of m.files) {
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(f.size).toBeGreaterThan(0)
      expect(f.path).not.toMatch(/\.\.|^\//)
    }
    expect(m.repo).toMatch(/^[\w.-]+\/[\w.-]+$/)
  })

  it("looks models up and describes them", () => {
    const m = modelById(BUILTIN_MODEL_ID)!
    expect(modelKey(m)).toBe(`bge-small-en-v1.5@${m.revision}`)
    expect(modelSize(m)).toBe(m.files.reduce((n, f) => n + f.size, 0))
    expect(modelById("not-a-model")).toBeNull()
  })
})
```

Run: `npx vitest run lib/documents/embed/models.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the registry**

Create `lib/documents/embed/models.ts`. The entries were generated on 2026-10-01 from the Hugging Face API (revision = repo head commit, sha256 = LFS oid or the hash of the downloaded small file); copy them exactly:

```ts
// The vetted embedding models. Everything needed to download and run each one
// is pinned here: repo, commit, every file's size and sha256, how to pool the
// output and which prefixes the model was trained with. Nothing outside this
// list can be downloaded or loaded.

export type ModelFile = { path: string; size: number; sha256: string }

export type EmbeddingModel = {
  id: string
  label: string
  purpose: string
  repo: string
  revision: string
  dims: number
  pooling: "cls" | "mean"
  queryPrefix: string
  passagePrefix: string
  license: string
  builtIn?: true
  files: ModelFile[]
}

export const BUILTIN_MODEL_ID = "bge-small-en-v1.5"

export const EMBEDDING_MODELS: EmbeddingModel[] = [
  {
    id: "bge-small-en-v1.5",
    label: "BGE small (English)",
    purpose: "Fast, good for English. Built in.",
    repo: "Xenova/bge-small-en-v1.5",
    revision: "ea104dacec62c0de699686887e3f920caeb4f3e3",
    dims: 384,
    pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    passagePrefix: "",
    license: "MIT",
    builtIn: true,
    files: [
      { path: "config.json", size: 683, sha256: "fa73f90bf92c8cace1fbcb709626306f2bdbc9ea3e5b5f94b440df9b6aa56350" },
      { path: "tokenizer.json", size: 711396, sha256: "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66" },
      { path: "tokenizer_config.json", size: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
      { path: "special_tokens_map.json", size: 125, sha256: "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3" },
      { path: "onnx/model_quantized.onnx", size: 34014426, sha256: "6c9c6101a956d62dfb5e7190c538226c0c5bb9cb27b651234b6df063ee7dbfe4" },
    ],
  },
  {
    id: "bge-base-en-v1.5",
    label: "BGE base (English)",
    purpose: "Better quality for English, about 3× slower.",
    repo: "Xenova/bge-base-en-v1.5",
    revision: "4d6cd88e18e51a5e020c2c305726d76ada9c03cf",
    dims: 768,
    pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    passagePrefix: "",
    license: "MIT",
    files: [
      { path: "config.json", size: 717, sha256: "d83c21fa7366994560727112ef0a31d8a2ec1c280c2a3e66326fdb877f64c91e" },
      { path: "tokenizer.json", size: 711396, sha256: "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66" },
      { path: "tokenizer_config.json", size: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
      { path: "special_tokens_map.json", size: 125, sha256: "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3" },
      { path: "onnx/model_quantized.onnx", size: 110083337, sha256: "c9729cc84cbd0e9fecc759505d2be65916c9fe05222d7ea26c65fcb3382af38d" },
    ],
  },
  {
    id: "snowflake-arctic-embed-m-v1.5",
    label: "Arctic Embed M (English)",
    purpose: "Best quality for its size, English. Recommended upgrade.",
    repo: "Snowflake/snowflake-arctic-embed-m-v1.5",
    revision: "e58a8f756156a1293d763f17e3aae643474e9b8a",
    dims: 768,
    pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    passagePrefix: "",
    license: "Apache-2.0",
    files: [
      { path: "config.json", size: 772, sha256: "d2dddc06af0aeeb7fd3289a3dee1ac76dce0c3df2467cadd26f5f731f8d7919b" },
      { path: "tokenizer.json", size: 711649, sha256: "91f1def9b9391fdabe028cd3f3fcc4efd34e5d1f08c3bf2de513ebb5911a1854" },
      { path: "tokenizer_config.json", size: 1381, sha256: "0e83e9d7206b3ade43f8f2aeef523cf5d5b4a25b67af21b273de21972c0f58b7" },
      { path: "special_tokens_map.json", size: 695, sha256: "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a" },
      { path: "onnx/model_quantized.onnx", size: 110145162, sha256: "a18f437b2466863901a0bdc14904cf93246f5ecce0b656fc773bc2b7b2f84f6e" },
    ],
  },
  {
    id: "nomic-embed-text-v1.5",
    label: "Nomic Embed Text (English)",
    purpose: "Good quality for English; a little larger.",
    repo: "nomic-ai/nomic-embed-text-v1.5",
    revision: "e9b6763023c676ca8431644204f50c2b100d9aab",
    dims: 768,
    pooling: "mean",
    queryPrefix: "search_query: ",
    passagePrefix: "search_document: ",
    license: "Apache-2.0",
    files: [
      { path: "config.json", size: 2538, sha256: "9ab00bd92cee80a569f708140b7b6c1661a65891ff3765b1519e181ba2f2c92b" },
      { path: "tokenizer.json", size: 711396, sha256: "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66" },
      { path: "tokenizer_config.json", size: 1191, sha256: "d7e0000bcc80134debd2222220427e6bf5fa20a669f40a0d0d1409cc18e0a9bc" },
      { path: "special_tokens_map.json", size: 695, sha256: "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a" },
      { path: "onnx/model_quantized.onnx", size: 137296292, sha256: "b4342336debaea79de872370664b0aaeb67dea4605513d00ee236ea871a81f27" },
    ],
  },
  {
    id: "multilingual-e5-base",
    label: "E5 base (many languages)",
    purpose: "For documents in languages other than English.",
    repo: "Xenova/multilingual-e5-base",
    revision: "1ec9243030a27d1a115d5c340572074c125b58b2",
    dims: 768,
    pooling: "mean",
    queryPrefix: "query: ",
    passagePrefix: "passage: ",
    license: "MIT",
    files: [
      { path: "config.json", size: 686, sha256: "4c27930e59106027abab56f7531c1fa6b14bbf31e8229ec36d68affa4e869bcd" },
      { path: "tokenizer.json", size: 17082660, sha256: "62c24cdc13d4c9952d63718d6c9fa4c287974249e16b7ade6d5a85e7bbb75626" },
      { path: "tokenizer_config.json", size: 418, sha256: "efb5c0d09722e5fe59a462cd2a9976ee216d55b037597d997cd3fe833216da15" },
      { path: "special_tokens_map.json", size: 280, sha256: "06e405a36dfe4b9604f484f6a1e619af1a7f7d09e34a8555eb0b77b66318067f" },
      { path: "onnx/model_quantized.onnx", size: 278647662, sha256: "df7a9a29309e3ad491e1783adf8baee710262cc06079c7cbab63c630277fac94" },
    ],
  },
  {
    id: "bge-large-en-v1.5",
    label: "BGE large (English)",
    purpose: "Highest quality, slow on small hosts.",
    repo: "Xenova/bge-large-en-v1.5",
    revision: "dfeef6070b90658e1b391a6940efdb0925c1de6f",
    dims: 1024,
    pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    passagePrefix: "",
    license: "MIT",
    files: [
      { path: "config.json", size: 719, sha256: "7bd757258c7418221da95ff1853bae50ef5d1bee3e8c01a96611243a52aa7299" },
      { path: "tokenizer.json", size: 711396, sha256: "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66" },
      { path: "tokenizer_config.json", size: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
      { path: "special_tokens_map.json", size: 125, sha256: "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3" },
      { path: "onnx/model_quantized.onnx", size: 336983162, sha256: "4842b56e233be1cc74770f57f63b1ebb6cf357cca3dd73fcdec35c019f8a5d6e" },
    ],
  },
]

export function modelById(id: string): EmbeddingModel | null {
  return EMBEDDING_MODELS.find((m) => m.id === id) ?? null
}

/** Identifies the vectors a model produces; a new revision means new vectors. */
export function modelKey(m: EmbeddingModel): string {
  return `${m.id}@${m.revision}`
}

export function modelSize(m: EmbeddingModel): number {
  return m.files.reduce((n, f) => n + f.size, 0)
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run lib/documents/embed && npx tsc --noEmit && npx eslint lib/documents next.config.ts`
Expected: PASS, clean.

```bash
git add package.json package-lock.json next.config.ts .gitignore prisma lib/documents/settings.ts lib/documents/embed/models.ts lib/documents/embed/models.test.ts
git commit -m "feat(documents): embedding model registry and semantic settings"
```

---

### Task 2: Rank fusion and the unload state machine

**Files:**
- Create: `lib/documents/embed/fusion.ts`, `lib/documents/embed/fusion.test.ts`, `lib/documents/embed/lifecycle.ts`, `lib/documents/embed/lifecycle.test.ts`
- Modify: `lib/documents/index-db.ts` (only the `Hit` type gains `chunkId`), `lib/documents/tool-helpers.test.ts` (fixture), `lib/documents/indexer.test.ts` (fake index returns `chunkId` if it builds hits; it doesn't today)

**Interfaces:**
- Consumes: `Hit` (now `{ chunkId: number; attachmentId: string; page: number; text: string; score: number }`)
- Produces:
  - `RRF_K = 60`; `fuse(lists: Hit[][], limit: number, k?: number): Hit[]`. Lists are best-first; result is best-first with `score = −(fused score)`, so lower is better, like BM25 and `groupHits`.
  - `type LifecycleDeps = { idleMs: number; now(): number; setTimer(fn: () => void, ms: number): unknown; clearTimer(h: unknown): void; unload(): void }`
  - `type Lifecycle = { indexingStarted(): void; indexingDrained(): void; searchUsed(): void; cancel(): void }`
  - `createLifecycle(d: LifecycleDeps): Lifecycle`

- [ ] **Step 1: Add `chunkId` to `Hit`**

In `lib/documents/index-db.ts`: `export type Hit = { chunkId: number; attachmentId: string; page: number; text: string; score: number }`. In `search()`, select `c.id` and map `chunkId: Number(row.id)`. In `lib/documents/tool-helpers.test.ts`, the `hit()` fixture becomes `({ chunkId: Math.round(score * -100), attachmentId, score, page, text: … })`. Run `npx tsc --noEmit` and fix any other fixture the compiler names.

- [ ] **Step 2: Failing tests**

Create `lib/documents/embed/fusion.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { fuse } from "./fusion"
import type { Hit } from "../index-db"

const hit = (chunkId: number): Hit => ({ chunkId, attachmentId: `a${chunkId}`, page: 1, text: `t${chunkId}`, score: 0 })

describe("fuse", () => {
  it("ranks a chunk found by both searches above the top of either one", () => {
    const keyword = [hit(1), hit(2)]
    const vector = [hit(3), hit(2)]
    expect(fuse([keyword, vector], 10).map((h) => h.chunkId)).toEqual([2, 1, 3])
  })

  it("keeps a single list's order when the other is empty", () => {
    expect(fuse([[hit(5), hit(6), hit(7)], []], 10).map((h) => h.chunkId)).toEqual([5, 6, 7])
  })

  it("returns lower-is-better scores and honours the limit", () => {
    const out = fuse([[hit(1), hit(2), hit(3)]], 2)
    expect(out).toHaveLength(2)
    expect(out[0].score).toBeLessThan(out[1].score)
    expect(out[0].score).toBeCloseTo(-1 / 61)
  })
})
```

Create `lib/documents/embed/lifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createLifecycle } from "./lifecycle"

const MIN = 60_000

function setup(idleMs = 10 * MIN) {
  let now = 0
  let unloads = 0
  let timers: { at: number; fn: () => void; id: number }[] = []
  let nextId = 1
  const lifecycle = createLifecycle({
    idleMs,
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++
      timers.push({ at: now + ms, fn, id })
      return id
    },
    clearTimer: (id) => {
      timers = timers.filter((t) => t.id !== id)
    },
    unload: () => {
      unloads++
    },
  })
  const advance = (ms: number) => {
    now += ms
    for (const t of timers.filter((t) => t.at <= now)) {
      timers = timers.filter((x) => x !== t)
      t.fn()
    }
  }
  return { lifecycle, advance, unloads: () => unloads }
}

describe("embedder lifecycle", () => {
  it("unloads as soon as indexing finishes when nobody searched recently", () => {
    const t = setup()
    t.lifecycle.indexingStarted()
    t.lifecycle.indexingDrained()
    expect(t.unloads()).toBe(1)
  })

  it("stays loaded after indexing while a recent search may be followed up", () => {
    const t = setup()
    t.lifecycle.searchUsed()
    t.advance(2 * MIN)
    t.lifecycle.indexingStarted()
    t.lifecycle.indexingDrained()
    expect(t.unloads()).toBe(0)
    t.advance(8 * MIN)
    expect(t.unloads()).toBe(1)
  })

  it("unloads ten idle minutes after the last search, each search resetting the clock", () => {
    const t = setup()
    t.lifecycle.searchUsed()
    t.advance(5 * MIN)
    t.lifecycle.searchUsed()
    t.advance(9 * MIN)
    expect(t.unloads()).toBe(0)
    t.advance(1 * MIN)
    expect(t.unloads()).toBe(1)
  })

  it("leaves unloading to the end of indexing when the search timer fires mid-indexing", () => {
    const t = setup()
    t.lifecycle.searchUsed()
    t.lifecycle.indexingStarted()
    t.advance(10 * MIN)
    expect(t.unloads()).toBe(0)
    t.advance(2 * MIN)
    t.lifecycle.indexingDrained()
    expect(t.unloads()).toBe(1)
  })

  it("with a zero idle time, unloads right after each search", () => {
    const t = setup(0)
    t.lifecycle.searchUsed()
    t.advance(0)
    expect(t.unloads()).toBe(1)
  })
})
```

Run: `npx vitest run lib/documents/embed`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

Create `lib/documents/embed/fusion.ts`:

```ts
import type { Hit } from "../index-db"

// Keyword (BM25) and vector scores aren't comparable, so the lists are merged
// by rank instead: each list gives a chunk 1 / (k + rank). A chunk both
// searches found beats the top of either list alone, and exact model-number
// matches still rank high through the keyword list.

export const RRF_K = 60

/** Lists best-first in, best-first out; score = −fused so lower is better, as everywhere else. */
export function fuse(lists: Hit[][], limit: number, k: number = RRF_K): Hit[] {
  const merged = new Map<number, { hit: Hit; score: number }>()
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const add = 1 / (k + rank + 1)
      const seen = merged.get(hit.chunkId)
      if (seen) seen.score += add
      else merged.set(hit.chunkId, { hit, score: add })
    })
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ hit, score }) => ({ ...hit, score: -score }))
}
```

Create `lib/documents/embed/lifecycle.ts`:

```ts
// When the embedding model may be unloaded. Indexing knows when it's done,
// so it unloads at once — unless someone searched recently, in which case a
// follow-up question is likely and the search timer decides. Searches can't
// know whether another is coming, so they keep the model for idleMs.

export type LifecycleDeps = {
  idleMs: number
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  unload(): void
}

export type Lifecycle = {
  indexingStarted(): void
  indexingDrained(): void
  searchUsed(): void
  cancel(): void
}

export function createLifecycle(d: LifecycleDeps): Lifecycle {
  let indexing = false
  let lastSearch: number | null = null
  let timer: unknown = null

  const clear = () => {
    if (timer !== null) d.clearTimer(timer)
    timer = null
  }
  const searchedRecently = () => lastSearch !== null && d.now() - lastSearch < d.idleMs

  return {
    indexingStarted() {
      indexing = true
    },
    indexingDrained() {
      indexing = false
      if (!searchedRecently()) {
        clear()
        d.unload()
      }
    },
    searchUsed() {
      lastSearch = d.now()
      clear()
      timer = d.setTimer(() => {
        timer = null
        if (!indexing) d.unload()
      }, d.idleMs)
    },
    cancel: clear,
  }
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run lib/documents && npx tsc --noEmit && npx eslint lib/documents`
Expected: PASS, clean.

```bash
git add lib/documents/embed lib/documents/index-db.ts lib/documents/tool-helpers.test.ts lib/documents/indexer.test.ts
git commit -m "feat(documents): rank fusion and embedder unload policy"
```

---

### Task 3: Vectors in the search index

**Files:**
- Modify: `lib/documents/index-db.ts`, `lib/documents/index-db.test.ts`, `lib/documents/indexer.test.ts` (fake index gets the new methods as no-ops)

**Interfaces:**
- Consumes: `Hit` with `chunkId` (Task 2)
- Produces — `SearchIndex` gains:
  - `vectorModel(): Promise<string | null>` — the `modelKey` the vectors belong to
  - `useVectorModel(key: string, dims: number): Promise<void>` — same key: no-op; otherwise drop all vectors and recreate `chunk_vec` with `dims`
  - `chunksMissingVectors(limit: number): Promise<{ chunkId: number; text: string }[]>` — `[]` when no model
  - `writeVectors(key: string, rows: { chunkId: number; vector: number[] }[]): Promise<void>` — ignored unless `key` is the current model; rows for chunks that no longer exist are skipped
  - `vectorSearch(vector: number[], filter: SearchFilter): Promise<Hit[]>` — best-first, `score` = cosine distance
  - `vectorStats(): Promise<{ chunks: number; withVectors: number }>`
  - `SearchFilter` gains nothing new (the existing filters apply to vector results too)
  - `VECTOR_CANDIDATES = 200`

- [ ] **Step 1: Failing tests**

Append to `lib/documents/index-db.test.ts`, inside `describe("search index", …)`. These reuse its `beforeEach` (a fresh index per test) and `chunk()` helper:

```ts
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

    it("keeps the model across reopen and forgets it on clear", async () => {
      await index.useVectorModel("m@1", 3)
      index.close()
      index = await openSearchIndex(file)
      expect(await index.vectorModel()).toBe("m@1")
      await index.clear()
      expect(await index.vectorModel()).toBeNull()
    })
  })
```

In `lib/documents/indexer.test.ts`, add to the fake `index` object so it still satisfies `SearchIndex` (Task 6 replaces these with a working fake):

```ts
    vectorModel: async () => null,
    useVectorModel: async () => {},
    chunksMissingVectors: async () => [],
    writeVectors: async () => {},
    vectorSearch: async () => [],
    vectorStats: async () => ({ chunks: 0, withVectors: 0 }),
```

Run: `npx vitest run lib/documents/index-db.test.ts`
Expected: FAIL (methods don't exist).

- [ ] **Step 2: Implement**

In `lib/documents/index-db.ts`:

1. Extend the `SearchIndex` type with the six methods above (JSDoc as in Interfaces).
2. `DROP` becomes `["DROP TABLE IF EXISTS chunk_vec", "DROP TABLE IF EXISTS chunk_fts", "DROP TABLE IF EXISTS chunk", "DROP TABLE IF EXISTS meta"]`.
3. Add `export const VECTOR_CANDIDATES = 200`.
4. Extract the filter clauses so keyword and vector search share them:

```ts
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
```

`search()` becomes:

```ts
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
```

with

```ts
const toHit = (row: Record<string, unknown>): Hit => ({
  chunkId: Number(row.id),
  attachmentId: String(row.attachment_id),
  page: Number(row.page),
  text: String(row.text),
  score: Number(row.score),
})
```

5. In `openSearchIndex`, after `prepare(db)`:

```ts
  // Which model the vectors belong to; null = no vector table yet.
  let vecKey: string | null = await db
    .execute("SELECT value FROM meta WHERE key = 'embedding_model'")
    .then((r) => (r.rows[0]?.value as string | undefined) ?? null)
  const deleteVectorsFor = (idsSql: string) => `DELETE FROM chunk_vec WHERE chunk_id IN (SELECT id FROM chunk WHERE attachment_id ${idsSql})`
```

6. In `replace`, when `vecKey` is set, put `{ sql: deleteVectorsFor("= ?"), args: [attachmentId] }` first in `stmts`. In `remove`, when `vecKey` is set, put `{ sql: deleteVectorsFor(`IN (${marks(part.length)})`), args: part }` first in each batch. In `clear`, set `vecKey = null` after the batch.

7. The new methods:

```ts
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
```

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run lib/documents && npx tsc --noEmit && npx eslint lib/documents`
Expected: PASS, clean.

```bash
git add lib/documents/index-db.ts lib/documents/index-db.test.ts lib/documents/indexer.test.ts
git commit -m "feat(documents): vector table in the search index, tagged by model"
```

---

### Task 4: Model files, verified downloads, download manager, built-in fetch

**Files:**
- Create: `lib/documents/embed/files.ts` (+ test), `lib/documents/embed/download.ts` (+ test), `lib/documents/embed/manager.ts` (+ test), `scripts/fetch-builtin-model.ts`
- Modify: `package.json` (script)

**Interfaces:**
- Consumes: `EmbeddingModel`, `modelSize` (Task 1)
- Produces:
  - `files.ts`: `builtinRoot(env?)`, `downloadsRoot(env?)`, `modelRoot(m, env?)`, `modelDir(m, env?)`, `isInstalled(m, env?): Promise<boolean>`, `deleteModelFiles(m, env?): Promise<void>` (throws for built-in). `env` is `Record<string, string | undefined>`, default `process.env`. Env vars: `BUILTIN_MODELS_DIR`, `MODELS_DIR`.
  - `download.ts`: `class DownloadError`, `type DownloadProgress = { received: number; total: number }`, `downloadModelFiles(m, root, opts?: { baseUrl?: string; fetchImpl?: typeof fetch; onProgress?: (p: DownloadProgress) => void }): Promise<void>`
  - `manager.ts`: `type DownloadJob = { modelId: string; received: number; total: number }`, `type DownloadResult = { modelId: string; error?: string }`, `createDownloadManager(run: (m, onProgress) => Promise<void>, cleanup: (m) => Promise<void>)` → `{ start(m): { error: string } | { ok: true }; status(): { current: DownloadJob | null; last: DownloadResult | null } }`

- [ ] **Step 1: Failing tests**

Create `lib/documents/embed/files.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { deleteModelFiles, isInstalled, modelDir } from "./files"
import { BUILTIN_MODEL_ID, modelById, type EmbeddingModel } from "./models"

const dir = mkdtempSync(path.join(tmpdir(), "hc-models-"))
const env = { BUILTIN_MODELS_DIR: path.join(dir, "builtin"), MODELS_DIR: path.join(dir, "downloads") }
const model: EmbeddingModel = {
  id: "test", label: "Test", purpose: "", repo: "org/test", revision: "r".repeat(40), dims: 3, pooling: "cls",
  queryPrefix: "", passagePrefix: "", license: "MIT",
  files: [{ path: "config.json", size: 2, sha256: "x".repeat(64) }, { path: "onnx/model_quantized.onnx", size: 3, sha256: "y".repeat(64) }],
}
const put = (m: EmbeddingModel, file: string, data: string) => {
  const p = path.join(modelDir(m, env), file)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, data)
}

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("model files", () => {
  it("puts the built-in model and downloads in their own roots", () => {
    expect(modelDir(modelById(BUILTIN_MODEL_ID)!, env)).toBe(path.join(env.BUILTIN_MODELS_DIR, "Xenova", "bge-small-en-v1.5"))
    expect(modelDir(model, env)).toBe(path.join(env.MODELS_DIR, "org", "test"))
  })

  it("is installed only when every file is present at its expected size", async () => {
    expect(await isInstalled(model, env)).toBe(false)
    put(model, "config.json", "{}")
    expect(await isInstalled(model, env)).toBe(false)
    put(model, "onnx/model_quantized.onnx", "abcd")
    expect(await isInstalled(model, env)).toBe(false)
    put(model, "onnx/model_quantized.onnx", "abc")
    expect(await isInstalled(model, env)).toBe(true)
  })

  it("deletes a downloaded model and refuses the built-in one", async () => {
    await deleteModelFiles(model, env)
    expect(await isInstalled(model, env)).toBe(false)
    await expect(deleteModelFiles(modelById(BUILTIN_MODEL_ID)!, env)).rejects.toThrow("built-in")
  })
})
```

Create `lib/documents/embed/download.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createHash } from "crypto"
import { createServer, type Server } from "http"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import type { AddressInfo } from "net"
import { DownloadError, downloadModelFiles, type DownloadProgress } from "./download"
import type { EmbeddingModel } from "./models"

const sha = (s: string) => createHash("sha256").update(s).digest("hex")
const files: Record<string, string> = { "config.json": '{"a":1}', "onnx/model_quantized.onnx": "x".repeat(5000) }
let served: Record<string, string> = files
let server: Server
let baseUrl: string
const roots: string[] = []

const model = (): EmbeddingModel => ({
  id: "t", label: "T", purpose: "", repo: "org/t", revision: "a".repeat(40), dims: 3, pooling: "cls", queryPrefix: "",
  passagePrefix: "", license: "MIT",
  files: Object.entries(files).map(([p, c]) => ({ path: p, size: c.length, sha256: sha(c) })),
})

beforeAll(async () => {
  server = createServer((req, res) => {
    const prefix = `/org/t/resolve/${"a".repeat(40)}/`
    const rel = req.url?.startsWith(prefix) ? req.url.slice(prefix.length) : ""
    if (rel === "drop") return req.socket.destroy()
    if (!(rel in served)) {
      res.statusCode = 404
      return res.end()
    }
    res.end(served[rel])
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

const fresh = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hc-dl-"))
  roots.push(dir)
  return dir
}
const leftovers = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".part")) : []

describe("downloadModelFiles", () => {
  it("downloads every file, reports progress and leaves no partial files", async () => {
    const r = fresh()
    const progress: DownloadProgress[] = []
    await downloadModelFiles(model(), r, { baseUrl, onProgress: (p) => progress.push(p) })
    expect(readFileSync(path.join(r, "org", "t", "onnx", "model_quantized.onnx"), "utf8")).toBe(files["onnx/model_quantized.onnx"])
    expect(progress.at(-1)).toEqual({ received: 5007, total: 5007 })
    expect(leftovers(r)).toEqual([])
  })

  it("rejects bytes that don't match the pinned checksum and removes them", async () => {
    const r = fresh()
    served = { ...files, "onnx/model_quantized.onnx": "y".repeat(5000) }
    await expect(downloadModelFiles(model(), r, { baseUrl })).rejects.toEqual(new DownloadError("Download failed checksum"))
    expect(existsSync(path.join(r, "org", "t", "onnx", "model_quantized.onnx"))).toBe(false)
    expect(leftovers(r)).toEqual([])
    served = files
  })

  it("reports an HTTP error", async () => {
    const r = fresh()
    served = { "config.json": files["config.json"] }
    await expect(downloadModelFiles(model(), r, { baseUrl })).rejects.toEqual(new DownloadError("Download failed (HTTP 404)"))
    served = files
  })

  it("reports a dropped connection as a plain failure", async () => {
    const r = fresh()
    const m = model()
    m.files = [{ path: "drop", size: 1, sha256: sha("z") }]
    await expect(downloadModelFiles(m, r, { baseUrl })).rejects.toEqual(new DownloadError("Download failed"))
    expect(leftovers(r)).toEqual([])
  })
})

afterAll(() => {
  // Only the folders this file created; best-effort, as in the other tests.
  for (const dir of roots) rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
})
```

Create `lib/documents/embed/manager.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { createDownloadManager } from "./manager"
import { DownloadError } from "./download"
import { EMBEDDING_MODELS } from "./models"

const [a, b] = EMBEDDING_MODELS.filter((m) => !m.builtIn)

describe("download manager", () => {
  it("runs one download at a time and tracks progress", async () => {
    let finish!: () => void
    const run = vi.fn((_m, onProgress: (p: { received: number; total: number }) => void) => {
      onProgress({ received: 10, total: 100 })
      return new Promise<void>((r) => (finish = r))
    })
    const mgr = createDownloadManager(run, async () => {})
    expect(mgr.start(a)).toEqual({ ok: true })
    expect(mgr.start(b)).toEqual({ error: "Another model is downloading." })
    expect(mgr.status().current).toMatchObject({ modelId: a.id, received: 10 })
    finish()
    await vi.waitFor(() => expect(mgr.status().current).toBeNull())
    expect(mgr.status().last).toEqual({ modelId: a.id })
  })

  it("cleans up and reports a failed download", async () => {
    const cleanup = vi.fn(async () => {})
    const mgr = createDownloadManager(async () => {
      throw new DownloadError("Download failed checksum")
    }, cleanup)
    mgr.start(a)
    await vi.waitFor(() => expect(mgr.status().last).toEqual({ modelId: a.id, error: "Download failed checksum" }))
    expect(cleanup).toHaveBeenCalledWith(a)
    expect(mgr.start(a)).toEqual({ ok: true })
  })
})
```

Run: `npx vitest run lib/documents/embed`
Expected: FAIL (modules not found).

- [ ] **Step 2: Implement**

Create `lib/documents/embed/files.ts`:

```ts
import path from "path"
import { rm, stat } from "fs/promises"
import type { EmbeddingModel } from "./models"

// Where model files live. The built-in model ships with the app (image:
// /app/models/builtin); downloads go to MODELS_DIR (Docker: /data/models).
// Each model sits under its repo path, the layout transformers.js expects
// when given the root as localModelPath.

type Env = Record<string, string | undefined>

export function builtinRoot(env: Env = process.env): string {
  return path.resolve(env.BUILTIN_MODELS_DIR ?? path.join(process.cwd(), "models", "builtin"))
}

export function downloadsRoot(env: Env = process.env): string {
  return path.resolve(env.MODELS_DIR ?? path.join(process.cwd(), "models", "downloads"))
}

export function modelRoot(m: EmbeddingModel, env: Env = process.env): string {
  return m.builtIn ? builtinRoot(env) : downloadsRoot(env)
}

export function modelDir(m: EmbeddingModel, env: Env = process.env): string {
  return path.join(modelRoot(m, env), ...m.repo.split("/"))
}

/** Every file present at its pinned size. Hashes are checked once, at download. */
export async function isInstalled(m: EmbeddingModel, env: Env = process.env): Promise<boolean> {
  const dir = modelDir(m, env)
  for (const f of m.files) {
    const s = await stat(path.join(dir, ...f.path.split("/"))).catch(() => null)
    if (!s || s.size !== f.size) return false
  }
  return true
}

export async function deleteModelFiles(m: EmbeddingModel, env: Env = process.env): Promise<void> {
  if (m.builtIn) throw new Error("The built-in model can't be deleted")
  const root = downloadsRoot(env)
  const dir = modelDir(m, env)
  if (!dir.startsWith(root + path.sep)) throw new Error("Refusing a path outside the models folder")
  await rm(dir, { recursive: true, force: true })
}
```

Create `lib/documents/embed/download.ts`:

```ts
import { createHash } from "crypto"
import { createWriteStream } from "fs"
import { mkdir, rename, rm } from "fs/promises"
import path from "path"
import { Readable } from "stream"
import { pipeline } from "stream/promises"
import type { ReadableStream as WebReadableStream } from "stream/web"
import { modelSize, type EmbeddingModel } from "./models"

// Downloads one vetted model: each file streams to "<name>.part" while being
// hashed, and only a file whose size and sha256 match the registry is
// renamed into place. Errors carry fixed phrases for the Settings page.

export class DownloadError extends Error {
  override name = "DownloadError"
}

export type DownloadProgress = { received: number; total: number }

const HF = "https://huggingface.co"

export async function downloadModelFiles(
  m: EmbeddingModel,
  root: string,
  opts: { baseUrl?: string; fetchImpl?: typeof fetch; onProgress?: (p: DownloadProgress) => void } = {}
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const total = modelSize(m)
  let received = 0
  const dir = path.join(root, ...m.repo.split("/"))

  for (const file of m.files) {
    const dest = path.join(dir, ...file.path.split("/"))
    const part = `${dest}.part`
    await mkdir(path.dirname(dest), { recursive: true })
    try {
      const res = await fetchImpl(`${opts.baseUrl ?? HF}/${m.repo}/resolve/${m.revision}/${file.path}`)
      if (!res.ok || !res.body) throw new DownloadError(`Download failed (HTTP ${res.status})`)
      const hash = createHash("sha256")
      let size = 0
      const body = Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>)
      body.on("data", (chunk: Buffer) => {
        hash.update(chunk)
        size += chunk.length
        received += chunk.length
        opts.onProgress?.({ received, total })
      })
      await pipeline(body, createWriteStream(part))
      if (size !== file.size || hash.digest("hex") !== file.sha256) throw new DownloadError("Download failed checksum")
      await rename(part, dest)
    } catch (error) {
      await rm(part, { force: true })
      if (error instanceof DownloadError) throw error
      throw new DownloadError("Download failed")
    }
  }
}
```

Create `lib/documents/embed/manager.ts`:

```ts
import { DownloadError, type DownloadProgress } from "./download"
import { modelSize, type EmbeddingModel } from "./models"

// One model downloads at a time; Settings polls status() for progress and the
// outcome of the last download. Kept in memory: a restart mid-download just
// leaves an incomplete model, which isInstalled() reports as not installed.

export type DownloadJob = { modelId: string; received: number; total: number }
export type DownloadResult = { modelId: string; error?: string }

export function createDownloadManager(
  run: (m: EmbeddingModel, onProgress: (p: DownloadProgress) => void) => Promise<void>,
  cleanup: (m: EmbeddingModel) => Promise<void>
) {
  let current: DownloadJob | null = null
  let last: DownloadResult | null = null

  return {
    start(m: EmbeddingModel): { error: string } | { ok: true } {
      if (current) return { error: "Another model is downloading." }
      const job: DownloadJob = { modelId: m.id, received: 0, total: modelSize(m) }
      current = job
      void run(m, (p) => {
        job.received = p.received
      }).then(
        () => {
          last = { modelId: m.id }
          current = null
        },
        async (error) => {
          await cleanup(m).catch(() => {})
          last = { modelId: m.id, error: error instanceof DownloadError ? error.message : "Download failed" }
          current = null
        }
      )
      return { ok: true }
    },
    status(): { current: DownloadJob | null; last: DownloadResult | null } {
      return { current: current && { ...current }, last }
    },
  }
}
```

Create `scripts/fetch-builtin-model.ts`:

```ts
import { BUILTIN_MODEL_ID, modelById } from "../lib/documents/embed/models"
import { builtinRoot, isInstalled } from "../lib/documents/embed/files"
import { downloadModelFiles } from "../lib/documents/embed/download"

// Puts the built-in embedding model in models/builtin/. Run by the Docker
// build (network needed at build time only) and once in local development.

async function main() {
  const m = modelById(BUILTIN_MODEL_ID)!
  if (await isInstalled(m)) {
    console.log(`${m.id} is already in ${builtinRoot()}`)
    return
  }
  let shown = -1
  await downloadModelFiles(m, builtinRoot(), {
    onProgress: ({ received, total }) => {
      const pct = Math.floor((received / total) * 10) * 10
      if (pct !== shown) console.log(`${m.id}: ${(shown = pct)}%`)
    },
  })
  console.log(`${m.id} downloaded to ${builtinRoot()}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
```

Add to `package.json` scripts: `"models:fetch-builtin": "tsx scripts/fetch-builtin-model.ts"`.

- [ ] **Step 3: Verify, fetch the built-in model locally, commit**

Run: `npx vitest run lib/documents/embed && npx tsc --noEmit && npx eslint lib/documents scripts`
Expected: PASS, clean.

Run: `npm run models:fetch-builtin`
Expected: progress lines, then "downloaded to …\models\builtin". Run it again and expect "already in …".

```bash
git add lib/documents/embed scripts/fetch-builtin-model.ts package.json
git commit -m "feat(documents): verified model downloads and the built-in model fetch"
```

---

### Task 5: Embedding worker and embedder

**Files:**
- Create: `workers/embed-worker.mjs`, `lib/documents/embed/embedder.ts`, `lib/documents/embed/embedder.test.ts`, `lib/documents/embed/server.ts`

**Interfaces:**
- Consumes: `createLifecycle` (Task 2), `EmbeddingModel`/`modelById`/`modelKey` (Task 1), `files.ts`/`download.ts`/`manager.ts` (Task 4), `loadDocumentSettings` (Task 1)
- Produces:
  - `embedder.ts`: `class EmbedderError`, `type Embedder = { model: EmbeddingModel; embedPassages(texts: string[]): Promise<number[][]>; embedQuery(text: string): Promise<number[]>; indexingDrained(): void; unload(): Promise<void>; loaded(): boolean }`, `createEmbedder(o: { model: EmbeddingModel; modelsRoot: string; workerPath: string; idleMs: number; timers?: { now(): number; setTimer(fn: () => void, ms: number): unknown; clearTimer(h: unknown): void } }): Embedder`
  - `server.ts`: `workerPath()`, `embeddingIdleMs()`, `embedderFor(m): Embedder`, `unloadEmbedder(): Promise<void>`, `activeModel(): Promise<EmbeddingModel | null>`, `downloads()` (the manager), `loadModelStatus(): Promise<ModelStatus>`, `type ModelRow`, `type ModelStatus`

- [ ] **Step 1: Worker**

Create `workers/embed-worker.mjs` (plain ESM, copied into the image as-is; the Next build doesn't bundle it):

```js
// Embedding worker. Runs one model; the main thread terminates the worker to
// unload it, which returns its memory to the OS (dispose() in the main thread
// did not). Never fetches anything: models come from local folders only.
import { parentPort, workerData } from "node:worker_threads"
import { env, pipeline } from "@huggingface/transformers"

env.allowRemoteModels = false
env.localModelPath = workerData.modelsRoot

const errorName = (e) => (e && typeof e === "object" && "name" in e ? String(e.name) : "Error")

let extractor
try {
  extractor = await pipeline("feature-extraction", workerData.repo, { dtype: "q8" })
} catch (e) {
  parentPort.postMessage({ type: "error", name: errorName(e) })
  process.exit(1)
}
parentPort.postMessage({ type: "ready" })

parentPort.on("message", async ({ id, texts }) => {
  try {
    const out = await extractor(texts, { pooling: workerData.pooling, normalize: true })
    parentPort.postMessage({ type: "result", id, vectors: out.tolist() })
  } catch (e) {
    parentPort.postMessage({ type: "result", id, error: errorName(e) })
  }
})
```

- [ ] **Step 2: Failing tests**

Create `lib/documents/embed/embedder.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { createEmbedder, EmbedderError } from "./embedder"
import { builtinRoot, isInstalled } from "./files"
import { BUILTIN_MODEL_ID, modelById } from "./models"

const workerPath = path.join(process.cwd(), "workers", "embed-worker.mjs")
const builtin = modelById(BUILTIN_MODEL_ID)!
const haveBuiltin = await isInstalled(builtin)
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)

describe("embedder", () => {
  it("fails cleanly when the model files are missing", async () => {
    const e = createEmbedder({ model: builtin, modelsRoot: mkdtempSync(path.join(tmpdir(), "hc-nomodel-")), workerPath, idleMs: 0 })
    await expect(e.embedQuery("anything")).rejects.toBeInstanceOf(EmbedderError)
    expect(e.loaded()).toBe(false)
  }, 60_000)

  describe.skipIf(!haveBuiltin)("with the built-in model (run npm run models:fetch-builtin)", () => {
    const e = createEmbedder({ model: builtin, modelsRoot: builtinRoot(), workerPath, idleMs: 60_000 })
    afterAll(() => e.unload())

    it("embeds passages to unit vectors of the model's size", async () => {
      const [v1, v2] = await e.embedPassages(["Replace the furnace filter every 90 days.", "The deductible is $500 per claim."])
      expect(v1).toHaveLength(384)
      expect(dot(v1, v1)).toBeCloseTo(1, 3)
      expect(dot(v1, v2)).toBeLessThan(0.95)
    }, 60_000)

    it("finds the passage that means the same as the question", async () => {
      const q = await e.embedQuery("how often do I swap the furnace filter?")
      const [filter, deductible] = await e.embedPassages(["Replace the furnace filter every 90 days.", "The deductible is $500 per claim."])
      expect(dot(q, filter)).toBeGreaterThan(dot(q, deductible))
    }, 60_000)

    it("unloads on request and loads again when needed", async () => {
      await e.embedQuery("warm up")
      expect(e.loaded()).toBe(true)
      await e.unload()
      await new Promise((r) => setTimeout(r, 200))
      expect(e.loaded()).toBe(false)
      expect(await e.embedQuery("again")).toHaveLength(384)
    }, 60_000)
  })
})
```

Run: `npx vitest run lib/documents/embed/embedder.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the embedder**

Create `lib/documents/embed/embedder.ts`:

```ts
import { Worker } from "worker_threads"
import { createLifecycle } from "./lifecycle"
import type { EmbeddingModel } from "./models"

// Main-thread side of the embedding worker. Starts the worker on first use,
// sends batches, and terminates it when the lifecycle says so — but never
// while a request is in flight. Prefixes are applied here; pooling and
// normalisation happen in the worker.

export class EmbedderError extends Error {
  override name = "EmbedderError"
}

export type Embedder = {
  model: EmbeddingModel
  embedPassages(texts: string[]): Promise<number[][]>
  embedQuery(text: string): Promise<number[]>
  indexingDrained(): void
  unload(): Promise<void>
  loaded(): boolean
}

type Timers = { now(): number; setTimer(fn: () => void, ms: number): unknown; clearTimer(h: unknown): void }

const realTimers: Timers = {
  now: () => Date.now(),
  setTimer: (fn, ms) => {
    const t = setTimeout(fn, ms)
    t.unref?.()
    return t
  },
  clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
}

type Pending = { resolve(v: number[][]): void; reject(e: Error): void }
type WorkerMessage =
  | { type: "ready" }
  | { type: "error"; name: string }
  | { type: "result"; id: number; vectors?: number[][]; error?: string }

export function createEmbedder(o: { model: EmbeddingModel; modelsRoot: string; workerPath: string; idleMs: number; timers?: Timers }): Embedder {
  let worker: Worker | null = null
  let ready: Promise<void> | null = null
  const pending = new Map<number, Pending>()
  let nextId = 0
  let inFlight = 0
  let unloadWanted = false

  const lifecycle = createLifecycle({
    idleMs: o.idleMs,
    ...(o.timers ?? realTimers),
    unload: () => {
      unloadWanted = true
      maybeTerminate()
    },
  })

  function reset(error: Error) {
    worker = null
    ready = null
    for (const p of pending.values()) p.reject(error)
    pending.clear()
  }

  function maybeTerminate() {
    if (!unloadWanted || inFlight > 0 || !worker) return
    const w = worker
    worker = null
    ready = null
    unloadWanted = false
    void w.terminate()
  }

  function start(): Promise<void> {
    if (ready) return ready
    const w = new Worker(o.workerPath, {
      workerData: { modelsRoot: o.modelsRoot, repo: o.model.repo, pooling: o.model.pooling },
    })
    worker = w
    ready = new Promise<void>((resolve, reject) => {
      w.on("message", (msg: WorkerMessage) => {
        if (msg.type === "ready") resolve()
        else if (msg.type === "error") reject(new EmbedderError(`Model failed to load (${msg.name})`))
        else {
          const p = pending.get(msg.id)
          if (!p) return
          pending.delete(msg.id)
          if (msg.error || !msg.vectors) p.reject(new EmbedderError(`Embedding failed (${msg.error ?? "no output"})`))
          else p.resolve(msg.vectors)
        }
      })
      w.on("error", (e) => {
        const error = new EmbedderError(`Model worker crashed (${e.name})`)
        reject(error)
        if (worker === w) reset(error)
      })
      w.on("exit", () => {
        const error = new EmbedderError("Model worker stopped")
        reject(error)
        if (worker === w) reset(error)
      })
    })
    ready.catch(() => {})
    return ready
  }

  async function run(texts: string[]): Promise<number[][]> {
    inFlight++
    unloadWanted = false
    try {
      await start()
      const w = worker
      if (!w) throw new EmbedderError("Model worker stopped")
      const id = nextId++
      return await new Promise<number[][]>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        w.postMessage({ id, texts })
      })
    } finally {
      inFlight--
      maybeTerminate()
    }
  }

  return {
    model: o.model,
    async embedPassages(texts) {
      lifecycle.indexingStarted()
      return run(texts.map((t) => o.model.passagePrefix + t))
    },
    async embedQuery(text) {
      try {
        return (await run([o.model.queryPrefix + text]))[0]
      } finally {
        lifecycle.searchUsed()
      }
    },
    indexingDrained: () => lifecycle.indexingDrained(),
    async unload() {
      lifecycle.cancel()
      unloadWanted = true
      maybeTerminate()
    },
    loaded: () => worker !== null,
  }
}
```

- [ ] **Step 4: Server-side singletons and model status**

Create `lib/documents/embed/server.ts`:

```ts
import path from "path"
import { loadDocumentSettings } from "../settings"
import { createEmbedder, type Embedder } from "./embedder"
import { deleteModelFiles, downloadsRoot, isInstalled, modelRoot } from "./files"
import { downloadModelFiles } from "./download"
import { createDownloadManager } from "./manager"
import { EMBEDDING_MODELS, modelById, modelSize, type EmbeddingModel } from "./models"

// One embedder (for the active model) and one download manager per process,
// on globalThis for the same reason as the indexer: route handlers, actions
// and instrumentation can load separate copies of this module.

type State = { embedder?: Embedder; downloads?: ReturnType<typeof createDownloadManager> }
const g = globalThis as unknown as { __hcEmbeddings?: State }
const state: State = (g.__hcEmbeddings ??= {})

export function workerPath(): string {
  return path.join(process.cwd(), "workers", "embed-worker.mjs")
}

const DEFAULT_IDLE_MINUTES = 10

export function embeddingIdleMs(): number {
  const raw = process.env.EMBEDDING_IDLE_MINUTES
  if (raw === undefined) return DEFAULT_IDLE_MINUTES * 60_000
  const minutes = Number(raw)
  if (!Number.isFinite(minutes) || minutes < 0) {
    console.warn(`[documents] ignoring invalid EMBEDDING_IDLE_MINUTES=${raw}`)
    return DEFAULT_IDLE_MINUTES * 60_000
  }
  return minutes * 60_000
}

export function embedderFor(m: EmbeddingModel): Embedder {
  if (state.embedder?.model.id !== m.id) {
    void state.embedder?.unload()
    state.embedder = createEmbedder({ model: m, modelsRoot: modelRoot(m), workerPath: workerPath(), idleMs: embeddingIdleMs() })
  }
  return state.embedder
}

export async function unloadEmbedder(): Promise<void> {
  await state.embedder?.unload()
}

/** The model to embed with right now, or null: semantic off, indexing off, unknown model or files missing. */
export async function activeModel(): Promise<EmbeddingModel | null> {
  const s = await loadDocumentSettings()
  if (!s.indexingEnabled || !s.semanticEnabled) return null
  const m = modelById(s.embeddingModel)
  return m && (await isInstalled(m)) ? m : null
}

export function downloads() {
  state.downloads ??= createDownloadManager(
    (m, onProgress) => downloadModelFiles(m, downloadsRoot(), { onProgress }),
    (m) => deleteModelFiles(m)
  )
  return state.downloads
}

export type ModelRow = {
  id: string
  label: string
  purpose: string
  sizeMb: number
  license: string
  builtIn: boolean
  installed: boolean
  active: boolean
}

export type ModelStatus = {
  models: ModelRow[]
  download: { modelId: string; received: number; total: number } | null
  lastDownload: { modelId: string; error?: string } | null
}

export async function loadModelStatus(): Promise<ModelStatus> {
  const s = await loadDocumentSettings()
  const { current, last } = downloads().status()
  const models = await Promise.all(
    EMBEDDING_MODELS.map(async (m) => ({
      id: m.id,
      label: m.label,
      purpose: m.purpose,
      sizeMb: Math.round(modelSize(m) / 1e6),
      license: m.license,
      builtIn: Boolean(m.builtIn),
      installed: current?.modelId === m.id ? false : await isInstalled(m),
      active: s.embeddingModel === m.id,
    }))
  )
  return { models, download: current, lastDownload: last }
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run lib/documents/embed && npx tsc --noEmit && npx eslint lib/documents`
Expected: PASS. The built-in suite runs here, because Task 4 fetched the model.

```bash
git add workers/embed-worker.mjs lib/documents/embed
git commit -m "feat(documents): embedding worker and on-demand embedder"
```

---

### Task 6: Embed chunks after indexing; status line

**Files:**
- Modify: `lib/documents/indexer.ts`, `lib/documents/indexer.test.ts`, `lib/documents/indexer-server.ts`, `lib/documents/stats.ts`, `lib/documents/stats.test.ts`

**Interfaces:**
- Consumes: `SearchIndex` vector methods (Task 3), `embedderFor`, `activeModel` (Task 5), `modelKey` (Task 1)
- Produces:
  - `indexer.ts`: `EMBED_BATCH = 16`; `type SemanticSession = { key: string; embed(texts: string[]): Promise<number[][]>; end(): void }`; `IndexerDeps.semantic?: { begin(): Promise<SemanticSession | null> }`
  - `indexer-server.ts`: `semanticSearchModel(): Promise<EmbeddingModel | null>` (active model whose vectors are in the index); `documentIndexStats()` includes vector progress
  - `stats.ts`: `formatIndexStats(c, indexingEnabled, vectors?: { withVectors: number; chunks: number } | null)`

- [ ] **Step 1: Failing tests**

In `lib/documents/indexer.test.ts`:

1. Replace the fake index's vector no-ops from Task 3 with a working fake. Keep chunk ids, track vectors, and keep `chunks` (Map attachmentId → Chunk[]) as today:

```ts
  let nextChunkId = 1
  const chunkIds = new Map<string, number[]>()
  const vectors = new Map<number, string>()
  const textOf = new Map<number, string>()
  const replaceChunks = (id: string, c: Chunk[]) => {
    for (const old of chunkIds.get(id) ?? []) {
      vectors.delete(old)
      textOf.delete(old)
    }
    const ids = c.map((x) => {
      const n = nextChunkId++
      textOf.set(n, x.text)
      return n
    })
    chunkIds.set(id, ids)
    chunks.set(id, c)
  }
```

   The fake's `replace` calls `replaceChunks(id, c)` (after the `replaceFails` check). Its `remove` deletes each id's chunk ids from `vectors`/`textOf`, then from `chunkIds` and `chunks`. Its `clear` also clears the three new maps. The vector methods:

```ts
    vectorModel: async () => "m@1",
    useVectorModel: async () => {},
    chunksMissingVectors: async (limit: number) =>
      [...textOf].filter(([n]) => !vectors.has(n)).slice(0, limit).map(([chunkId, text]) => ({ chunkId, text })),
    writeVectors: async (key: string, rows: { chunkId: number; vector: number[] }[]) => {
      for (const r of rows) if (textOf.has(r.chunkId)) vectors.set(r.chunkId, key)
    },
    vectorSearch: async () => [],
    vectorStats: async () => ({ chunks: textOf.size, withVectors: vectors.size }),
```

2. Add `semantic?: boolean` to `setup()`'s `opts` type. Then, after the existing `log` constant, replace the `createIndexer(…)` line with the block below, and add `vectors, embed, ended, semantic, embedCalls` to the object `setup` returns:

```ts
  const embedCalls: string[][] = []
  const embed = vi.fn(async (texts: string[]) => {
    embedCalls.push(texts)
    return texts.map(() => [1, 0, 0])
  })
  const ended = vi.fn()
  const semantic = opts.semantic
    ? { begin: vi.fn(async () => ({ key: "m@1", embed, end: ended })) }
    : undefined
  const indexer = createIndexer({ store, index: async () => index, extract, idle: idleHook, log, semantic })
```

3. New tests:

```ts
  it("embeds a new file's chunks after it's indexed, then lets the model go", async () => {
    const t = setup({ semantic: true, outcomes: { a: { kind: "text", method: "TEXT", pages: ["one", "two"] } } })
    t.add("a")
    t.indexer.enqueue("a")
    await t.indexer.idle()
    expect(t.vectors.size).toBe(2)
    expect(t.embedCalls.flat().sort()).toEqual(["one", "two"])
    expect(t.ended).toHaveBeenCalledTimes(1)
  })

  it("embeds nothing when semantic search isn't available", async () => {
    const t = setup({ semantic: true })
    t.semantic!.begin.mockResolvedValueOnce(null)
    t.add("a")
    t.indexer.enqueue("a")
    await t.indexer.idle()
    expect(t.embed).not.toHaveBeenCalled()
  })

  it("survives an embedding failure and finishes the job on the next reconcile", async () => {
    const t = setup({ semantic: true })
    t.add("a")
    t.embed.mockRejectedValueOnce(new Error("worker crashed"))
    t.indexer.enqueue("a")
    await t.indexer.idle()
    expect(t.vectors.size).toBe(0)
    expect(t.log.error).toHaveBeenCalled()
    expect(t.ended).toHaveBeenCalled()
    await t.indexer.reconcile()
    await t.indexer.idle()
    expect(t.vectors.size).toBe(1)
  })

  it("embeds in batches of 16", async () => {
    const pages = Array.from({ length: 20 }, (_, i) => `page ${i}`)
    const t = setup({ semantic: true, outcomes: { a: { kind: "text", method: "TEXT", pages } } })
    t.add("a")
    t.indexer.enqueue("a")
    await t.indexer.idle()
    expect(t.embedCalls.map((c) => c.length)).toEqual([16, 4])
  })
```

In `lib/documents/stats.test.ts`, add:

```ts
  it("shows meaning-vector progress while embedding, and readiness when done", () => {
    expect(formatIndexStats({ DONE: 3 }, true, { withVectors: 40, chunks: 100 })).toBe("3 searchable · 40 of 100 chunks have meaning vectors")
    expect(formatIndexStats({ DONE: 3 }, true, { withVectors: 100, chunks: 100 })).toBe("3 searchable · meaning search ready")
    expect(formatIndexStats({ DONE: 3 }, true, null)).toBe("3 searchable")
  })
```

Run: `npx vitest run lib/documents/indexer.test.ts lib/documents/stats.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 2: Implement**

In `lib/documents/stats.ts`, add a third parameter `vectors?: { withVectors: number; chunks: number } | null` and, before `return parts.join(" · ")`:

```ts
  if (vectors && vectors.chunks > 0) {
    parts.push(vectors.withVectors >= vectors.chunks ? "meaning search ready" : `${vectors.withVectors} of ${vectors.chunks} chunks have meaning vectors`)
  }
```

In `lib/documents/indexer.ts`:

1. Add near the top:

```ts
export const EMBED_BATCH = 16

/** An open embedding session for the active model; end() lets the model unload. */
export type SemanticSession = { key: string; embed(texts: string[]): Promise<number[][]>; end(): void }
```

and add to `IndexerDeps`:

```ts
  /** Present when the semantic layer is wired up; begin() returns null when it can't run right now. */
  semantic?: { begin(): Promise<SemanticSession | null> }
```

2. Add inside `createIndexer`, before `drain`:

```ts
  // Chunks without a vector for the active model get one. Runs after the file
  // queue drains, so extraction (and keyword search) never waits for it. New
  // files arriving meanwhile pause it; drain() starts it again afterwards.
  async function embedBacklog() {
    if (!deps.semantic) return
    let session: SemanticSession | null = null
    try {
      session = await deps.semantic.begin()
      if (!session) return
      const index = await deps.index()
      while (!queue.size) {
        const { indexingEnabled } = await deps.store.settings()
        if (!indexingEnabled) break
        const batch = await index.chunksMissingVectors(EMBED_BATCH)
        if (!batch.length) break
        const vectors = await session.embed(batch.map((b) => b.text))
        await index.writeVectors(session.key, batch.map((b, i) => ({ chunkId: b.chunkId, vector: vectors[i] })))
        await new Promise((resolve) => setImmediate(resolve))
      }
    } catch (error) {
      // Left for the next reconcile; keyword search is unaffected.
      log.error("[documents] embedding failed:", nameOf(error))
    } finally {
      session?.end()
    }
  }
```

3. In `drain()`'s body, after the `while (queue.size) { … }` loop and before `finally`, add `await embedBacklog()`. The `finally` still runs the idle hook, and `current.finally` still restarts `drain()` if files arrived.

In `lib/documents/indexer-server.ts`:

1. Imports: `import { activeModel, embedderFor } from "./embed/server"`, `import { modelKey, type EmbeddingModel } from "./embed/models"`.
2. Pass `semantic` to `createIndexer`:

```ts
    semantic: {
      async begin() {
        const m = await activeModel()
        if (!m) return null
        const key = modelKey(m)
        await (await searchIndex()).useVectorModel(key, m.dims)
        const embedder = embedderFor(m)
        return { key, embed: (texts) => embedder.embedPassages(texts), end: () => embedder.indexingDrained() }
      },
    },
```

3. Add:

```ts
/** The active model, if the index's vectors were made with it — otherwise search stays keyword-only. */
export async function semanticSearchModel(): Promise<EmbeddingModel | null> {
  const m = await activeModel()
  if (!m) return null
  return (await (await searchIndex()).vectorModel()) === modelKey(m) ? m : null
}
```

4. In `documentIndexStats()`, compute vectors when `settings.semanticEnabled` and `await semanticSearchModel()` is non-null, and pass `await (await searchIndex()).vectorStats()` as the third argument to `formatIndexStats` (otherwise `null`).

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run lib/documents && npx tsc --noEmit && npx eslint lib/documents`
Expected: PASS, clean.

Real-data check (dev DB, built-in model from Task 4). Create `./.embed-check.ts`, run it with `npx tsx`, then delete it:

```ts
import "dotenv/config"
import { documentIndexer, documentIndexStats, searchIndex } from "@/lib/documents/indexer-server"

async function main() {
  await documentIndexer().reconcile()
  await documentIndexer().idle()
  console.log(await documentIndexStats())
  console.log(await (await searchIndex()).vectorStats())
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
```

Expected: a stats line ending "meaning search ready" and `withVectors === chunks`. Stop any orphaned `node` processes this left behind (see the Task 7 note) before continuing.

```bash
git add lib/documents/indexer.ts lib/documents/indexer.test.ts lib/documents/indexer-server.ts lib/documents/stats.ts lib/documents/stats.test.ts
git commit -m "feat(documents): embed chunks after indexing; meaning-vector progress"
```

---

### Task 7: Hybrid search in `search_documents`

**Files:**
- Modify: `lib/llm/tools/documents.ts`, `lib/documents/tool-helpers.ts`, `lib/documents/tool-helpers.test.ts`

**Interfaces:**
- Consumes: `fuse` (Task 2), `vectorSearch` (Task 3), `embedderFor` (Task 5), `semanticSearchModel` (Task 6)
- Produces: `search_documents` returns the same shape as before. Ranking is hybrid when available, and the query may contain no keywords when semantic search is available.

- [ ] **Step 1: Failing test**

In `lib/documents/tool-helpers.test.ts`, inside the "record type rules" describe:

```ts
  it("tells the model the search understands meaning", () => {
    expect(searchDocumentsDescription(false)).toMatch(/meaning/i)
  })
```

Run: `npx vitest run lib/documents/tool-helpers.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement**

In `searchDocumentsDescription`, change the sentence "Key words or a model number work better than a whole question." to "Understands meaning as well as exact words: a plain question works, and model or part numbers match exactly."

In `lib/llm/tools/documents.ts`:

1. Imports: `import { fuse } from "@/lib/documents/embed/fusion"`, `import { embedderFor } from "@/lib/documents/embed/server"`, `import { semanticSearchModel } from "@/lib/documents/indexer-server"` (merge with the existing `searchIndex` import), `import type { Hit } from "@/lib/documents/index-db"`.
2. In the `query` argument's describe text, use: `"What to look for: a plain question, key words, a model or part number, or a \"quoted phrase\"."`
3. Replace the body of `run` from `const parsed = parseSearch(a.query)` through the `groupHits` call with:

```ts
      const parsed = parseSearch(a.query)
      const model = await semanticSearchModel()
      if (!parsed && !model) throw new ToolInputError("Give some words to search for, e.g. 'filter size' or a model number.")
      const recordTypes = a.recordType ? [toRecordType(a.recordType, includeHealth)] : null
      const resolved = await assetScope(a, ctx)
      if ("reply" in resolved) return resolved.reply
      const { attachmentIds, scope } = resolved

      const index = await searchIndex()
      const filter = {
        attachmentIds,
        recordTypes,
        excludeRecordTypes: hidden,
        // A person's visits, reminders and warranties aren't a health record type,
        // so the index can only exclude them by id.
        excludeAttachmentIds: includeHealth ? [] : await healthAttachmentIds(),
        limit: SEARCH_POOL,
      }
      const keyword = parsed ? await index.search(parsed.match, filter) : []
      let semantic: Hit[] = []
      if (model) {
        try {
          // Waits for the model to load if it was unloaded.
          semantic = await index.vectorSearch(await embedderFor(model).embedQuery(a.query), filter)
        } catch (error) {
          // The semantic layer never fails a search: fall back to keywords.
          console.error("[documents] semantic search failed:", error instanceof Error ? error.name : typeof error)
        }
      }
      const hits = semantic.length ? fuse([keyword, semantic], SEARCH_POOL) : keyword
      const groups = groupHits(hits, a.limit ?? DEFAULT_LIMIT)
```

4. In the passage mapping, use `passage(h.text, parsed?.terms ?? [])`.

- [ ] **Step 3: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx eslint lib/llm lib/documents`
Expected: PASS, clean.

Real-data check (dev DB; vectors exist after Task 6). Create `./.hybrid-check.ts`:

```ts
import "dotenv/config"
import { documentTools } from "@/lib/llm/tools/documents"
import { unloadEmbedder } from "@/lib/documents/embed/server"

const ctx = { userId: "x", now: new Date() }
async function main() {
  const [, searchOff] = documentTools(false)
  const [, searchOn] = documentTools(true)
  const show = async (label: string, tool: typeof searchOff, query: string) => {
    const r = JSON.parse(await tool.execute({ query }, ctx))
    console.log(label, "|", query, "→", r.error ?? r.documents.map((d: { fileName: string }) => d.fileName).join(", "))
  }
  await show("health off", searchOff, "how often should the heating system be looked at?")
  await show("health off", searchOff, "anything about mould?")
  await show("health off", searchOff, "what is the the of")
  await show("health off", searchOff, "bank account statement")
  await show("health on ", searchOn, "bank account statement")
  await unloadEmbedder()
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
```

Run it with `timeout 180 npx tsx ./.hybrid-check.ts`, then delete it. Expected:
- the paraphrased heating question lists `furnace-service-invoice.pdf`, which shares no keyword with it;
- "anything about mould?" returns results rather than an error;
- "what is the the of" returns vector-only results;
- the bank statement appears **only** with health on.

Then rename `models/builtin` to `models/builtin-off`, rerun the first query, and expect keyword-only results with no error (Review Focus #3). Rename it back.

After any `timeout`-killed run, list `node` processes (`Get-CimInstance Win32_Process -Filter "Name='node.exe'"`) and stop only ones this session started. Orphans hold `prisma/dev.db` and cause `SocketTimeout`/`P2028` errors.

- [ ] **Step 4: Commit**

```bash
git add lib/llm/tools/documents.ts lib/documents/tool-helpers.ts lib/documents/tool-helpers.test.ts
git commit -m "feat(llm): hybrid keyword + meaning search in search_documents"
```

---

### Task 8: Settings — semantic switch and model table

**Files:**
- Modify: `lib/actions/document-settings.ts`, `components/settings/document-settings.tsx`, `app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `loadModelStatus`, `downloads`, `unloadEmbedder`, `ModelStatus` (Task 5); `deleteModelFiles`, `isInstalled` (Task 4); `modelById` (Task 1)
- Produces (server actions, admin-only):
  - `updateDocumentSettings({ indexingEnabled, ocrEnabled, semanticEnabled })`
  - `getModelStatus(): Promise<ModelStatus>`
  - `downloadEmbeddingModel(id: string): Promise<{ error: string } | { success: true }>`
  - `useEmbeddingModel(id: string): Promise<DocumentActionResult>`
  - `deleteEmbeddingModel(id: string): Promise<{ error: string } | { success: true }>`
  - `<DocumentSettings initial={{ indexingEnabled, ocrEnabled, semanticEnabled }} stats={string} models={ModelStatus} />`

- [ ] **Step 1: Server actions**

In `lib/actions/document-settings.ts`:

1. Schema: `z.object({ indexingEnabled: z.boolean(), ocrEnabled: z.boolean(), semanticEnabled: z.boolean() })`.
2. Imports: `import { downloads, loadModelStatus, unloadEmbedder, type ModelStatus } from "@/lib/documents/embed/server"`, `import { deleteModelFiles, isInstalled } from "@/lib/documents/embed/files"`, `import { modelById } from "@/lib/documents/embed/models"`.
3. In `updateDocumentSettings`, after the upsert: `if (!parsed.data.semanticEnabled) await unloadEmbedder()`.
4. Add:

```ts
export async function getModelStatus(): Promise<ModelStatus> {
  await requireAdmin()
  return loadModelStatus()
}

export async function downloadEmbeddingModel(id: string): Promise<{ error: string } | { success: true }> {
  await requireAdmin()
  const m = modelById(id)
  if (!m || m.builtIn) return { error: "Unknown model." }
  if (await isInstalled(m)) return { success: true }
  const started = downloads().start(m)
  return "error" in started ? started : { success: true }
}

export async function useEmbeddingModel(id: string): Promise<DocumentActionResult> {
  await requireAdmin()
  const m = modelById(id)
  if (!m) return { error: "Unknown model." }
  if (!(await isInstalled(m))) return { error: "Download the model first." }
  await prisma.documentSettings.upsert({
    where: { id: DOCUMENT_SETTINGS_ID },
    create: { id: DOCUMENT_SETTINGS_ID, embeddingModel: m.id },
    update: { embeddingModel: m.id },
  })
  await unloadEmbedder()
  // Reconcile switches the index to the new model and re-embeds in the background.
  void documentIndexer().reconcile()
  revalidatePath("/settings")
  return { success: true, stats: await documentIndexStats() }
}

export async function deleteEmbeddingModel(id: string): Promise<{ error: string } | { success: true }> {
  await requireAdmin()
  const m = modelById(id)
  if (!m) return { error: "Unknown model." }
  if (m.builtIn) return { error: "The built-in model can't be deleted." }
  if ((await loadDocumentSettings()).embeddingModel === m.id) return { error: "Switch to another model before deleting this one." }
  if (downloads().status().current?.modelId === m.id) return { error: "Wait for the download to finish." }
  await deleteModelFiles(m)
  return { success: true }
}
```

- [ ] **Step 2: UI**

In `components/settings/document-settings.tsx`:

1. `type Values = { indexingEnabled: boolean; ocrEnabled: boolean; semanticEnabled: boolean }`. Add the prop `models: ModelStatus` (import the type from `@/lib/documents/embed/server` with `import type`). Add state `const [models, setModels] = useState(initialModels)`.
2. Poll while a download runs:

```tsx
  const downloading = models.download?.modelId ?? null
  useEffect(() => {
    if (!downloading) return
    const t = setInterval(async () => {
      const next = await getModelStatus()
      setModels(next)
      if (!next.download && next.lastDownload?.error) toast.error(`${next.lastDownload.modelId}: ${next.lastDownload.error}`)
    }, 1000)
    return () => clearInterval(t)
  }, [downloading])
```

3. Under the OCR block, add the section:

```tsx
        <div className="space-y-3 border-t pt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={values.semanticEnabled}
              disabled={pending || !on}
              onChange={(e) => save({ ...values, semanticEnabled: e.target.checked })}
            />
            Find documents by meaning, not just exact words
          </label>
          <p className="ml-6 text-xs text-muted-foreground">
            Runs a small AI model on this server. Nothing leaves it. The model loads when needed and unloads when idle.
          </p>
          <div className="divide-y rounded-md border text-sm">
            {models.models.map((m) => {
              const isDownloading = models.download?.modelId === m.id
              const pct = isDownloading && models.download ? Math.floor((models.download.received / models.download.total) * 100) : 0
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {m.label} <span className="font-normal text-muted-foreground">· {m.sizeMb} MB</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{m.purpose}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.active ? (
                      <Badge variant="secondary">In use</Badge>
                    ) : isDownloading ? (
                      <span className="text-xs text-muted-foreground">Downloading… {pct}%</span>
                    ) : m.installed ? (
                      <>
                        <Button type="button" variant="outline" size="sm" disabled={pending || !on} onClick={() => switchTo(m)}>
                          Use
                        </Button>
                        {!m.builtIn && (
                          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => remove(m)}>
                            Delete
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button type="button" variant="outline" size="sm" disabled={pending || Boolean(models.download)} onClick={() => download(m)}>
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
```

4. Handlers (inside the component):

```tsx
  const refreshModels = async () => setModels(await getModelStatus())

  function download(m: ModelRow) {
    start(async () => {
      const r = await downloadEmbeddingModel(m.id)
      if ("error" in r) toast.error(r.error)
      await refreshModels()
    })
  }

  function switchTo(m: ModelRow) {
    if (!confirm(`Switch to ${m.label}? Every document is re-processed in the background. Keyword search keeps working meanwhile.`)) return
    run(() => useEmbeddingModel(m.id), `Switching to ${m.label}.`)
    void refreshModels()
  }

  function remove(m: ModelRow) {
    if (!confirm(`Delete ${m.label} (${m.sizeMb} MB)? You can download it again later.`)) return
    start(async () => {
      const r = await deleteEmbeddingModel(m.id)
      if ("error" in r) toast.error(r.error)
      else toast.success(`${m.label} deleted.`)
      await refreshModels()
    })
  }
```

   (`run` is the existing helper. `ModelRow` is imported as a type from `@/lib/documents/embed/server`. `save` already sends the whole `values` object, so it now includes `semanticEnabled`.)

   Note: this file is a client component. It may only `import type` from `embed/server.ts`. Never import values from it, because it reaches Prisma.

In `app/(app)/settings/page.tsx`:
- The docs `Promise.all` becomes `[loadDocumentSettings(), documentIndexStats(), loadModelStatus()]` (import `loadModelStatus` from `@/lib/documents/embed/server`).
- Render: `<DocumentSettings initial={docs[0]} stats={docs[1]} models={docs[2]} />`. `docs[0]` now has four fields; pass `{ indexingEnabled, ocrEnabled, semanticEnabled }` explicitly.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit && npx eslint components/settings lib/actions "app/(app)/settings" && npx vitest run && npm run build`
Expected: clean (only the pre-existing `form.watch` warning), PASS, build OK.

```bash
git add lib/actions/document-settings.ts components/settings/document-settings.tsx "app/(app)/settings/page.tsx"
git commit -m "feat(settings): semantic search switch and embedding model management"
```

---

### Task 8.5: End-to-end unload check (no code)

There's nothing to build here: the lifecycle (Task 2) and the embedder (Task 5) already implement the 10-minute rule for searches. This checkpoint confirms it end to end before the Docker work.

- [ ] **Step 1:** Create `./.unload-check.ts`:

```ts
import "dotenv/config"
import { createEmbedder } from "@/lib/documents/embed/embedder"
import { builtinRoot } from "@/lib/documents/embed/files"
import { BUILTIN_MODEL_ID, modelById } from "@/lib/documents/embed/models"
import { workerPath } from "@/lib/documents/embed/server"

async function main() {
  const mb = () => Math.round(process.memoryUsage().rss / 1e6)
  const e = createEmbedder({ model: modelById(BUILTIN_MODEL_ID)!, modelsRoot: builtinRoot(), workerPath: workerPath(), idleMs: 3000 })
  console.log("start", mb(), "MB")
  await e.embedQuery("warm")
  console.log("loaded", e.loaded(), mb(), "MB")
  await new Promise((r) => setTimeout(r, 4000))
  console.log("after idle", e.loaded(), mb(), "MB")
  await e.embedPassages(["a", "b"])
  e.indexingDrained()
  await new Promise((r) => setTimeout(r, 300))
  console.log("after indexing (no recent search)", e.loaded())
}
main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1) })
```

Run: `timeout 120 npx tsx ./.unload-check.ts`, then delete the file.
Expected:
- `loaded true` with RSS several hundred MB higher;
- `after idle false` with RSS near the start value;
- `after indexing (no recent search) false`.

No commit.

---

### Task 9: Docker image (Debian), README, publish for NAS testing

**Files:**
- Modify: `Dockerfile`, `docker-entrypoint.sh`, `README.md`

- [ ] **Step 1: Dockerfile**

Replace `Dockerfile` with:

```dockerfile
# ── deps: install production + dev deps ──────────────────────────────────────
# Debian (glibc), not Alpine: onnxruntime-node's Linux binary needs glibc ≥ 2.28.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN npm install

# ── builder: generate Prisma client, build Next.js, fetch the built-in model ──
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
# Build-time only placeholder — lib/prisma.ts constructs a client at module
# load (needed while Next statically collects route/page data), but nothing
# actually queries it during the build. Real DATABASE_URL is set at runtime.
ENV DATABASE_URL="file:./build-placeholder.db"
RUN npm run build
# The built-in embedding model ships in the image so semantic search works
# offline from the first start. Downloaded and checksum-verified here.
RUN npm run models:fetch-builtin

# ── runner: minimal production image ─────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
ARG TARGETARCH
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs --no-create-home nextjs
RUN mkdir -p /data/uploads && chown nextjs:nodejs /data
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Include native modules (@libsql, canvas, onnxruntime) from builder
COPY --from=builder /app/node_modules ./node_modules
# ONNX Runtime ships binaries for every OS and CPU; keep only this image's.
RUN ARCH=$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x64) \
  && cd node_modules/onnxruntime-node/bin/napi-v6 \
  && rm -rf darwin win32 \
  && find linux -mindepth 1 -maxdepth 1 ! -name "$ARCH" -exec rm -rf {} +
# Needed at runtime for migrate deploy + seed (not part of the standalone output)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
# Embedding worker (plain ESM, not bundled by Next) and the built-in model
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/models/builtin ./models/builtin
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV MODELS_DIR=/data/models
ENTRYPOINT ["./docker-entrypoint.sh"]
```

In `docker-entrypoint.sh`, replace every `su-exec nextjs` with `gosu nextjs`, and change `mkdir -p /data/uploads` to `mkdir -p /data/uploads /data/models`.

- [ ] **Step 2: README**

Add to the "Document search" section:

````markdown
#### Search by meaning

Besides exact words, HomeCenter can find passages by meaning ("how often do I
swap the furnace filter?" finds "replace every 90 days"). A small AI model runs
**on your server** — no document text leaves it for this. The model loads only
while documents are being indexed or searched, and unloads when idle.

**Settings → Documents → Find documents by meaning** turns it on or off and
picks the model:

| Model | Size | Good for |
|---|---|---|
| BGE small (built in) | 34 MB | Fast, English |
| Arctic Embed M | 110 MB | Best quality for its size, English (recommended upgrade) |
| BGE base | 110 MB | Better quality, English |
| Nomic Embed Text | 137 MB | Good quality, English |
| E5 base | 279 MB | Many languages |
| BGE large | 337 MB | Highest quality, slow on small hosts |

Larger models download from Hugging Face when you click **Download** (the
only time HomeCenter goes online for this) and are stored in `/data/models`.
Switching models re-processes your documents in the background.

| Variable | Default | Meaning |
|---|---|---|
| `MODELS_DIR` | `/data/models` | Where downloaded models are kept. |
| `EMBEDDING_IDLE_MINUTES` | `10` | Unload the model this long after the last search. `0` unloads right after each search. |
````

Also add a line to "Updating": "From this version the image is based on Debian slim instead of Alpine. Nothing changes for you: pull and recreate as usual."

In "Local development", add: `npm run models:fetch-builtin` downloads the built-in model into `./models/builtin/` (needed once for meaning search in development).

- [ ] **Step 3: Verify locally what can be verified**

Run: `npm run build && npx vitest run`
Expected: OK.

- [ ] **Step 4: Commit and hand over for NAS testing**

```bash
git add Dockerfile docker-entrypoint.sh README.md
git commit -m "build: Debian base image, built-in embedding model, ONNX pruning"
```

**Stop here and ask the user** before pushing (an outward-facing action). With their go-ahead:

```bash
git push -u origin FEAT/document-search
gh workflow run "Docker Publish" --ref FEAT/document-search
gh run watch
```

Then tell the user the published tag (`ghcr.io/yatzin/homecenter:sha-<short>`, from the run's "Extract metadata" step) and the NAS checklist from the spec:
1. container starts, log shows `[documents] boot: queued …` without errors;
2. Settings → Documents: semantic on, built-in "In use", status reaching "meaning search ready";
3. a paraphrased question finds the right passage;
4. a scanned PDF and a phone photo become searchable;
5. download Arctic Embed M → Use → re-embed → switch back → Delete;
6. note embedding speed and idle vs busy memory.
