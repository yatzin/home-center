import { prisma } from "@/lib/prisma"
import { createIndexer, type Indexer } from "./indexer"
import { openSearchIndex, searchIndexPath, type SearchIndex } from "./index-db"
import { prismaIndexerStore } from "./store"
import { loadDocumentSettings } from "./settings"
import { formatIndexStats, type StatusCounts } from "./stats"
import { OCR_EXTENSIONS } from "./limits"

// instrumentation.ts, route handlers and server actions can each load their
// own copy of this module, so the one indexer and index handle per process
// live on globalThis. HomeCenter is a single container on a single SQLite
// file; this is not meant for several replicas.

type State = { indexer?: Indexer; index?: Promise<SearchIndex>; started?: boolean }
const g = globalThis as unknown as { __hcDocuments?: State }
const state: State = (g.__hcDocuments ??= {})

const nameOf = (error: unknown) => (error instanceof Error ? error.name : typeof error)

export function searchIndex(): Promise<SearchIndex> {
  state.index ??= openSearchIndex(searchIndexPath()).catch((error) => {
    state.index = undefined
    throw error
  })
  return state.index
}

export function documentIndexer(): Indexer {
  state.indexer ??= createIndexer({
    store: prismaIndexerStore,
    index: searchIndex,
    extract: async (filePath, ext, opts) => (await import("./extract")).extractFile(filePath, ext, opts),
    idle: async () => (await import("./extract/ocr")).terminateOcr(),
  })
  return state.indexer
}

export function enqueueDocument(id: string): void {
  documentIndexer().enqueue(id)
}

const DEFAULT_HOURS = 6
// Long enough to stay clear of the server's own startup work.
const BOOT_DELAY_MS = 20_000

function intervalMs() {
  const raw = process.env.DOCUMENT_REINDEX_HOURS
  if (raw === undefined) return DEFAULT_HOURS * 3_600_000
  const hours = Number(raw)
  if (!Number.isFinite(hours) || hours < 0) {
    console.warn(`[documents] ignoring invalid DOCUMENT_REINDEX_HOURS=${raw}`)
    return DEFAULT_HOURS * 3_600_000
  }
  return hours * 3_600_000 // 0 disables
}

function reconcileNow(trigger: string) {
  return documentIndexer()
    .reconcile()
    .then(
      ({ queued }) => {
        if (queued) console.info(`[documents] ${trigger}: queued ${queued}`)
      },
      (error) => console.error(`[documents] ${trigger} failed:`, nameOf(error))
    )
}

export function startDocumentIndexer(): void {
  if (state.started) return
  state.started = true
  setTimeout(() => void reconcileNow("boot"), BOOT_DELAY_MS).unref()
  const every = intervalMs()
  // unref so a pending timer never keeps the process alive on shutdown.
  if (every > 0) setInterval(() => void reconcileNow("scheduled"), every).unref()
}

export async function retryFailed(): Promise<void> {
  await prisma.attachmentText.updateMany({ where: { status: "FAILED" }, data: { status: "PENDING", attempts: 0 } })
  void reconcileNow("retry failed")
}

export async function reextractAll(): Promise<void> {
  await prisma.attachmentText.updateMany({ data: { status: "PENDING", attempts: 0 } })
  void reconcileNow("re-extract all")
}

/** From stored text — no file is read again. */
export async function rebuildIndex(): Promise<void> {
  await (await searchIndex()).clear()
  void reconcileNow("rebuild index")
}

/** Deletes every extracted text and the index; rows go back to PENDING. Callers check indexing is off. */
export async function clearAllText(): Promise<void> {
  await prisma.attachmentText.updateMany({
    data: {
      status: "PENDING", method: null, text: null, pageCount: null, charCount: null, truncated: false,
      error: null, attempts: 0, extractorVersion: 0, extractedAt: null,
    },
  })
  await (await searchIndex()).clear()
}

/** Images and PDFs that came back empty with OCR off get another go. */
export async function requeueEmptyForOcr(): Promise<void> {
  await prisma.attachmentText.updateMany({
    where: { status: "EMPTY", attachment: { OR: OCR_EXTENSIONS.map((ext) => ({ filename: { endsWith: ext } })) } },
    data: { status: "PENDING" },
  })
}

export async function documentIndexStats(): Promise<string> {
  const [settings, groups] = await Promise.all([
    loadDocumentSettings(),
    prisma.attachmentText.groupBy({ by: ["status"], _count: { _all: true } }),
  ])
  const counts: StatusCounts = Object.fromEntries(groups.map((g) => [g.status, g._count._all]))
  return formatIndexStats(counts, settings.indexingEnabled)
}
