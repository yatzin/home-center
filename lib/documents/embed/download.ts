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
/** A connection that sends nothing for this long is given up on (it may never close). */
const STALL_MS = 60_000

export async function downloadModelFiles(
  m: EmbeddingModel,
  root: string,
  opts: { baseUrl?: string; fetchImpl?: typeof fetch; onProgress?: (p: DownloadProgress) => void; stallMs?: number } = {}
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const total = modelSize(m)
  let received = 0
  const dir = path.join(root, ...m.repo.split("/"))

  for (const file of m.files) {
    const dest = path.join(dir, ...file.path.split("/"))
    const part = `${dest}.part`
    await mkdir(path.dirname(dest), { recursive: true })
    const abort = new AbortController()
    let stalled = false
    let timer: NodeJS.Timeout | undefined
    const watch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        stalled = true
        abort.abort()
      }, opts.stallMs ?? STALL_MS)
    }
    try {
      watch()
      const res = await fetchImpl(`${opts.baseUrl ?? HF}/${m.repo}/resolve/${m.revision}/${file.path}`, { signal: abort.signal })
      if (!res.ok || !res.body) throw new DownloadError(`Download failed (HTTP ${res.status})`)
      const hash = createHash("sha256")
      let size = 0
      const body = Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>)
      body.on("data", (chunk: Buffer) => {
        watch()
        hash.update(chunk)
        size += chunk.length
        received += chunk.length
        opts.onProgress?.({ received, total })
      })
      await pipeline(body, createWriteStream(part), { signal: abort.signal })
      if (size !== file.size || hash.digest("hex") !== file.sha256) throw new DownloadError("Download failed checksum")
      await rename(part, dest)
    } catch (error) {
      await rm(part, { force: true })
      if (stalled) throw new DownloadError("Download stalled")
      if (error instanceof DownloadError) throw error
      throw new DownloadError("Download failed")
    } finally {
      clearTimeout(timer)
    }
  }
}
