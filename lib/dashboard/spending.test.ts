import { describe, expect, it } from "vitest"
import type { CostRow } from "@/lib/costs"
import { chartable, monthlyAverage, spendDelta, spendingByCategory, spendingSummary, spendTrend, spendWindow } from "./spending"

// Record dates are UTC midnight (as stored); NOW is the viewer's local clock. The cost helpers bucket by UTC fields.
const NOW = new Date(2026, 9, 22, 12, 0, 0) // 22 Oct 2026

let seq = 0
const row = (date: Date, cost: number, category: CostRow["category"] = "REPAIR"): CostRow => ({
  id: `r${++seq}`,
  assetId: "a1",
  assetType: "PROPERTY",
  date,
  cost,
  category,
  vendor: null,
  title: "x",
  mileageAtService: null,
})

describe("spendingByCategory", () => {
  it("returns [] for no rows", () => {
    expect(spendingByCategory([], "ytd", NOW)).toEqual([])
    expect(spendingByCategory([], "12m", NOW)).toEqual([])
  })

  it("totals each category, largest first", () => {
    const rows = [
      row(new Date(Date.UTC(2026, 1, 3)), 100, "REPAIR"),
      row(new Date(Date.UTC(2026, 2, 3)), 50.1, "ROUTINE"),
      row(new Date(Date.UTC(2026, 3, 3)), 200.2, "ROUTINE"),
      row(new Date(Date.UTC(2026, 4, 3)), 25, "PARTS"),
    ]
    expect(spendingByCategory(rows, "ytd", NOW)).toEqual([
      { category: "ROUTINE", total: 250.3 },
      { category: "REPAIR", total: 100 },
      { category: "PARTS", total: 25 },
    ])
  })

  it("orders equal totals by category name", () => {
    const rows = [
      row(new Date(Date.UTC(2026, 1, 3)), 40, "UPGRADE"),
      row(new Date(Date.UTC(2026, 1, 4)), 40, "PARTS"),
      row(new Date(Date.UTC(2026, 1, 5)), 40, "INSPECTION"),
    ]
    expect(spendingByCategory(rows, "ytd", NOW).map((c) => c.category)).toEqual(["INSPECTION", "PARTS", "UPGRADE"])
  })

  it("groups rows without a category as UNCATEGORIZED", () => {
    expect(spendingByCategory([row(new Date(Date.UTC(2026, 5, 1)), 12, null)], "ytd", NOW)).toEqual([
      { category: "UNCATEGORIZED", total: 12 },
    ])
  })

  it("ytd covers 1 January through the end of today", () => {
    const rows = [
      row(new Date(Date.UTC(2025, 11, 31, 23, 59)), 1, "REPAIR"), // last year: out
      row(new Date(Date.UTC(2026, 0, 1, 0, 0)), 2, "REPAIR"), // first instant: in
      row(new Date(Date.UTC(2026, 9, 22, 23, 0)), 4, "REPAIR"), // later today: in
      row(new Date(Date.UTC(2026, 9, 23, 0, 0)), 8, "REPAIR"), // tomorrow: out
    ]
    expect(spendingByCategory(rows, "ytd", NOW)).toEqual([{ category: "REPAIR", total: 6 }])
  })

  it("12m covers the twelve calendar months the trend chart shows", () => {
    const rows = [
      row(new Date(Date.UTC(2025, 9, 31)), 1, "REPAIR"), // Oct 2025: before the window
      row(new Date(Date.UTC(2025, 10, 1)), 2, "REPAIR"), // 1 Nov 2025: first day in
      row(new Date(Date.UTC(2026, 9, 22)), 4, "REPAIR"), // today: in
      row(new Date(Date.UTC(2026, 9, 25)), 8, "REPAIR"), // future: out
    ]
    expect(spendingByCategory(rows, "12m", NOW)).toEqual([{ category: "REPAIR", total: 6 }])
    // The same rows under ytd only see 2026.
    expect(spendingByCategory(rows, "ytd", NOW)).toEqual([{ category: "REPAIR", total: 4 }])
  })

  it("drops categories that net to zero or less (refunds) so shares stay meaningful", () => {
    const rows = [
      row(new Date(Date.UTC(2026, 1, 1)), 100, "REPAIR"),
      row(new Date(Date.UTC(2026, 1, 2)), 30, "PARTS"),
      row(new Date(Date.UTC(2026, 1, 3)), -30, "PARTS"),
      row(new Date(Date.UTC(2026, 1, 4)), -20, "ROUTINE"),
      row(new Date(Date.UTC(2026, 1, 5)), 0, "LAB"),
      row(new Date(Date.UTC(2026, 1, 6)), 150, "UPGRADE"),
      row(new Date(Date.UTC(2026, 1, 7)), -50, "UPGRADE"),
    ]
    expect(spendingByCategory(rows, "ytd", NOW)).toEqual([
      { category: "REPAIR", total: 100 },
      { category: "UPGRADE", total: 100 },
    ])
  })
})

