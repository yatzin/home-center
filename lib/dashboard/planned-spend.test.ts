import { describe, expect, it } from "vitest"
import type { Occurrence } from "@/lib/forecast"
import { cardType, limitsMap, phoneSizePresets, tierOf } from "./card-types"
import {
  plannedArrangement,
  plannedBarDensity,
  plannedChartable,
  plannedConfigSchema,
  plannedHorizonOf,
  plannedListRows,
  plannedMonths,
  plannedStats,
  fitText,
  type PlannedMonth,
} from "./planned-spend"

const noon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12))
const from = noon(2026, 10, 27)

const occ = (o: Partial<Occurrence> & { date: Date }): Occurrence => ({
  scheduleId: "s1",
  title: "Task",
  assetType: "PROPERTY",
  assetId: "p1",
  cost: 100,
  ...o,
})

describe("plannedHorizonOf", () => {
  it("is the month count (1 to 24), else an older config's 6, else 12", () => {
    expect(plannedHorizonOf({})).toBe(12)
    expect(plannedHorizonOf({ months: 3 })).toBe(3)
    expect(plannedHorizonOf({ months: 24 })).toBe(24)
    expect(plannedHorizonOf({ months: 1 })).toBe(1)
    for (const months of [0, 25, 2.5, "6", null]) expect(plannedHorizonOf({ months })).toBe(12)
    expect(plannedHorizonOf({ horizon: "12" })).toBe(12)
    expect(plannedHorizonOf({ horizon: "6" })).toBe(6)
    expect(plannedHorizonOf({ horizon: 6 })).toBe(12)
    expect(plannedHorizonOf({ horizon: "3" })).toBe(12)
    expect(plannedHorizonOf({ months: 9, horizon: "6" })).toBe(9)
  })
})

describe("plannedConfigSchema", () => {
  it("accepts a month count from 1 to 24, an older 6 or 12 (as text) and nothing set", () => {
    expect(plannedConfigSchema.safeParse({}).success).toBe(true)
    expect(plannedConfigSchema.safeParse({ months: 1 }).success).toBe(true)
    expect(plannedConfigSchema.safeParse({ months: 24 }).success).toBe(true)
    expect(plannedConfigSchema.safeParse({ horizon: "6" }).success).toBe(true)
    expect(plannedConfigSchema.safeParse({ horizon: "12" }).success).toBe(true)
  })
  it("rejects other horizons and types", () => {
    for (const months of [0, 25, 1.5, "6"]) expect(plannedConfigSchema.safeParse({ months }).success).toBe(false)
    expect(plannedConfigSchema.safeParse({ horizon: "3" }).success).toBe(false)
    expect(plannedConfigSchema.safeParse({ horizon: 12 }).success).toBe(false)
    expect(plannedConfigSchema.safeParse({ horizon: "" }).success).toBe(false)
  })
})

