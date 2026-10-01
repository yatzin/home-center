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
