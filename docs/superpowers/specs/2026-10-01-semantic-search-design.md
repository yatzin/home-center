# Semantic Document Search — Design

**Date:** 2026-10-01
**Status:** Approved design, not yet implemented.
**Branch:** `FEAT/document-search` (continues stage 1–2 work)
**Builds on:** `docs/superpowers/specs/2026-09-30-document-search-design.md`
(extraction, chunks, FTS5 index, `list_documents` / `search_documents` /
`read_document`, indexer queue and reconcile).

## Problem

Keyword search finds words, not meaning. "Water coming through the ceiling"
misses a passage about "flashing failure and roof leak"; "AC" misses "air
conditioner". The assistant rephrases and retries, but that costs rounds
and still misses passages that share no words with the question.

## Goal

Add a semantic layer next to the keyword index:

- Every chunk also gets an embedding vector, computed **locally, in-process**
  — no document text leaves the server for this.
- `search_documents` ranks by **both** keyword (BM25) and vector similarity,
  merged, so exact model numbers still win and paraphrases are found.
- Admins choose the embedding model from a **vetted list**: download, use,
  switch, delete. The smallest model ships **built in**, so semantic search
  works out of the box and offline.
- The model is loaded only while needed and **fully unloaded** afterwards.

**Success:** a question phrased differently from the document ("how often do
I swap the furnace filter?" vs "replace every 90 days") finds the right
passage, on a fresh install with no internet access, and the server's memory
returns to its baseline when nothing is being indexed or asked.

**Non-goals:** arbitrary Hugging Face model IDs, embedding via the LLM
server's `/v1/embeddings`, GPU acceleration, re-ranking models, embedding
anything other than document chunks (database records keep their existing
tools).

## Decisions

| Question | Decision |
|---|---|
| Where embeddings come from | **In-process**, `@huggingface/transformers` (Apache-2.0) on `onnxruntime-node` (MIT), CPU. |
| Process model | The model runs in a **`worker_threads` worker**. Unloading = terminating the worker. Measured: `dispose()` in the main thread left ~130–160 MB resident; terminating a worker returned RSS to baseline (668 → 104 MB). |
| Model choice | **Vetted list only** (table below). Each entry pins a Hugging Face repo, a commit revision, file names, sha256, pooling, query/passage prefixes and vector size. No free-form model IDs. |
| Default | `bge-small-en-v1.5` (q8, 34 MB) is **built into the image** and active on first start. Works offline. |
| Built-in model | Can be switched away from, **not deleted** (it lives in the read-only image; 34 MB). |
| Other models | Downloaded on an admin's click from `huggingface.co`, into `MODELS_DIR` (default `/data/models`), checksum-verified. Several can stay downloaded; one is active. |
| Network | Outbound requests happen **only** when an admin clicks Download. Indexing and search never touch the network. |
| Switching models | Re-embeds every chunk from the stored chunk text (no file re-read, no re-chunking). Keyword search keeps working throughout; semantic results fill in as re-embedding progresses. |
| Deleting a model | Only when it isn't active. Removes its files from `MODELS_DIR`. |
| Semantic switch | `DocumentSettings.semanticEnabled`, default **on**. Off = no embedding work, keyword-only search; vectors kept. Requires indexing on. |
| Ranking | Hybrid: BM25 top 60 and vector top 60 merged with **reciprocal rank fusion** (k = 60). A chunk found by both ranks highest. |
| Unloading — indexing | When the indexing queue drains, the worker is terminated **immediately**, unless a search used it in the last 10 minutes (then the search timer below decides). |
| Unloading — search | After the last search that used the model, the worker is terminated after **10 minutes idle** (`EMBEDDING_IDLE_MINUTES`, default 10; `0` = unload right after each answer). Any use resets the timer. |
| Cold search | **Waits** for the model to load (measured ~0.25–0.8 s on a 16-core desktop; a NAS will be slower, still a small part of an LLM answer). |
| Docker base image | **Moves from `node:22-alpine` to `node:22-bookworm-slim`.** `onnxruntime-node`'s Linux binary requires glibc ≥ 2.28 and has no musl build. (This also removes the open question about `@napi-rs/canvas` on musl.) |

## Vetted models

Sizes are the q8 (int8) ONNX files transformers.js loads. Licences checked
on the upstream model cards. Throughput measured on a 16-core desktop with
~1,000-character chunks; expect roughly 3–5× slower on a 4-core NAS.

| Id | Hugging Face repo | Size | Dims | Pooling | Query prefix | Passage prefix | Licence | Chunks/s (desktop) |
|---|---|---|---|---|---|---|---|---|
| `bge-small-en-v1.5` **(built-in)** | `Xenova/bge-small-en-v1.5` | 34 MB | 384 | cls | `Represent this sentence for searching relevant passages: ` | — | MIT | ~40 |
| `bge-base-en-v1.5` | `Xenova/bge-base-en-v1.5` | 110 MB | 768 | cls | same as bge-small | — | MIT | ~20 (est.) |
| `snowflake-arctic-embed-m-v1.5` **(recommended upgrade)** | `Snowflake/snowflake-arctic-embed-m-v1.5` | 110 MB | 768 | cls | same as bge-small | — | Apache-2.0 | ~22 |
| `nomic-embed-text-v1.5` | `nomic-ai/nomic-embed-text-v1.5` | 137 MB | 768 | mean | `search_query: ` | `search_document: ` | Apache-2.0 | ~18 (est.) |
| `multilingual-e5-base` | `Xenova/multilingual-e5-base` | 279 MB | 768 | mean | `query: ` | `passage: ` | MIT | ~15 (est.) |
| `bge-large-en-v1.5` | `Xenova/bge-large-en-v1.5` | 337 MB | 1024 | cls | same as bge-small | — | MIT | ~7 (est.) |

Each registry entry also pins `revision` (commit sha) and the sha256 of
every file it downloads (`onnx/model_quantized.onnx`, `tokenizer.json`,
`tokenizer_config.json`, `config.json`, `special_tokens_map.json`). Example,
captured 2026-10-01: `Xenova/bge-small-en-v1.5` @ `ea104dac…`,
`onnx/model_quantized.onnx` sha256 `6c9c6101…dbfe4`, 34,014,426 bytes.
The plan fills in the rest from the Hugging Face API and a test asserts
every entry is complete.

## Architecture

```
indexer (existing)                 embedder (new)                       search_documents
──────────────────                 ──────────────                       ────────────────
extract → chunks → FTS5 ──────▶   reconcile/enqueue: chunks with        query ─┬─▶ FTS5 BM25 top 60
                                   no vector for the active model         │
                                   → batches of 16 → worker ──▶ vectors   ├─▶ embed(query) → vector top 60
                                   (worker_threads, onnxruntime-node)     │
                                   unload: queue drained (+ no recent     └─▶ RRF merge → filters → group
                                   search) / 10 min after last search
```

### Units

| File | Responsibility |
|---|---|
| `lib/documents/embed/models.ts` | The vetted registry: id, label, repo, revision, files + sha256, size, dims, pooling, prefixes, licence, `builtIn`. Pure. |
| `lib/documents/embed/fusion.ts` | Reciprocal rank fusion of two ranked hit lists. Pure. |
| `lib/documents/embed/lifecycle.ts` | Unload policy as a small state machine (uses: indexing / search; timers injected). Pure, tested with a fake clock. |
| `lib/documents/embed/worker.ts` | Worker entry: loads one model from a local folder (`env.allowRemoteModels = false`), embeds batches, applies prefix/pooling/normalise. |
| `lib/documents/embed/embedder.ts` | Main-thread client: starts/terminates the worker, queues requests, applies the lifecycle. `embedPassages(texts)`, `embedQuery(text)`, `unload()`. |
| `lib/documents/embed/store.ts` | Model files on disk: where each model lives (built-in dir vs `MODELS_DIR`), which are installed, verify, delete. |
| `lib/documents/embed/download.ts` | Download a vetted model: stream each file to a temp path, verify size + sha256, then rename; progress callback; one download at a time. |
| `lib/documents/index-db.ts` (extend) | Vector table per active model; write/read vectors; `vectorSearch(vector, filter, k)`; which chunks lack vectors. |
| `lib/documents/indexer.ts` (extend) | After a file's chunks are written, its chunks are queued for embedding; reconcile also queues chunks lacking vectors. Embedding never blocks extraction. |
| `lib/llm/tools/documents.ts` (extend) | `search_documents` runs both searches and fuses them when semantic is available. |
| `lib/actions/document-settings.ts` (extend) | `setSemanticEnabled`, `downloadModel`, `deleteModel`, `useModel`, `getModelStatus`. Admin only. |
| `components/settings/document-settings.tsx` (extend) | Semantic search section. |

## Data

### Prisma

`DocumentSettings` gains:

```prisma
  /// Embed chunks and use them in search_documents. Needs indexingEnabled.
  semanticEnabled Boolean @default(true)
  /// Vetted model id (lib/documents/embed/models.ts). Default is the built-in one.
  embeddingModel  String  @default("bge-small-en-v1.5")
```

Download progress is in memory (per process), not in the database.

### `search-index.db`

```sql
-- One vector table for the active model. Its dimension is fixed at
-- creation, so switching to a model with a different size drops and
-- recreates it; meta.embedding_model records which model filled it.
CREATE TABLE chunk_vec (
  chunk_id INTEGER PRIMARY KEY,         -- = chunk.id; deleted with the chunk
  embedding F32_BLOB(<dims>) NOT NULL
);
CREATE INDEX chunk_vec_idx ON chunk_vec (libsql_vector_idx(embedding, 'metric=cosine'));
-- meta: embedding_model = '<id>@<revision>'
```

- Chunk delete paths (`replace`, `remove`, `clear`) also delete from
  `chunk_vec`.
- A model switch (different id or revision) drops `chunk_vec`, recreates it
  with the new dimension, and sets `meta.embedding_model`; reconcile then
  embeds everything.
- Spike (2026-10-01, libsql 3.45 local file): `F32_BLOB`, `vector32()`,
  `libsql_vector_idx(…, 'metric=cosine')`, `vector_top_k`,
  `vector_distance_cos` and deletes all work. Column names must be
  qualified when joining `vector_top_k` (both expose `id`).

## Embedding lifecycle

- **New file:** extraction → chunks → FTS5 (as today) → its chunk ids are
  queued for embedding. Keyword search covers it immediately; semantic
  search a moment later.
- **Batches** of 16 chunks; yield between batches.
- **Reconcile** (boot, timer, admin buttons) also queues every chunk with no
  vector for the active model.
- **Delete file / record:** vectors go with their chunks (same paths as
  today).
- **Semantic off:** nothing embeds; search is keyword-only; existing vectors
  are kept, so turning it back on only fills gaps.
- **Indexing off:** everything stops, as today.
- **Re-extract a file:** its chunks are replaced, so its vectors are too.

### Unload policy (`lifecycle.ts`)

State: `loaded`, `indexingActive`, `lastSearchUse`.

- Load on first need (an embed batch or a query).
- After an embed batch, if the queue is empty and `now − lastSearchUse ≥ idle`
  (or there was no search), unload **now**.
- After a query, set `lastSearchUse` and arm a timer for `idle`; when it fires,
  unload if no indexing is active (otherwise the drain rule unloads).
- `idle` = `EMBEDDING_IDLE_MINUTES` (default 10).
- An embed or query arriving while unloading waits for the new worker.

## Search

When `semanticEnabled` and the active model is installed:

1. `parseSearch` as today → FTS5 top 60 with the existing filters.
2. `embedQuery(prefix + raw query)` → `vector_top_k(…, 200)` joined to
   `chunk` with the same filters (asset scope, record type, health
   exclusion); keep the best 60. (k is larger than 60 because filters
   apply after the vector index.)
3. Merge with RRF: `score = Σ 1 / (60 + rank)` over the lists a chunk is in.
4. Group by file and build passages as today. For a vector-only hit the
   passage falls back to the chunk start (no keyword to centre on).

If the query has no keyword terms (`parseSearch` returns null) but
semantic is available, run vector-only instead of erroring. Questions like
"anything about mould?" work either way.

If the model can't load (missing files, worker crash), log the error name
and fall back to keyword-only for that search. Search never fails because
of the semantic layer.

The tool description gains: "Understands meaning as well as exact words."

## Settings UI (Documents card)

New **Semantic search** section, under the OCR switch:

- Switch: **Find documents by meaning, not just exact words**
  (`semanticEnabled`). Disabled while indexing is off.
- Model table: name, size, what it's for ("Fast, English — built in",
  "Better quality, English", "Many languages", …), status, and an action:
  - built-in: *Built in* · **Use**
  - not installed: **Download** (progress bar while downloading)
  - installed, not active: **Use** · **Delete** (confirm)
  - active: *In use*