describe("plannedMonths", () => {
  it("is exactly `months` entries from the current month, zero-filled, totals equal forecastByMonth", () => {
    const m = plannedMonths([occ({ date: noon(2026, 10, 30), cost: 40.1 }), occ({ date: noon(2027, 1, 5), cost: 0.2 })], from, 12)
    expect(m).toHaveLength(12)
    expect(m[0].key).toBe("2026-10")
    expect(m[11].key).toBe("2027-09")
    expect(m[0].total).toBe(40.1)
    expect(m[3].total).toBe(0.2)
    expect(m[1].total).toBe(0)
    expect(m[1].parts).toEqual([])
  })

  it("splits each month by asset type in a fixed order, dropping zero parts", () => {
    const m = plannedMonths(
      [
        occ({ date: noon(2026, 11, 3), assetType: "EQUIPMENT", cost: 300 }),
        occ({ date: noon(2026, 11, 9), assetType: "PROPERTY", cost: 50 }),
        occ({ date: noon(2026, 11, 10), assetType: "PROPERTY", cost: 25 }),
        occ({ date: noon(2026, 11, 12), assetType: "VEHICLE", cost: 80 }),
      ],
      from,
      6,
    )
    expect(m[1].parts).toEqual([
      { assetType: "PROPERTY", total: 75 },
      { assetType: "VEHICLE", total: 80 },
      { assetType: "EQUIPMENT", total: 300 },
    ])
    expect(m[1].total).toBe(455)
    expect(m[1].count).toBe(4)
  })

  it("keeps parts summing to the month total despite float noise", () => {
    const m = plannedMonths(
      [0.1, 0.2, 0.3].map((cost, i) => occ({ date: noon(2026, 12, 1 + i), cost, assetType: i === 0 ? "VEHICLE" : "PROPERTY" })),
      from,
      6,
    )
    const sum = m[2].parts.reduce((s, p) => s + p.total, 0)
    expect(Math.round(sum * 100) / 100).toBe(m[2].total)
    expect(m[2].total).toBe(0.6)
  })

  it("crosses a year boundary", () => {
    const m = plannedMonths([occ({ date: noon(2027, 2, 14) })], noon(2026, 12, 31), 6)
    expect(m.map((x) => x.key)).toEqual(["2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"])
    expect(m[2].total).toBe(100)
  })

  it("ignores occurrences outside the window", () => {
    const m = plannedMonths([occ({ date: noon(2028, 5, 1) }), occ({ date: noon(2026, 9, 1) })], from, 6)
    expect(m.every((x) => x.total === 0)).toBe(true)
  })
})

const month = (total: number, extra: Partial<PlannedMonth> = {}): PlannedMonth => ({
  key: "k",
  start: from,
  total,
  count: total > 0 ? 1 : 0,
  parts: total > 0 ? [{ assetType: "PROPERTY", total }] : [],
  ...extra,
})

describe("plannedStats and plannedChartable", () => {
  it("finds the peak (first of equals), the next three months and the types present", () => {
    const months = [month(0), month(100), month(300, { parts: [{ assetType: "VEHICLE", total: 300 }] }), month(300), month(50)]
    const s = plannedStats(months)
    expect(s.peakIndex).toBe(2)
    expect(s.soon).toBe(400)
    expect(s.nonZeroMonths).toBe(4)
    expect(s.types).toEqual(["PROPERTY", "VEHICLE"])
  })

  it("has no peak when nothing is planned", () => {
    const s = plannedStats([month(0), month(0)])
    expect(s.peakIndex).toBe(-1)
    expect(s.soon).toBe(0)
    expect(s.types).toEqual([])
  })

  it("handles fewer than three months and an empty list", () => {
    expect(plannedStats([month(5)]).soon).toBe(5)
    expect(plannedStats([]).peakIndex).toBe(-1)
  })

  it("draws a chart only with at least two months of planned spend", () => {
    expect(plannedChartable([month(0), month(0)])).toBe(false)
    expect(plannedChartable([month(0), month(10), month(0)])).toBe(false)
    expect(plannedChartable([month(10), month(0), month(5)])).toBe(true)
    expect(plannedChartable([month(-5), month(10)])).toBe(false)
  })
})

describe("plannedArrangement", () => {
  it("puts the headline beside the chart only when wide and not tall", () => {
    expect(plannedArrangement(500, 150)).toBe("side")
    expect(plannedArrangement(500, 300)).toBe("stack")
    expect(plannedArrangement(300, 100)).toBe("stack")
    expect(plannedArrangement(0, 0)).toBe("stack")
  })
})

