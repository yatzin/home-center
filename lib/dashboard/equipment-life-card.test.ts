import { describe, expect, it } from "vitest"
import {
  LIFE_NEAR,
  lifeAxisMax,
  lifeBulletRows,
  lifeConfigSchema,
  lifeProgress,
  lifeRemaining,
  lifeShowOf,
  rankLife,
  summarizeLife,
  type LifeRow,
} from "./equipment-life-card"

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const today = new Date(Date.UTC(2026, 9, 27, 12)) // localDay: 12:00 UTC

const row = (id: string, pct: number, over: Partial<LifeRow> = {}): LifeRow => ({
  id,
  name: `Item ${id}`,
  pct,
  status: pct >= 1 ? "past" : pct >= LIFE_NEAR ? "near" : "ok",
  monthsLeft: Math.round((1 - pct) * 120),
  years: Math.floor(pct * 10),
  lifeYears: 10,
  replacementCost: null,
  ...over,
})

describe("lifeProgress", () => {
  it("is null without a start date or an expected life", () => {
    expect(lifeProgress({ installDate: null, purchaseDate: null, expectedLifeYears: 10 }, today)).toBeNull()
    expect(lifeProgress({ installDate: utc(2020, 1, 1), purchaseDate: null, expectedLifeYears: null }, today)).toBeNull()
    expect(lifeProgress({ installDate: utc(2020, 1, 1), purchaseDate: null, expectedLifeYears: 0 }, today)).toBeNull()
  })

  it("counts from the install date, else the purchase date", () => {
    const a = lifeProgress({ installDate: utc(2021, 10, 27), purchaseDate: utc(2010, 1, 1), expectedLifeYears: 10 }, today)
    expect(a?.pct).toBeCloseTo(0.5, 2)
    const b = lifeProgress({ installDate: null, purchaseDate: utc(2021, 10, 27), expectedLifeYears: 10 }, today)
    expect(b?.pct).toBeCloseTo(0.5, 2)
  })

  it("is ok below 80%, near from 80%, past from 100%", () => {
    const at = (years: number, months = 0) =>
      lifeProgress({ installDate: new Date(Date.UTC(2026 - years, 9 - months, 27)), purchaseDate: null, expectedLifeYears: 10 }, today)
    expect(at(7)?.status).toBe("ok")
    expect(at(8, 6)?.status).toBe("near")
    expect(at(9)?.status).toBe("near")
    expect(at(10)?.status).toBe("past")
    expect(at(10)?.pct).toBe(1)
    expect(at(14)?.status).toBe("past")
    expect(at(14)?.pct).toBeCloseTo(1.4, 2)
  })

  it("is 0 for a future start and never negative", () => {
    const p = lifeProgress({ installDate: utc(2027, 3, 1), purchaseDate: null, expectedLifeYears: 10 }, today)
    expect(p?.pct).toBe(0)
    expect(p?.status).toBe("ok")
  })

  it("handles a Feb 29 start", () => {
    const p = lifeProgress({ installDate: utc(2020, 2, 29), purchaseDate: null, expectedLifeYears: 1 }, utc(2021, 2, 28))
    expect(p?.status).toBe("past") // the life ends on Feb 28 in a year without a 29th
  })

  it("reports whole years and whole months left (negative once over)", () => {
    const p = lifeProgress({ installDate: utc(2021, 10, 27), purchaseDate: null, expectedLifeYears: 10 }, today)
    expect(p?.years).toBe(5)
    expect(p?.monthsLeft).toBe(60)
    const over = lifeProgress({ installDate: utc(2015, 7, 27), purchaseDate: null, expectedLifeYears: 10 }, today)
    expect(over?.monthsLeft).toBe(-15)
    const part = lifeProgress({ installDate: utc(2016, 12, 10), purchaseDate: null, expectedLifeYears: 10 }, today)
    expect(part?.monthsLeft).toBe(1) // 5 weeks to go: one whole month
  })

  it("does not depend on the machine's time zone (stored dates are UTC days)", () => {
    const p = lifeProgress({ installDate: utc(2016, 10, 27), purchaseDate: null, expectedLifeYears: 10 }, today)
    expect(p?.status).toBe("past")
    expect(p?.monthsLeft).toBe(0)
  })
})