- **Use** on a different model: confirm "Re-embeds all N chunks in the
  background (about M minutes). Keyword search keeps working meanwhile."
- Status line gains `· N of M chunks have meaning vectors` while embedding.
- Download errors (network, checksum, disk full) show as a toast; partial
  files are removed.

## Build and deployment

- `Dockerfile`:
  - Base `node:22-bookworm-slim` for all stages. Replace `apk add su-exec`
    with `apt-get install -y --no-install-recommends gosu`; the entrypoint
    uses `gosu` instead of `su-exec`. `addgroup`/`adduser` become
    `groupadd`/`useradd`.
  - Builder stage runs `npm run models:fetch-builtin`, which downloads and
    verifies the built-in model into `/app/models/builtin/` (network needed at
    **build** time only).
  - Prune unused ONNX Runtime binaries from the runner: keep only
    `bin/napi-v6/linux/<arch>` for the build's `TARGETARCH` (`amd64` → `x64`,
    `arm64` → `arm64`). That's about 250 MB less. The publish workflow builds
    **both** `linux/amd64` and `linux/arm64`, so pruning must follow
    `TARGETARCH`, not assume x64.
- **Verification happens on the NAS**, not locally (no local Docker). Flow:
  push the branch → run the "Docker Publish" workflow manually on
  `FEAT/document-search` (`workflow_dispatch`) → it publishes
  `ghcr.io/yatzin/homecenter:sha-<short>` (not `latest`, which only builds
  from `main`) → point the NAS compose file at that tag and recreate the
  container → run the NAS checklist below. The app has no users yet, so a
  failed start costs only a rollback to the previous tag.