describe("plannedBarDensity", () => {
  it("drops the axis, then the labels, as the room shrinks", () => {
    expect(plannedBarDensity(420, 12, 140)).toEqual({ axis: true, labels: "month" })
    expect(plannedBarDensity(300, 12, 140)).toEqual({ axis: true, labels: "initial" })
    expect(plannedBarDensity(180, 12, 100)).toEqual({ axis: false, labels: "initial" })
    expect(plannedBarDensity(120, 12, 60)).toEqual({ axis: false, labels: "none" })
  })
  it("never draws an axis in a short plot", () => {
    expect(plannedBarDensity(600, 12, 70).axis).toBe(false)
  })
  it("gives six bars more room for names", () => {
    expect(plannedBarDensity(300, 6, 140).labels).toBe("month")
  })
  it("is safe before measuring", () => {
    expect(plannedBarDensity(0, 12, 0)).toEqual({ axis: false, labels: "none" })
  })
})

describe("plannedListRows", () => {
  it("fits as many rows as the height allows, capped by the items", () => {
    expect(plannedListRows(120, 10)).toBe(3)
    expect(plannedListRows(400, 4)).toBe(4)
    expect(plannedListRows(20, 10)).toBe(0)
    expect(plannedListRows(0, 10)).toBe(0)
  })
})

describe("the planned-spend card type", () => {
  const def = cardType("planned-spend")!
  const at = (w: number, h: number, mode: "large" | "phone" = "large") => def.tiers[tierOf(def, { w, h }, mode)].name

  it("is in the catalog with small limits and a look-ahead field", () => {
    expect(def).toBeDefined()
    expect(def.min).toEqual({ w: 1, h: 1 })
    expect(def.max).toEqual({ w: 12, h: 6 })
    expect(def.configFields.map((f) => f.key)).toEqual(["months"])
    expect(def.defaultConfig).toEqual({ months: 12 })
    expect(def.configSchema.safeParse(def.defaultConfig).success).toBe(true)
    expect(limitsMap().get("planned-spend")?.min).toEqual({ w: 1, h: 1 })
  })

  it("picks a look at every corner size of the large grid", () => {
    expect(at(1, 1)).toBe("number")
    expect(at(1, 2)).toBe("number")
    expect(at(1, 6)).toBe("number")
    expect(at(2, 1)).toBe("strip")
    expect(at(4, 1)).toBe("strip")
    expect(at(12, 1)).toBe("strip")
    expect(at(2, 2)).toBe("bars")
    expect(at(12, 2)).toBe("bars")
    expect(at(2, 3)).toBe("bars")
    expect(at(2, 6)).toBe("bars")
    expect(at(3, 2)).toBe("bars")
    expect(at(3, 3)).toBe("stacked")
    expect(at(4, 3)).toBe("stacked")
    expect(at(5, 4)).toBe("list")
    expect(at(3, 4)).toBe("list")
    expect(at(6, 3)).toBe("stacked")
    expect(at(6, 4)).toBe("split")
    expect(at(12, 6)).toBe("split")
  })

  it("scales the width on the phone grid", () => {
    expect(at(1, 1, "phone")).toBe("strip")
    expect(at(1, 2, "phone")).toBe("bars")
    expect(at(1, 3, "phone")).toBe("bars")
    expect(at(2, 1, "phone")).toBe("strip")
    expect(at(2, 2, "phone")).toBe("bars")
    expect(at(2, 3, "phone")).toBe("stacked")
    expect(at(2, 4, "phone")).toBe("list")
    expect(def.tiers[tierOf(def, def.phone, "phone")].name).toBe("stacked")
    expect(def.tiers[tierOf(def, def.large)].name).toBe("stacked")
  })

  it("offers distinct phone presets", () => {
    const names = phoneSizePresets(def).map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe("fitText", () => {
  it("takes the most precise candidate that fits, else the shortest", () => {
    const c = ["$12,400.00", "$12,400", "$12.4k"]
    expect(fitText(c, 200, 20)).toBe("$12,400.00")
    expect(fitText(c, 90, 20)).toBe("$12,400")
    expect(fitText(c, 10, 20)).toBe("$12.4k")
    expect(fitText([], 100, 20)).toBe("")
  })
})
