import { describe, expect, it } from "vitest"
import {
  buildHeat,
  buildHeatDays,
  columnGeometry,
  rowGeometry,
  heatConfigSchema,
  observationHeatConfigSchema,
  heatGeometry,
  heatMonthsOf,
  heatRangeStart,
  heatStats,
  heatWeeks,
  keyOf,
  levelCutoffs,
  levelOf,
  type HeatDay,
} from "./activity-heatmap"

const day = (key: string, count = 1, spend = 0): HeatDay => ({ key, count, spend })
// Tuesday 2026-10-27, as localDay() gives it: 12:00 UTC.
const today = new Date(Date.UTC(2026, 9, 27, 12))

describe("keyOf", () => {
  it("is the UTC calendar day", () => {
    expect(keyOf(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01-05")
    expect(keyOf(new Date(Date.UTC(2026, 11, 31, 23, 59)))).toBe("2026-12-31")
    expect(keyOf(today)).toBe("2026-10-27")
  })
})

describe("config", () => {
  it("accepts 6 or 12 months, defaults to 12", () => {
    expect(heatConfigSchema.safeParse({}).success).toBe(true)
    expect(heatConfigSchema.safeParse({ range: "6" }).success).toBe(true)
    expect(heatConfigSchema.safeParse({ range: "3" }).success).toBe(false)
    expect(heatMonthsOf({})).toBe(12)
    expect(heatMonthsOf({ range: "6" })).toBe(6)
    expect(heatMonthsOf({ range: 6 })).toBe(12)
  })
  it("the service card also takes one asset, the observations card one person", () => {
    expect(heatConfigSchema.safeParse({ asset: "EQUIPMENT:abc" }).success).toBe(true)
    expect(heatConfigSchema.safeParse({ asset: "ROOM:abc" }).success).toBe(false)
    expect(observationHeatConfigSchema.safeParse({ itemId: "p1", range: "6" }).success).toBe(true)
    expect(observationHeatConfigSchema.safeParse({ itemId: "" }).success).toBe(false)
  })
  it("a range is a whole number of weeks", () => {
    expect(heatWeeks(12)).toBe(53)
    expect(heatWeeks(6)).toBe(27)
  })
})

describe("levels", () => {
  it("cutoffs are quartiles of the non-zero values", () => {
    expect(levelCutoffs([])).toEqual([0, 0, 0])
    expect(levelCutoffs([1, 1, 1, 1])).toEqual([1, 1, 1])
    expect(levelCutoffs([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([2, 4, 6])
  })
  it("0 is empty; otherwise 1 to 4 by the cutoffs, so equal activity is one level", () => {
    expect(levelOf(0, [1, 1, 1])).toBe(0)
    expect(levelOf(1, [1, 1, 1])).toBe(1)
    expect(levelOf(2, [1, 1, 1])).toBe(4)
    expect(levelOf(1, [2, 4, 6])).toBe(1)
    expect(levelOf(3, [2, 4, 6])).toBe(2)
    expect(levelOf(5, [2, 4, 6])).toBe(3)
    expect(levelOf(9, [2, 4, 6])).toBe(4)
  })
})

describe("buildHeat", () => {
  it("has weeks columns of Sunday to Saturday, ending on today's weekday", () => {
    const g = buildHeat([], today, 3)
    expect(g.columns).toHaveLength(3)
    expect(g.columns[0]).toHaveLength(7)
    expect(g.columns[0][0].key).toBe("2026-10-11") // a Sunday, two weeks before this one's Sunday
    expect(g.columns[2].map((c) => c.key)).toEqual(["2026-10-25", "2026-10-26", "2026-10-27"]) // Sun, Mon, Tue = today
    expect(g.columns[2]).toHaveLength(3)
  })

  it("puts activity in its day with a level, and zero where nothing happened", () => {
    const g = buildHeat([day("2026-10-26", 3, 150), day("2026-10-12", 1, 20)], today, 3)
    const cell = (k: string) => g.columns.flat().find((c) => c.key === k)!
    expect(cell("2026-10-26")).toMatchObject({ count: 3, spend: 150, level: 4 })
    expect(cell("2026-10-12")).toMatchObject({ count: 1, level: 1 })
    expect(cell("2026-10-13")).toMatchObject({ count: 0, spend: 0, level: 0 })
  })

  it("ignores records outside the window and in the future", () => {
    const g = buildHeat([day("2026-01-01"), day("2026-10-28"), day("2027-01-01")], today, 3)
    expect(g.columns.flat().every((c) => c.count === 0)).toBe(true)
  })

  it("labels a column with its month where the month starts to show", () => {
    const g = buildHeat([], today, 9)
    expect(g.months.map((m) => m.month)).toEqual([8, 9]) // Sep (partial first column), Oct
    expect(g.months[0].col).toBe(0)
    expect(g.months[1].col).toBeGreaterThan(g.months[0].col)
  })

  it("handles a Feb 29 and a year boundary", () => {
    const leap = new Date(Date.UTC(2028, 2, 2, 12))
    const g = buildHeat([day("2028-02-29")], leap, 2)
    expect(g.columns.flat().some((c) => c.key === "2028-02-29" && c.count === 1)).toBe(true)
    const ny = buildHeat([day("2026-12-31"), day("2027-01-01")], new Date(Date.UTC(2027, 0, 2, 12)), 2)
    expect(ny.columns.flat().filter((c) => c.count > 0).map((c) => c.key)).toEqual(["2026-12-31", "2027-01-01"])
  })

  it("is the same in any machine time zone (days are UTC keys)", () => {
    const g = buildHeat([], today, 1)
    expect(g.columns[0].at(-1)?.key).toBe("2026-10-27")
  })
})

describe("heatStats", () => {
  const days = [day("2026-03-02", 2, 100), day("2026-03-20", 1, 50), day("2026-03-21", 1, 0), day("2026-08-10", 4, 400), day("2026-10-20", 1, 10)]
  const s = heatStats(days, today, 53)

  it("totals records, spend and active days", () => {
    expect(s).toMatchObject({ records: 9, spend: 560, activeDays: 5 })
  })
  it("finds the busiest day and month", () => {
    expect(s.busiestDay).toMatchObject({ key: "2026-08-10", count: 4 })
    expect(s.busiestMonth).toMatchObject({ key: "2026-08", count: 4 })
  })
  it("breaks a month tie toward the more recent month", () => {
    const t = heatStats([day("2026-03-01", 2), day("2026-05-01", 2)], today, 53)
    expect(t.busiestMonth?.key).toBe("2026-05")
  })
  it("measures the days since the last record and the longest quiet stretch", () => {
    expect(s.sinceLast).toBe(7)
    expect(s.longestQuiet).toBe(141) // 2026-03-21 to 2026-08-10: 142 days apart, 141 empty days between
  })
  it("is empty for no activity", () => {
    expect(heatStats([], today, 53)).toEqual({ records: 0, spend: 0, activeDays: 0, busiestDay: null, busiestMonth: null, sinceLast: null, longestQuiet: 0, severeDays: 0 })
  })
  it("leaves out what is outside the window", () => {
    expect(heatStats([day("2020-01-01", 5)], today, 53).records).toBe(0)
  })
})

describe("heatGeometry", () => {
  it("takes the whole range when the cells stay readable", () => {
    const g = heatGeometry({ width: 700, height: 160, weeks: 53, labels: true })
    expect(g.weeks).toBe(53)
    expect(g.cell).toBeGreaterThanOrEqual(8)
    expect(g.left + g.weeks * (g.cell + g.gap) - g.gap).toBeLessThanOrEqual(700)
    expect(g.top + 7 * (g.cell + g.gap) - g.gap).toBeLessThanOrEqual(160)
  })
  it("drops the oldest weeks rather than draw cells under the minimum", () => {
    const g = heatGeometry({ width: 180, height: 120, weeks: 53, labels: false })
    expect(g.weeks).toBeLessThan(53)
    expect(g.weeks).toBeGreaterThanOrEqual(4)
    expect(g.cell).toBeGreaterThanOrEqual(5)
    expect(g.weeks * (g.cell + g.gap) - g.gap).toBeLessThanOrEqual(180)
  })
  it("is limited by height too", () => {
    const g = heatGeometry({ width: 2000, height: 70, weeks: 53, labels: false })
    expect(7 * (g.cell + g.gap) - g.gap).toBeLessThanOrEqual(70)
  })
  it("fits nothing in a box too small for seven readable rows or four weeks", () => {
    expect(heatGeometry({ width: 500, height: 30, weeks: 53, labels: false }).weeks).toBe(0)
    expect(heatGeometry({ width: 20, height: 100, weeks: 53, labels: false }).weeks).toBe(0)
    expect(heatGeometry({ width: 0, height: 0, weeks: 53, labels: false }).weeks).toBe(0)
  })
  it("a larger minimum cell shows fewer, bigger weeks", () => {
    const small = heatGeometry({ width: 330, height: 200, weeks: 53, labels: true })
    const big = heatGeometry({ width: 330, height: 200, weeks: 53, labels: true, minCell: 8 })
    expect(big.cell).toBeGreaterThanOrEqual(8)
    expect(big.weeks).toBeLessThan(small.weeks)
    expect(heatGeometry({ width: 330, height: 40, weeks: 53, labels: false, minCell: 8 }).weeks).toBe(0)
  })
  it("caps the cell size", () => {
    expect(heatGeometry({ width: 3000, height: 1000, weeks: 27, labels: false }).cell).toBeLessThanOrEqual(18)
  })
})

describe("buildHeatDays", () => {
  it("merges rows of the same UTC day and sorts oldest first", () => {
    const d = (h: number) => new Date(Date.UTC(2026, 2, 5, h))
    const out = buildHeatDays([
      { date: new Date(Date.UTC(2026, 2, 9)), count: 1, spend: 5 },
      { date: d(0), count: 2, spend: 10.1 },
      { date: d(15), count: 1, spend: 0.2 },
    ])
    expect(out).toEqual([
      { key: "2026-03-05", count: 3, spend: 10.3 },
      { key: "2026-03-09", count: 1, spend: 5 },
    ])
  })
  it("is empty for no rows", () => {
    expect(buildHeatDays([])).toEqual([])
  })
})

describe("heatRangeStart", () => {
  it("is the UTC midnight of the first Sunday shown", () => {
    expect(heatRangeStart(today, 3).toISOString()).toBe("2026-10-11T00:00:00.000Z")
    expect(keyOf(heatRangeStart(today, 53))).toBe("2025-10-26")
  })
})

describe("day ratings (observations)", () => {
  const rated = (key: string, count: number, rating: number): HeatDay => ({ key, count, spend: 0, rating })

  it("shades a day by its worst entry, mild 1 to severe 5, whatever the count", () => {
    const g = buildHeat([rated("2026-10-26", 5, 1), rated("2026-10-25", 1, 5), rated("2026-10-20", 2, 3)], today, 3, "rating")
    const cell = (k: string) => g.columns.flat().find((c) => c.key === k)!
    expect(cell("2026-10-26")).toMatchObject({ count: 5, rating: 1, level: 1 })
    expect(cell("2026-10-25")).toMatchObject({ count: 1, rating: 5, level: 5 })
    expect(cell("2026-10-20")).toMatchObject({ rating: 3, level: 3 })
    expect(cell("2026-10-21")).toMatchObject({ count: 0, rating: 0, level: 0 })
  })

  it("an entry with no rating is mild, never quiet", () => {
    const g = buildHeat([{ key: "2026-10-26", count: 1, spend: 0 }], today, 3, "rating")
    expect(g.columns.flat().find((c) => c.key === "2026-10-26")).toMatchObject({ rating: 1, level: 1 })
  })

  it("clamps a stray rating into 1 to 5", () => {
    const g = buildHeat([rated("2026-10-26", 1, 9), rated("2026-10-25", 1, 0)], today, 3, "rating")
    const cell = (k: string) => g.columns.flat().find((c) => c.key === k)!
    expect(cell("2026-10-26").level).toBe(5)
    expect(cell("2026-10-25").level).toBe(1)
  })

  it("count shading is unchanged and carries a rating of 0 unless one is given", () => {
    const g = buildHeat([day("2026-10-26", 3)], today, 3)
    expect(g.columns.flat().find((c) => c.key === "2026-10-26")).toMatchObject({ level: 1, rating: 0 })
  })

  it("counts the severe days (rated 4 or 5)", () => {
    const s = heatStats([rated("2026-10-26", 1, 4), rated("2026-10-25", 2, 5), rated("2026-10-20", 9, 3), day("2026-10-19")], today, 53)
    expect(s.severeDays).toBe(2)
    expect(heatStats([], today, 53).severeDays).toBe(0)
  })

  it("buildHeatDays keeps the worst rating of a merged day", () => {
    const d = (h: number) => new Date(Date.UTC(2026, 2, 5, h))
    expect(buildHeatDays([{ date: d(0), count: 1, spend: 0, rating: 2 }, { date: d(9), count: 1, spend: 0, rating: 4 }])).toEqual([
      { key: "2026-03-05", count: 2, spend: 0, rating: 4 },
    ])
  })
})

describe("columnGeometry (a narrow, tall card: weeks run down, the 7 weekdays across)", () => {
  it("fills the width with seven cells and as many weeks as the height holds", () => {
    const g = columnGeometry({ width: 83, height: 192, weeks: 53 })
    expect(g.weeks).toBeGreaterThanOrEqual(10)
    expect(g.weeks).toBeLessThanOrEqual(53)
    expect(g.pad * 2 + 7 * g.cell + 6 * g.gap).toBeCloseTo(83, 5)
    expect(g.pad * 2 + g.weeks * (g.cell + g.gap) - g.gap).toBeLessThanOrEqual(192)
  })
  it("shows more weeks the taller it is, never more than the range", () => {
    const short = columnGeometry({ width: 83, height: 192, weeks: 53 })
    const tall = columnGeometry({ width: 83, height: 400, weeks: 53 })
    expect(tall.weeks).toBeGreaterThan(short.weeks)
    expect(columnGeometry({ width: 83, height: 4000, weeks: 27 }).weeks).toBe(27)
  })
  it("fits nothing when the cells would be under 4px or fewer than 4 weeks fit", () => {
    expect(columnGeometry({ width: 40, height: 400, weeks: 53 }).weeks).toBe(0)
    expect(columnGeometry({ width: 83, height: 30, weeks: 53 }).weeks).toBe(0)
    expect(columnGeometry({ width: 0, height: 0, weeks: 53 }).weeks).toBe(0)
  })
})

describe("rowGeometry (a short, wide card: the seven weekdays fill the height, weeks run across)", () => {
  it("fills the height with seven cells and as many weeks as the width holds", () => {
    const g = rowGeometry({ width: 181, height: 88, weeks: 53 })
    expect(g.weeks).toBeGreaterThanOrEqual(10)
    expect(g.pad * 2 + 7 * g.cell + 6 * g.gap).toBeCloseTo(88, 5)
    expect(g.pad * 2 + g.weeks * (g.cell + g.gap) - g.gap).toBeLessThanOrEqual(181)
  })
  it("shows more weeks the wider it is, never more than the range", () => {
    expect(rowGeometry({ width: 280, height: 88, weeks: 53 }).weeks).toBeGreaterThan(rowGeometry({ width: 181, height: 88, weeks: 53 }).weeks)
    expect(rowGeometry({ width: 4000, height: 88, weeks: 27 }).weeks).toBe(27)
  })
  it("fits nothing when cells would be under 4px or fewer than 4 weeks fit", () => {
    expect(rowGeometry({ width: 400, height: 30, weeks: 53 }).weeks).toBe(0)
    expect(rowGeometry({ width: 30, height: 88, weeks: 53 }).weeks).toBe(0)
    expect(rowGeometry({ width: 0, height: 0, weeks: 53 }).weeks).toBe(0)
  })
})

describe("a typed month count", () => {
  it("is read from months (1 to 36), else an older range, else 12", () => {
    expect(heatMonthsOf({ months: 3 })).toBe(3)
    expect(heatMonthsOf({ months: 36 })).toBe(36)
    expect(heatMonthsOf({ months: 1 })).toBe(1)
    for (const months of [0, 37, 2.5, "6", null]) expect(heatMonthsOf({ months })).toBe(12)
    expect(heatMonthsOf({ range: "6" })).toBe(6)
    expect(heatMonthsOf({ months: 9, range: "6" })).toBe(9)
  })
  it("the schemas take 1 to 36 and still the older range", () => {
    expect(heatConfigSchema.safeParse({ months: 1 }).success).toBe(true)
    expect(heatConfigSchema.safeParse({ months: 36 }).success).toBe(true)
    expect(heatConfigSchema.safeParse({ months: 0 }).success).toBe(false)
    expect(heatConfigSchema.safeParse({ months: 37 }).success).toBe(false)
    expect(observationHeatConfigSchema.safeParse({ months: 12, itemId: "p" }).success).toBe(true)
  })
  it("a range is a whole number of weeks, as before for 6 and 12 months", () => {
    expect(heatWeeks(6)).toBe(27)
    expect(heatWeeks(12)).toBe(53)
    expect(heatWeeks(1)).toBe(5)
    expect(heatWeeks(36)).toBeGreaterThan(heatWeeks(24))
  })
})