describe("lifeRemaining", () => {
  it("speaks in years when there are 12 or more months, else months", () => {
    expect(lifeRemaining(60)).toBe("5 yr left")
    expect(lifeRemaining(12)).toBe("1 yr left")
    expect(lifeRemaining(23)).toBe("1 yr left")
    expect(lifeRemaining(7)).toBe("7 mo left")
    expect(lifeRemaining(1)).toBe("1 mo left")
  })
  it("says so when it ends this month or is over", () => {
    expect(lifeRemaining(0)).toBe("Ends this month")
    expect(lifeRemaining(-1)).toBe("1 mo over")
    expect(lifeRemaining(-15)).toBe("1 yr over")
    expect(lifeRemaining(-40)).toBe("3 yr over")
  })
})

describe("rankLife", () => {
  const rows = [row("a", 0.3), row("b", 1.2), row("c", 0.85), row("d", 1.2, { name: "Alpha" })]
  it("puts the most worn first, ties by name then id", () => {
    expect(rankLife(rows, "all", 10).map((r) => r.id)).toEqual(["d", "b", "c", "a"])
  })
  it("attention keeps only near and past", () => {
    expect(rankLife(rows, "attention", 10).map((r) => r.id)).toEqual(["d", "b", "c"])
  })
  it("caps the count and never mutates its input", () => {
    const copy = [...rows]
    expect(rankLife(rows, "all", 2)).toHaveLength(2)
    expect(rows).toEqual(copy)
  })
  it("is empty for no rows", () => {
    expect(rankLife([], "all", 5)).toEqual([])
  })
})

describe("summarizeLife", () => {
  it("counts each status and totals the replacement cost of what is near or past", () => {
    const s = summarizeLife([
      row("a", 0.3, { replacementCost: 900 }),
      row("b", 1.2, { replacementCost: 1200.5 }),
      row("c", 0.85, { replacementCost: 300 }),
      row("d", 1.5, { replacementCost: null }),
    ])
    expect(s).toMatchObject({ tracked: 4, past: 2, near: 1, ok: 1, replacement: 1500.5, replacementKnown: 2 })
    expect(s.mostWorn?.id).toBe("d")
  })
  it("is all zero for nothing tracked", () => {
    expect(summarizeLife([])).toEqual({ tracked: 0, past: 0, near: 0, ok: 0, replacement: 0, replacementKnown: 0, mostWorn: null })
  })
})

describe("lifeAxisMax", () => {
  it("is 1 while nothing is past its life (the end marker is the right edge)", () => {
    expect(lifeAxisMax([row("a", 0.4), row("b", 0.99)])).toBe(1)
    expect(lifeAxisMax([])).toBe(1)
  })
  it("grows to the most worn item, but no further than 2", () => {
    expect(lifeAxisMax([row("a", 1.3)])).toBe(1.3)
    expect(lifeAxisMax([row("a", 4)])).toBe(2)
  })
})

describe("lifeBulletRows", () => {
  it("fits whole rows, never more than there are", () => {
    expect(lifeBulletRows(100, 30, 8)).toBe(3)
    expect(lifeBulletRows(100, 30, 2)).toBe(2)
    expect(lifeBulletRows(0, 30, 5)).toBe(0)
    expect(lifeBulletRows(20, 30, 5)).toBe(0)
  })
})

describe("config", () => {
  it("accepts all/attention or nothing, rejects the rest", () => {
    expect(lifeConfigSchema.safeParse({}).success).toBe(true)
    expect(lifeConfigSchema.safeParse({ show: "attention" }).success).toBe(true)
    expect(lifeConfigSchema.safeParse({ show: "nope" }).success).toBe(false)
  })
  it("defaults to all", () => {
    expect(lifeShowOf({})).toBe("all")
    expect(lifeShowOf({ show: "attention" })).toBe("attention")
    expect(lifeShowOf({ show: 3 })).toBe("all")
  })
})
