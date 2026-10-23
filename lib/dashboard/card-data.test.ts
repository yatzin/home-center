import { describe, expect, it } from "vitest"
import type { CardInstance } from "./layout"
import type { CardResult } from "./loaders"
import {
  cardsNeedingData,
  configsOf,
  entriesOf,
  isMissingData,
  markLoadFailed,
  mergeLoaded,
  needsData,
  sameConfig,
  withData,
  type LoadedEntry,
} from "./card-data"

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
  it("adds fresh cards, replaces reloaded ones and keeps ones the fresh set left out", () => {
    const prev = entriesOf([ok("a", "properties", { limit: 7 }), ok("gone", "vehicles", {})], 3)
    const next = mergeLoaded(prev, [ok("a", "properties", { limit: 7, itemId: "p1" }), ok("new", "reminders", { windowDays: 14 })], 4)
    expect([...next.keys()].sort()).toEqual(["a", "gone", "new"])
    expect(next.get("a")).toMatchObject({ revision: 4, result: { config: { limit: 7, itemId: "p1" } } })
    expect(next.get("gone")).toBe(prev.get("gone"))
    // Pure: the old map is untouched.
    expect(prev.get("a")?.result.config).toEqual({ limit: 7 })
    expect(prev.has("new")).toBe(false)
  })

  it("never goes back in revision: older props arriving after a newer load are ignored for that card", () => {
    // The editor loaded revision 6 (card b just added, a reconfigured)...
    const loaded = mergeLoaded(entriesOf([ok("a", "reminders", { windowDays: 30 })], 5), [
      ok("a", "reminders", { windowDays: 14 }, "new"),
      ok("b", "intake", {}, "b6"),
    ], 6)
    // ...then a stalled refresh lands with revision 5 props.
    const late = mergeLoaded(loaded, [ok("a", "reminders", { windowDays: 30 }, "old"), ok("c", "records", {}, "c5")], 5)
    expect(late.get("a")).toMatchObject({ revision: 6, result: { data: "new" } })
    expect(late.get("b")?.result).toMatchObject({ data: "b6" })
    // A card it had not seen yet is still taken.
    expect(late.get("c")?.result).toMatchObject({ data: "c5" })
    const cards: CardInstance[] = [{ id: "a", type: "reminders", config: { windowDays: 14 } }]
    expect(needsData(withData(cards, late))).toBe(false)
  })

  it("two quick config changes: a load for the first never replaces data for the current one", () => {
    const current = configsOf([{ id: "a", type: "reminders", config: { windowDays: 7 } }])
    // Data for the current config (7) arrived first, from revision 8...
    const prev = mergeLoaded(entriesOf([ok("a", "reminders", { windowDays: 30 })], 6), [ok("a", "reminders", { windowDays: 7 }, "7d")], 8, current)
    // ...then the slower load for the first change (14) lands, even from the same or a newer revision read.
    const next = mergeLoaded(prev, [ok("a", "reminders", { windowDays: 14 }, "14d")], 8, current)
    expect(next.get("a")?.result).toMatchObject({ data: "7d" })
    // Without current data, a closer-but-not-current result still replaces older data (it stays "updating").
    const fromOld = mergeLoaded(entriesOf([ok("a", "reminders", { windowDays: 30 })], 6), [ok("a", "reminders", { windowDays: 14 }, "14d")], 7, current)
    expect(fromOld.get("a")?.result).toMatchObject({ data: "14d" })
    expect(withData([{ id: "a", type: "reminders", config: { windowDays: 7 } }], fromOld)[0]).toMatchObject({ updating: true })
  })

  it("replaces a failed load whatever its revision", () => {
    const failed = markLoadFailed(new Map(), [{ id: "a", type: "intake", config: {} }], 9)
    const next = mergeLoaded(failed, [ok("a", "intake", {}, "fine")], 9)
    expect(next.get("a")).toMatchObject({ result: { data: "fine" } })
    expect(next.get("a")?.loadFailed).toBeUndefined()
  })
})

describe("markLoadFailed", () => {
  const cards: CardInstance[] = [
    { id: "new", type: "intake", config: {} },
    { id: "changed", type: "reminders", config: { windowDays: 14 } },
    { id: "fine", type: "records", config: {} },
  ]
  const prev = entriesOf([ok("changed", "reminders", { windowDays: 30 }), ok("fine", "records", {})], 4)

  it("shows the error state on cards without current data, keeps current data, and asks for data again", () => {
    const next = markLoadFailed(prev, cards, 5)
    const out = withData(cards, next)
    expect(out[0]).toMatchObject({ status: "error", loadFailed: true })
    expect(out[1]).toMatchObject({ status: "error", loadFailed: true })
    expect(out[2]).toMatchObject({ status: "ok", updating: false })
    expect(cardsNeedingData(out)).toEqual(["new", "changed"])
  })
})

describe("withData", () => {
  const cards: CardInstance[] = [
    { id: "a", type: "properties", config: { limit: 7 } },
    { id: "b", type: "reminders", config: { windowDays: 14 } },
    { id: "c", type: "intake", config: {} },
  ]

  it("pairs each card with its data, marking new cards loading and changed configs updating", () => {
    const loaded = entriesOf([ok("a", "properties", { limit: 7 }), ok("b", "reminders", { windowDays: 30 })], 1)
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
    const out = withData([cards[0]], entriesOf([ok("a", "vehicles", {})], 1))
    expect(out[0].status).toBe("loading")
  })

  it("needs no data when everything is loaded for the current config", () => {
    const loaded: Map<string, LoadedEntry> = entriesOf(
      cards.map((c) => ok(c.id, c.type, c.config)),
      1,
    )
    expect(needsData(withData(cards, loaded))).toBe(false)
    expect(cardsNeedingData(withData(cards, loaded))).toEqual([])
  })

  it("a loader error for the current config needs nothing either", () => {
    const err: CardResult = { id: "c", type: "intake", config: {}, status: "error" }
    const out = withData([cards[2]], entriesOf([err], 1))
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
