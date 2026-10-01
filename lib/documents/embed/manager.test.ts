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
