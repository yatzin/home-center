import { describe, expect, it } from "vitest"
import type { CardInstance } from "./layout"
import type { CardResult } from "./loaders"
import { cardsNeedingData, isMissingData, mergeLoaded, needsData, sameConfig, withData } from "./card-data"

const ok = (id: string, type: string, config: Record<string, unknown>, data: unknown = { n: 1 }): CardResult => ({
  id,
  type,
  config,
  status: "ok",
  data,
})

describe("sameConfig", () => {
  it("ignores key order and undefined values", () => {
    expect(sameConfig({ a: 1, b: "x" }, { b: "x", a: 1 })).toBe(true)
    expect(sameConfig({ a: 1, itemId: undefined }, { a: 1 })).toBe(true)
    expect(sameConfig({}, {})).toBe(true)
  })

  it("sees a changed, added or removed value", () => {
    expect(sameConfig({ windowDays: 30 }, { windowDays: 14 })).toBe(false)
    expect(sameConfig({ limit: 7 }, { limit: 7, itemId: "p1" })).toBe(false)
    expect(sameConfig({ range: "ytd" }, {})).toBe(false)
    expect(sameConfig({ a: 1 }, { a: "1" })).toBe(false)
  })
})

describe("mergeLoaded", () => {
  it("adds fresh cards, replaces reloaded ones and keeps ones the refresh left out", () => {
    const prev = new Map([
      ["a", ok("a", "properties", { limit: 7 })],
      ["gone", ok("gone", "vehicles", {})],
    ])
    const next = mergeLoaded(prev, [ok("a", "properties", { limit: 7, itemId: "p1" }), ok("new", "reminders", { windowDays: 14 })])
    expect([...next.keys()].sort()).toEqual(["a", "gone", "new"])
    expect(next.get("a")?.config).toEqual({ limit: 7, itemId: "p1" })
    expect(next.get("gone")).toBe(prev.get("gone"))
    // Pure: the old map is untouched.
    expect(prev.get("a")?.config).toEqual({ limit: 7 })
    expect(prev.has("new")).toBe(false)
  })
})

describe("withData", () => {
  const cards: CardInstance[] = [
    { id: "a", type: "properties", config: { limit: 7 } },
    { id: "b", type: "reminders", config: { windowDays: 14 } },
    { id: "c", type: "intake", config: {} },
  ]

  it("pairs each card with its data, marking new cards loading and changed configs updating", () => {
    const loaded = new Map([
      ["a", ok("a", "properties", { limit: 7 })],
      ["b", ok("b", "reminders", { windowDays: 30 })],
    ])
    const out = withData(cards, loaded)
    expect(out.map((c) => c.id)).toEqual(["a", "b", "c"])
    expect(out[0]).toMatchObject({ status: "ok", updating: false })
    // Stale data for the old config: shown, marked updating, with the config it was loaded for.
    expect(out[1]).toMatchObject({ status: "ok", updating: true, config: { windowDays: 30 } })
    expect(out[2]).toEqual({ id: "c", type: "intake", config: {}, status: "loading" })
    expect(needsData(out)).toBe(true)
    expect(cardsNeedingData(out)).toEqual(["b", "c"])
  })

  it("treats data loaded for another type under the same id as missing", () => {
    const out = withData([cards[0]], new Map([["a", ok("a", "vehicles", {})]]))
    expect(out[0].status).toBe("loading")
  })

  it("needs no data when everything is loaded for the current config", () => {
    const loaded = new Map(cards.map((c) => [c.id, ok(c.id, c.type, c.config)]))
    expect(needsData(withData(cards, loaded))).toBe(false)
    expect(cardsNeedingData(withData(cards, loaded))).toEqual([])
  })

  it("an errored card for the current config needs nothing either", () => {
    const err: CardResult = { id: "c", type: "intake", config: {}, status: "error" }
    const out = withData([cards[2]], new Map([["c", err]]))
    expect(out[0]).toMatchObject({ status: "error", updating: false })
    expect(needsData(out)).toBe(false)
  })
})

describe("isMissingData", () => {
  it("is true only for { missing: true }", () => {
    expect(isMissingData({ missing: true })).toBe(true)
    expect(isMissingData({ missing: false, items: [] })).toBe(false)
    expect(isMissingData(null)).toBe(false)
    expect(isMissingData("missing")).toBe(false)
    expect(isMissingData(undefined)).toBe(false)
  })
})
