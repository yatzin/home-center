// When the embedding model may be unloaded. Indexing knows when it's done,
// so it unloads at once — unless someone searched recently, in which case a
// follow-up question is likely and the search timer decides. Searches can't
// know whether another is coming, so they keep the model for idleMs.

export type LifecycleDeps = {
  /** A getter when the idle time can change between loads (low memory mode). */
  idleMs: number | (() => number)
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
  const idleMs = () => (typeof d.idleMs === "function" ? d.idleMs() : d.idleMs)
  const searchedRecently = () => lastSearch !== null && d.now() - lastSearch < idleMs()

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
      }, idleMs())
    },
    cancel: clear,
  }
}
