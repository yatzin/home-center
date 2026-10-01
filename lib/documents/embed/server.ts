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
