import path from "path"
import { EXTRACT_HEAP_MB, EXTRACT_TIMEOUT_MS, EXTRACT_WORKER_GRACE_MS, OCR_TIMEOUT_MS } from "../limits"
import { forkScript, killProcess } from "../fork"
import { ExtractError, type Extracted } from "../types"
import { kindFor } from "./kinds"

// extractFile, run in workers/extract-worker.mjs as its own process. In the
// server, a zip bomb could exhaust its memory, and a synchronous parser blocked
// the event loop so withTimeout never fired. In a child process the heap is
// capped, a timeout kills it whatever it is doing, and its memory (parsers,
// OCR) goes back to the OS when it ends.

type Reply = { ok: true; result: Extracted } | { ok: false; name: string; message?: string }

export type IsolatedOptions = { workerPath: string; entry: string; heapMb: number; graceMs: number }

function defaults(): IsolatedOptions {
  return {
    workerPath: path.join(process.cwd(), "workers", "extract-worker.mjs"),
    entry: path.join(process.cwd(), "lib", "documents", "extract", "index.ts"),
    heapMb: EXTRACT_HEAP_MB,
    graceMs: EXTRACT_WORKER_GRACE_MS,
  }
}

export function extractInWorker(
  filePath: string,
  ext: string | null,
  opts: { ocr: boolean },
  over: Partial<IsolatedOptions> = {}
): Promise<Extracted> {
  const kind = kindFor(ext)
  if (!kind || !ext) return Promise.resolve({ kind: "unsupported" })
  const o = { ...defaults(), ...over }
  const slow = opts.ocr && (kind === "pdf" || kind === "image")
  const limitMs = (slow ? OCR_TIMEOUT_MS : EXTRACT_TIMEOUT_MS) + o.graceMs

  return new Promise<Extracted>((resolve, reject) => {
    const worker = forkScript(o.workerPath, {
      args: [JSON.stringify({ entry: o.entry })],
      execArgv: [`--max-old-space-size=${o.heapMb}`],
      pipeStderr: true,
    })
    // V8 reports a full heap on stderr and aborts; the exit code alone differs by platform.
    let outOfMemory = false
    worker.stderr?.on("data", (chunk: Buffer) => {
      if (/heap out of memory|allocation failed/i.test(chunk.toString())) outOfMemory = true
      process.stderr.write(chunk)
    })
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
      killProcess(worker)
    }
    const timer = setTimeout(
      () => finish(() => reject(new ExtractError(`Timed out after ${Math.round(limitMs / 1000)}s`))),
      limitMs
    )
    worker.on("message", (reply: Reply) =>
      finish(() => {
        if (reply.ok) resolve(reply.result)
        else if (reply.name === "ExtractError") reject(new ExtractError(reply.message ?? "Couldn't read this file"))
        else reject(Object.assign(new Error("Extraction failed"), { name: reply.name }))
      })
    )
    worker.on("error", (error) => finish(() => reject(error)))
    // "close" rather than "exit": it fires after stderr is drained, so outOfMemory is settled.
    worker.on("close", (code, signal) =>
      finish(() =>
        reject(outOfMemory ? new ExtractError("Too large to read") : new ExtractError(`Reader stopped (exit ${code ?? signal})`))
      )
    )
    // A failed send means the process already died; "close" reports why.
    worker.send({ filePath, ext, opts }, () => {})
  })
}
