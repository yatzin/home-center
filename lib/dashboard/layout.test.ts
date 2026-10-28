import { describe, expect, it } from "vitest"
import {
  LARGE_COLS,
  LAYOUT_FORMAT,
  PHONE_COLS,
  parseLayout,
  repairLayout,
  validateLayout,
  type CardLimits,
  type DashboardLayout,
} from "./layout"

const known: ReadonlyMap<string, CardLimits> = new Map([
  ["a", { min: { w: 2, h: 1 }, max: { w: 6, h: 4 }, default: { w: 4, h: 2 } }],
  ["b", { min: { w: 1, h: 1 }, max: { w: 12, h: 8 }, default: { w: 3, h: 2 } }],
])

const card = (id: string, type = "a") => ({ id, type, config: {} })

function valid(): DashboardLayout {
  return {
    format: LAYOUT_FORMAT,
    cards: [card("c1"), card("c2", "b")],
    large: [
      { id: "c1", x: 0, y: 0, w: 4, h: 2 },
      { id: "c2", x: 4, y: 0, w: 3, h: 2 },
    ],
    phone: null,
  }
}

describe("parseLayout", () => {
  it("accepts a valid layout", () => {
    expect(parseLayout(valid())).toEqual(valid())
  })
  it("rejects garbage", () => {
    for (const raw of [null, undefined, 5, "x", [], {}, { format: 1 }]) expect(parseLayout(raw)).toBeNull()
  })
  it("rejects a wrong format", () => {
    expect(parseLayout({ ...valid(), format: 2 })).toBeNull()
  })
  it("rejects a malformed placement", () => {
    const l = { ...valid(), large: [{ id: "c1", x: "0", y: 0, w: 1, h: 1 }] }
    expect(parseLayout(l)).toBeNull()
  })
})

describe("repairLayout", () => {
  it("leaves a valid layout deep-equal", () => {
    const l = valid()
    expect(repairLayout(l, known)).toEqual(valid())
    expect(validateLayout(l, known)).toBeNull()
  })
  it("drops an unknown-type card and its placement", () => {
    const l = valid()
    l.cards.push(card("c3", "zzz"))
    l.large.push({ id: "c3", x: 8, y: 0, w: 2, h: 2 })
    const r = repairLayout(l, known)
    expect(r.cards.map((c) => c.id)).toEqual(["c1", "c2"])
    expect(r.large.map((p) => p.id)).toEqual(["c1", "c2"])
  })
  it("drops orphan placements", () => {
    const l = valid()
    l.large.push({ id: "ghost", x: 8, y: 0, w: 2, h: 2 })
    expect(repairLayout(l, known).large.map((p) => p.id)).toEqual(["c1", "c2"])
  })
  it("adds a missing placement at the bottom with the default size", () => {
    const l = valid()
    l.cards.push(card("c3"))
    const p = repairLayout(l, known).large.find((q) => q.id === "c3")
    expect(p).toEqual({ id: "c3", x: 0, y: 2, w: 4, h: 2 })
  })
  it("clamps w above max and below min", () => {
    const l = valid()
    l.large[0] = { id: "c1", x: 0, y: 0, w: 10, h: 9 }
    expect(repairLayout(l, known).large[0]).toMatchObject({ w: 6, h: 4 })
    l.large[0] = { id: "c1", x: 0, y: 0, w: 1, h: 1 }
    expect(repairLayout(l, known).large[0]).toMatchObject({ w: 2 })
  })
  it("moves a card whose x + w exceeds the columns back inside", () => {
    const l = valid()
    l.large[1] = { id: "c2", x: 11, y: 0, w: 3, h: 2 }
    const p = repairLayout(l, known).large[1]
    expect(p.x + p.w).toBeLessThanOrEqual(LARGE_COLS)
  })
  it("separates overlapping placements", () => {
    const l = valid()
    l.large[1] = { id: "c2", x: 1, y: 0, w: 3, h: 2 }
    expect(validateLayout(repairLayout(l, known), known)).toBeNull()
  })
  it("preserves phone: null", () => {
    expect(repairLayout(valid(), known).phone).toBeNull()
  })
  it("repairs a phone layout within PHONE_COLS and appends missing cards", () => {
    const l = valid()
    l.phone = [{ id: "c1", x: 1, y: 0, w: 2, h: 2 }]
    const r = repairLayout(l, known)
    expect(validateLayout(r, known)).toBeNull()
    const ph = r.phone!
    expect(ph.map((p) => p.id).sort()).toEqual(["c1", "c2"])
    for (const p of ph) expect(p.x + p.w).toBeLessThanOrEqual(PHONE_COLS)
    expect(ph.find((p) => p.id === "c2")).toMatchObject({ x: 0, y: 2, w: 2 })
  })
  it("dedupes duplicate card and placement ids", () => {
    const l = valid()
    l.cards.push(card("c1"))
    l.large.push({ id: "c1", x: 8, y: 0, w: 2, h: 2 })
    const r = repairLayout(l, known)
    expect(r.cards).toHaveLength(2)
    expect(r.large).toHaveLength(2)
    expect(validateLayout(r, known)).toBeNull()
  })
  it("keeps intentional gaps of up to 5 rows (no compaction)", () => {
    const l = valid()
    l.large[1] = { id: "c2", x: 4, y: 5, w: 3, h: 2 }
    l.phone = [
      { id: "c1", x: 0, y: 0, w: 2, h: 2 },
      { id: "c2", x: 0, y: 6, w: 2, h: 2 },
    ]
    expect(repairLayout(l, known)).toEqual(l)
    expect(validateLayout(l, known)).toBeNull()
  })
  it("pulls a card with a gap over 5 rows up to the cap", () => {
    const l = valid()
    l.large[1] = { id: "c2", x: 0, y: 30, w: 3, h: 2 }
    const r = repairLayout(l, known)
    expect(r.large[1]).toEqual({ id: "c2", x: 0, y: 7, w: 3, h: 2 })
    expect(validateLayout(r, known)).toBeNull()
  })
  it("survives NaN, Infinity and huge values", () => {
    const l = valid()
    l.large = [
      { id: "c1", x: NaN, y: Infinity, w: -Infinity, h: 1e300 },
      { id: "c2", x: 0.5, y: -3, w: NaN, h: NaN },
    ]
    l.phone = [{ id: "c1", x: NaN, y: 1e300, w: 1e300, h: NaN }]
    const r = repairLayout(l, known)
    expect(validateLayout(r, known)).toBeNull()
  })
})