- `next.config.ts`: add `@huggingface/transformers` and `onnxruntime-node`
  to `serverExternalPackages`.
- Env: `MODELS_DIR` (default `/data/models`; dev `./models`),
  `EMBEDDING_IDLE_MINUTES` (default 10).
- Dev: `npm run models:fetch-builtin` downloads the built-in model into
  `./models/builtin/` (gitignored). Without it, semantic search reports
  "built-in model missing" and search stays keyword-only.
- README: semantic search section, model table, the two env vars, the
  base-image change.

## Security

- Downloads only from `https://huggingface.co/<repo>/resolve/<pinned
  revision>/<file>` for registry entries. No user-supplied URLs or IDs.
- Every file is checked for size and sha256 before it's renamed into place.
  A mismatch deletes it and reports "Download failed checksum".
- The worker loads with `allowRemoteModels = false`. The runtime never
  fetches anything itself.
- Model folders are resolved from the registry id, never from client input.
  Delete refuses the built-in model and the active model.
- Admin-only server actions, as for the rest of the Documents card.

## Testing

| Test | Covers |
|---|---|
| `embed/models.test.ts` | Every entry complete (revision, files with sha256 and size, dims, pooling); exactly one built-in; ids unique |
| `embed/fusion.test.ts` | RRF: both-list hits win, ties, one list empty, limit |
| `embed/lifecycle.test.ts` | Fake clock: unload right after indexing with no recent search; stay loaded after a search; unload 10 min after the last search; indexing during the search window; `idle = 0` |
| `embed/download.test.ts` | Local HTTP server: success + rename; checksum mismatch deletes; network error cleans up; only one download at a time |
| `index-db.test.ts` (extend) | Vector write/search with small fake vectors; filters on vector results; vectors removed with chunks; model switch recreates the table with the new dimension |
| `indexer.test.ts` (extend) | New chunks get queued for embedding; semantic off → nothing queued; reconcile queues chunks lacking vectors |
| `embed/embedder.test.ts` | Real worker with the built-in model, **only when `./models/builtin` exists**: embeds, query vs passage prefixes differ, unload terminates the worker |
| `tools` (via tsx check) | Paraphrased question finds the passage; keyword-only fallback when the model folder is missing |

