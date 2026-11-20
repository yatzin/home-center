import type { ChildProcess } from "child_process"
import { forkScript, killProcess } from "../fork"
import { createLifecycle } from "./lifecycle"
import type { EmbeddingModel } from "./models"

// Server side of the embedding process (workers/embed-worker.mjs). Starts it
// on first use, sends batches, and kills it when the lifecycle says so — but
// never while a request is in flight. Prefixes are applied here; pooling and
// normalisation happen in the process. Low memory mode is read each time the
// process starts, so a change applies from the next load.

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

export type EmbedderOptions = {
  model: EmbeddingModel
  modelsRoot: string
  workerPath: string
  idleMs: number
  /** Whether to start the process in low memory mode. Default: off. */
  lowMemory?: () => Promise<boolean>
  /** Idle time used instead of idleMs while in low memory mode. */
  lowMemoryIdleMs?: number
  timers?: Timers
}

export function createEmbedder(o: EmbedderOptions): Embedder {
  let worker: ChildProcess | null = null
  let ready: Promise<void> | null = null
  const pending = new Map<number, Pending>()
  let nextId = 0
  let inFlight = 0
  let unloadWanted = false
  let lowMemory = false

  const lifecycle = createLifecycle({
    idleMs: () => (lowMemory && o.lowMemoryIdleMs !== undefined ? Math.min(o.idleMs, o.lowMemoryIdleMs) : o.idleMs),
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
    killProcess(w)
  }

  function spawn(low: boolean): Promise<void> {
    lowMemory = low
    const w = forkScript(o.workerPath, {
      args: [JSON.stringify({ modelsRoot: o.modelsRoot, repo: o.model.repo, pooling: o.model.pooling, lowMemory: low })],
    })
    worker = w
    return new Promise<void>((resolve, reject) => {
      w.on("message", (msg: WorkerMessage) => {
        if (msg.type === "ready") resolve()
        else if (msg.type === "error") {
          // Forget the worker now rather than on its exit event, so loaded()
          // is false as soon as the caller sees the error and a retry starts fresh.
          const error = new EmbedderError(`Model failed to load (${msg.name})`)
          if (worker === w) reset(error)
          reject(error)
        }
        else {
          const p = pending.get(msg.id)
          if (!p) return
          pending.delete(msg.id)
          if (msg.error || !msg.vectors) p.reject(new EmbedderError(`Embedding failed (${msg.error ?? "no output"})`))
          else p.resolve(msg.vectors)
        }
      })
      w.on("error", (e) => {
        const error = new EmbedderError(`Model process crashed (${e.name})`)
        reject(error)
        if (worker === w) reset(error)
        killProcess(w)
      })
      w.on("exit", () => {
        const error = new EmbedderError("Model process stopped")
        reject(error)
        if (worker === w) reset(error)
      })
    })
  }

  function start(): Promise<void> {
    if (ready) return ready
    const p = (async () => spawn((await o.lowMemory?.().catch(() => false)) ?? false))()
    ready = p
    p.catch(() => {
      if (ready === p) ready = null
    })
    return p
  }

  async function run(texts: string[]): Promise<number[][]> {
    inFlight++
    unloadWanted = false
    try {
      await start()
      const w = worker
      if (!w) throw new EmbedderError("Model process stopped")
      const id = nextId++
      return await new Promise<number[][]>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        w.send({ id, texts })
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
