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