## Spikes (2026-10-01, Windows, Node 24, 16 cores)

| Check | Result |
|---|---|
| libsql vectors (local file) | Pass — see Data |
| `@huggingface/transformers` 4.3 + `onnxruntime-node` 1.30, `bge-small` q8 | Load 0.23 s, ~40 chunks/s (batch 16), query 9 ms, 384 dims |
| Same, `snowflake-arctic-embed-m-v1.5` q8 | Load 0.26 s, ~22 chunks/s, query 7 ms, 768 dims |
| Memory, main thread | 76 → 344 MB loaded; 202 MB after `dispose()` (not returned) |
| Memory, worker thread | 104 → 682 MB loaded; 107 MB after `terminate()` (returned) |
| WASM backend in Node | Not available ("Unsupported device: wasm") |
| ONNX Runtime on Alpine | Not possible: Linux binary needs glibc ≥ 2.28, no musl build |
| Package footprint | `onnxruntime-node` 288 MB (all platforms; Linux x64 ~45 MB), `onnxruntime-web` 141 MB (pulled in, unused in Node), transformers 13 MB |

**Still to check, on the NAS:** load time and throughput on a NAS-class CPU;
the Debian image build (both architectures, in GitHub Actions); that pruning
`onnxruntime-web` doesn't break the import.

## NAS checklist (after deploying the test tag)

1. The container starts and the log shows `[documents] boot: queued …` with
   no errors.
2. Settings → Documents shows Semantic search on, the built-in model *In use*,
   and the status line reaching "all chunks have meaning vectors".
3. Ask the assistant a paraphrased question ("how often do I swap the furnace
   filter?") and it finds the passage.
4. Upload a scanned PDF and a phone photo of a receipt; both become
   searchable (this also confirms OCR on the new base image).
5. Download `snowflake-arctic-embed-m-v1.5`, click **Use**, watch it
   re-embed, then delete it again after switching back.
6. Note the embedding speed and the container's memory while idle vs during
   indexing (from the NAS's container view), for the record.

## Resolved questions

1. The built-in model **can't be deleted**, only switched away from.
2. The Docker base image **moves to Debian slim** (`node:22-bookworm-slim`).
   Approved 2026-10-01.
