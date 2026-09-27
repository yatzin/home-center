import { describe, expect, it } from "vitest"
import { clearThread, loadThread, requestMessages, saveThread, SEND_LIMIT, shouldPersist, threadKey } from "./thread-storage"
import type { HistoryMessage } from "./types"

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
    removeItem: (k: string) => {
      delete data[k]
    },
  }
}

const throwing = {
  getItem: () => {
    throw new Error("SecurityError")
  },
  setItem: () => {
    throw new Error("QuotaExceeded")
  },
  removeItem: () => {
    throw new Error("SecurityError")
  },
}

describe("thread storage", () => {
  it("round-trips per user", () => {
    const s = memory()
    const thread: HistoryMessage[] = [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }]
    saveThread(s, "u1", thread)
    expect(loadThread(s, "u1")).toEqual(thread)
    expect(loadThread(s, "u2")).toEqual([])
    clearThread(s, "u1")
    expect(loadThread(s, "u1")).toEqual([])
  })

  it("keeps a replaced first answer for display but never sends it", () => {
    const s = memory()
    saveThread(s, "u1", [
      { role: "user", content: "vin?" },
      { role: "assistant", content: "VIN is Y", discarded: "VIN is X [T](/assets/vehicles/fake)" },
    ])
    const loaded = loadThread(s, "u1")
    expect(loaded[1]).toEqual({ role: "assistant", content: "VIN is Y", discarded: "VIN is X [T](/assets/vehicles/fake)" })
    expect(requestMessages(loaded)).toEqual([{ role: "user", content: "vin?" }, { role: "assistant", content: "VIN is Y" }])
  })

  it("drops malformed data and junk entries", () => {
    expect(loadThread(memory({ [threadKey("u1")]: "{nope" }), "u1")).toEqual([])
    expect(loadThread(memory({ [threadKey("u1")]: '{"a":1}' }), "u1")).toEqual([])
    const mixed = JSON.stringify([
      { role: "user", content: "ok" },
      { role: "system", content: "evil" },
      { role: "assistant", content: "" },
      { role: "assistant", content: 5 },
      null,
      { role: "assistant", content: "fine", extra: true },
    ])
    expect(loadThread(memory({ [threadKey("u1")]: mixed }), "u1")).toEqual([
      { role: "user", content: "ok" },
      { role: "assistant", content: "fine" },
    ])
  })

  it("survives unavailable storage", () => {
    expect(loadThread(throwing, "u1")).toEqual([])
    expect(() => saveThread(throwing, "u1", [])).not.toThrow()
    expect(() => clearThread(throwing, "u1")).not.toThrow()
    expect(loadThread(null, "u1")).toEqual([])
  })
})

describe("requestMessages", () => {
  it("sends the last 20, starting at a user message, each capped", () => {
    const thread: HistoryMessage[] = Array.from({ length: 60 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: i === 59 ? "x".repeat(9000) : `m${i}`,
    }))
    thread.push({ role: "user", content: "last" })
    const out = requestMessages(thread)
    expect(out.length).toBeLessThanOrEqual(SEND_LIMIT)
    expect(out[0].role).toBe("user")
    expect(out.at(-1)).toEqual({ role: "user", content: "last" })
    expect(out.every((m) => m.content.length <= 8000)).toBe(true)
  })
})

describe("requestMessages limits", () => {
  it("keeps the total within 64,000 chars, starting on a user and ending on the last user message", () => {
    const thread: HistoryMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `${i}`.padEnd(7000, "x"),
    }))
    thread.push({ role: "user", content: "last" })
    const out = requestMessages(thread)
    expect(out.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(64000)
    expect(out[0].role).toBe("user")
    expect(out.at(-1)).toEqual({ role: "user", content: "last" })
  })

  it("merges adjacent same-role messages so roles alternate", () => {
    const out = requestMessages([
      { role: "user", content: "first try" },
      { role: "user", content: "again" },
      { role: "assistant", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "q" },
    ])
    expect(out).toEqual([
      { role: "user", content: "first try\n\nagain" },
      { role: "assistant", content: "a\n\nb" },
      { role: "user", content: "q" },
    ])
  })
})

describe("shouldPersist", () => {
  it("only persists a turn from the current thread generation", () => {
    expect(shouldPersist(3, 3)).toBe(true)
    expect(shouldPersist(3, 4)).toBe(false)
  })
})