describe("spendWindow", () => {
  it("shifts the same window back a year", () => {
    expect(spendWindow("ytd", NOW, 1)).toEqual({ start: new Date(Date.UTC(2025, 0, 1)), end: new Date(Date.UTC(2025, 9, 22, 23, 59, 59, 999)) })
    expect(spendWindow("12m", NOW, 1)).toEqual({ start: new Date(Date.UTC(2024, 10, 1)), end: new Date(Date.UTC(2025, 9, 22, 23, 59, 59, 999)) })
  })
})

describe("spendingSummary", () => {
  it("compares the period with the same window a year earlier", () => {
    const rows = [row(new Date(Date.UTC(2025, 2, 1)), 100), row(new Date(Date.UTC(2025, 11, 1)), 999), row(new Date(Date.UTC(2026, 2, 1)), 150)]
    expect(spendingSummary(rows, "ytd", NOW)).toEqual({ total: 150, priorTotal: 100, delta: 0.5 })
  })

  it("has no delta when nothing was spent in the earlier window", () => {
    expect(spendingSummary([row(new Date(Date.UTC(2026, 2, 1)), 150)], "ytd", NOW)).toEqual({ total: 150, priorTotal: 0, delta: null })
    expect(spendingSummary([], "12m", NOW)).toEqual({ total: 0, priorTotal: 0, delta: null })
  })

  it("12m compares with the twelve months before", () => {
    const rows = [row(new Date(Date.UTC(2024, 11, 1)), 200), row(new Date(Date.UTC(2026, 0, 1)), 100)]
    expect(spendingSummary(rows, "12m", NOW)).toEqual({ total: 100, priorTotal: 200, delta: -0.5 })
  })
})

describe("spendTrend", () => {
  it("always spans twelve months ending in the current one, with the prior year aligned", () => {
    const rows = [row(new Date(Date.UTC(2025, 10, 5)), 10), row(new Date(Date.UTC(2024, 10, 5)), 7), row(new Date(Date.UTC(2026, 9, 1)), 3)]
    const { points, prior } = spendTrend(rows, NOW)
    expect(points).toHaveLength(12)
    expect(points[0].key).toBe("2025-10")
    expect(points[11].key).toBe("2026-9")
    expect(points[0].total).toBe(10)
    expect(points[11].total).toBe(3)
    expect(prior[0]).toBe(7)
  })

  it("is all zeros with no rows", () => {
    const { points, prior } = spendTrend([], NOW)
    expect(points.every((p) => p.total === 0)).toBe(true)
    expect(prior.every((v) => v === 0)).toBe(true)
  })
})

describe("chartable", () => {
  it("needs at least two non-zero points", () => {
    expect(chartable([])).toBe(false)
    expect(chartable([0, 0, 5, 0])).toBe(false)
    expect(chartable([0, 3, 5])).toBe(true)
  })
  it("counts only positive points: a net-refund month is not spending to chart", () => {
    expect(chartable([-2, 4])).toBe(false)
    expect(chartable([-2, 4, 0, 1])).toBe(true)
  })
})

describe("spendDelta", () => {
  it("rounds to a whole percent with a direction", () => {
    expect(spendDelta(0.124)).toEqual({ direction: "up", percent: 12 })
    expect(spendDelta(-0.5)).toEqual({ direction: "down", percent: 50 })
    expect(spendDelta(12.345)).toEqual({ direction: "up", percent: 1235 })
  })
  it("calls a change that rounds to 0% flat, either way", () => {
    expect(spendDelta(0)).toEqual({ direction: "flat", percent: 0 })
    expect(spendDelta(0.004)).toEqual({ direction: "flat", percent: 0 })
    expect(spendDelta(-0.004)).toEqual({ direction: "flat", percent: 0 })
  })
})

describe("monthlyAverage", () => {
  it("averages over the twelve months when history covers them", () => {
    const rows = [row(new Date(Date.UTC(2024, 0, 1)), 1), row(new Date(Date.UTC(2026, 9, 1)), 120)]
    const { points } = spendTrend(rows, NOW)
    expect(monthlyAverage(points, rows, NOW)).toBe(10)
  })

  it("averages only over months since the first record when history is shorter", () => {
    const rows = [row(new Date(Date.UTC(2026, 7, 10)), 30), row(new Date(Date.UTC(2026, 9, 1)), 60)]
    const { points } = spendTrend(rows, NOW)
    // August, September, October.
    expect(monthlyAverage(points, rows, NOW)).toBe(30)
  })

  it("is 0 with no rows", () => {
    expect(monthlyAverage(spendTrend([], NOW).points, [], NOW)).toBe(0)
  })
})