describe("validateLayout", () => {
  it("returns null for a valid layout", () => {
    expect(validateLayout(valid(), known)).toBeNull()
  })
  it("reports duplicate card ids", () => {
    const l = valid()
    l.cards.push(card("c1"))
    expect(validateLayout(l, known)).toMatch(/duplicate/i)
  })
  it("reports duplicate placement ids", () => {
    const l = valid()
    l.large.push({ id: "c1", x: 8, y: 0, w: 2, h: 2 })
    expect(validateLayout(l, known)).toMatch(/duplicate/i)
  })
  it("reports unknown types", () => {
    const l = valid()
    l.cards.push(card("c3", "zzz"))
    expect(validateLayout(l, known)).toMatch(/unknown/i)
  })
  it("reports out-of-bounds and non-integer values", () => {
    for (const bad of [
      { id: "c1", x: 10, y: 0, w: 4, h: 2 },
      { id: "c1", x: 0, y: 0, w: 0, h: 2 },
      { id: "c1", x: 0, y: 0, w: 4, h: 0 },
      { id: "c1", x: 0.5, y: 0, w: 4, h: 2 },
      { id: "c1", x: 0, y: NaN, w: 4, h: 2 },
      { id: "c1", x: 0, y: 0, w: 4, h: Infinity },
      { id: "c1", x: 0, y: 20_000, w: 4, h: 2 },
      { id: "c1", x: 0, y: 0, w: 4, h: 20_000 },
    ]) {
      const l = valid()
      l.large[0] = bad
      expect(validateLayout(l, known), JSON.stringify(bad)).not.toBeNull()
    }
  })
  it("reports overlap, orphan and missing placements", () => {
    const o = valid()
    o.large[1] = { id: "c2", x: 1, y: 0, w: 3, h: 2 }
    expect(validateLayout(o, known)).toMatch(/overlap/i)
    const orphan = valid()
    orphan.large.push({ id: "ghost", x: 8, y: 0, w: 2, h: 2 })
    expect(validateLayout(orphan, known)).not.toBeNull()
    const missing = valid()
    missing.large.pop()
    expect(validateLayout(missing, known)).not.toBeNull()
  })
  it("reports a gap of more than 5 empty rows above a card", () => {
    const l = valid()
    l.large[1] = { id: "c2", x: 0, y: 8, w: 3, h: 2 }
    expect(validateLayout(l, known)).toMatch(/empty rows/i)
    l.large[1] = { id: "c2", x: 0, y: 7, w: 3, h: 2 }
    expect(validateLayout(l, known)).toBeNull()
  })
  it("reports sizes outside card limits", () => {
    const l = valid()
    l.large[0] = { id: "c1", x: 0, y: 0, w: 8, h: 2 }
    expect(validateLayout(l, known)).not.toBeNull()
  })
})
