// Pure shaping for the Activity card: a calendar of the days service was
// recorded, one square per day, weeks as columns (Sunday to Saturday), the way
// a contribution graph reads. Client-safe: no Prisma, no React. Record dates
// are UTC midnight, so every day here is a UTC calendar day keyed "YYYY-MM-DD"
// (which sorts as text), and "today" is localDay().
import { z } from "zod"
import { assetPickSchema } from "./asset-pick"
import { validMonths } from "./spending"

/** `rating` is the day's worst observation, 1 (mild) to 5 (severe): the Observations tab's day rating (lib/day-ratings.ts). */
export type HeatDay = { key: string; count: number; spend: number; rating?: number }

export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 5

/** `rating` is 0 for a quiet day; `level` is 0 to 4 by count, or 0 to 5 by rating. */
export type HeatCell = { key: string; count: number; spend: number; rating: number; level: HeatLevel }

/** How a day is shaded: by how many records it has, or by the worst rating logged that day. */
export type HeatShade = "count" | "rating"

const DAY_MS = 86400000

/** A rating clamped into 1 (mild) to 5 (severe), as the Observations tab rounds it. */
const dayRating = (r: number) => Math.min(5, Math.max(1, Math.round(r)))

/** Days rated this or worse are severe (lib/day-ratings.ts SEVERE_DAY). */
const SEVERE = 4

export const keyOf = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`

const dayNumber = (key: string): number => {
  const [y, m, d] = key.split("-").map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

export const MIN_HEAT_MONTHS = 1
export const MAX_HEAT_MONTHS = 36

/** How far back the calendar goes, in months (`range` "6" / "12" is an older config's choice). */
const monthsSchema = z.number().int().min(MIN_HEAT_MONTHS).max(MAX_HEAT_MONTHS).optional()
const legacyRange = z.enum(["6", "12"]).optional()

export const heatConfigSchema = z.object({ months: monthsSchema, range: legacyRange, asset: assetPickSchema.optional() })

/** The people cards: the months and one person (the standard item setting). */
export const observationHeatConfigSchema = z.object({ months: monthsSchema, range: legacyRange, itemId: z.string().min(1).max(64).optional() })

export const heatMonthsOf = (config: Record<string, unknown>): number =>
  validMonths(config.months, MIN_HEAT_MONTHS, MAX_HEAT_MONTHS) ?? (config.range === "6" ? 6 : 12)

/** A range is a whole number of week columns (the first may start before it): 6 months 27, 12 months 53. */
export const heatWeeks = (months: number): number => Math.ceil((months * 365.25) / 12 / 7)

/** The first day shown: the Sunday `weeks - 1` weeks before the Sunday of today's week. */
function windowStart(today: Date, weeks: number): number {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / DAY_MS
  return t - today.getUTCDay() - (weeks - 1) * 7
}

const keyOfNumber = (n: number) => keyOf(new Date(n * DAY_MS))

/** The first day of the window, as the UTC midnight record dates are stored at. */
export const heatRangeStart = (today: Date, weeks: number): Date => new Date(windowStart(today, weeks) * DAY_MS)

/** Quartiles of the non-zero values: where levels 2, 3 and 4 begin (above each cutoff). */
export function levelCutoffs(values: readonly number[]): [number, number, number] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b)
  if (v.length === 0) return [0, 0, 0]
  const q = (p: number) => v[Math.max(0, Math.ceil(p * v.length) - 1)]
  return [q(0.25), q(0.5), q(0.75)]
}

/** 0 for nothing; 1 to 4 by the cutoffs (the top quartile is level 4), so equal activity is one level. */
export function levelOf(value: number, cutoffs: readonly [number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0
  const top = cutoffs[2] > cutoffs[0] ? value >= cutoffs[2] : value > cutoffs[2]
  return (1 + Number(value > cutoffs[0]) + Number(value > cutoffs[1]) + Number(top)) as 1 | 2 | 3 | 4
}

export type HeatGrid = {
  columns: HeatCell[][]
  /** The column a month's 1st falls in, for the labels along the top. */
  months: { col: number; month: number }[]
}

export function buildHeat(days: readonly HeatDay[], today: Date, weeks: number, shade: HeatShade = "count"): HeatGrid {
  const start = windowStart(today, weeks)
  const todayKey = keyOf(today)
  const byKey = new Map(days.map((d) => [d.key, d]))
  const columns: HeatCell[][] = []
  const months: HeatGrid["months"] = []
  const counts: number[] = []
  for (let c = 0; c < weeks; c++) {
    const col: HeatCell[] = []
    for (let r = 0; r < 7; r++) {
      const key = keyOfNumber(start + c * 7 + r)
      if (key > todayKey) break
      const d = byKey.get(key)
      const count = d?.count ?? 0
      // An entry with no rating is mild, never quiet (lib/day-ratings.ts).
      const rating = count > 0 && d?.rating !== undefined ? dayRating(d.rating) : count > 0 && shade === "rating" ? 1 : 0
      col.push({ key, count, spend: d?.spend ?? 0, rating, level: 0 })
      if (d && d.count > 0) counts.push(d.count)
      if (key.endsWith("-01")) months.push({ col: c, month: Number(key.slice(5, 7)) - 1 })
    }
    columns.push(col)
  }
  const cutoffs = levelCutoffs(counts)
  for (const col of columns) for (const cell of col) cell.level = shade === "rating" ? (cell.rating as HeatLevel) : levelOf(cell.count, cutoffs)
  return { columns, months }
}

export type HeatStats = {
  records: number
  spend: number
  activeDays: number
  busiestDay: { key: string; count: number } | null
  busiestMonth: { key: string; count: number } | null
  /** Days since the most recent record; null with none. */
  sinceLast: number | null
  /** The most consecutive days without a record, between records or since the last one. */
  longestQuiet: number
  /** Days rated severe (4 or 5); 0 for counts with no ratings. */
  severeDays: number
}

export function heatStats(days: readonly HeatDay[], today: Date, weeks: number): HeatStats {
  const from = keyOfNumber(windowStart(today, weeks))
  const to = keyOf(today)
  const inside = days.filter((d) => d.count > 0 && d.key >= from && d.key <= to).sort((a, b) => (a.key < b.key ? -1 : 1))
  const s: HeatStats = { records: 0, spend: 0, activeDays: inside.length, busiestDay: null, busiestMonth: null, sinceLast: null, longestQuiet: 0, severeDays: 0 }
  const months = new Map<string, number>()
  for (const d of inside) {
    s.records += d.count
    s.spend += d.spend
    if (d.rating !== undefined && dayRating(d.rating) >= SEVERE) s.severeDays++
    if (!s.busiestDay || d.count >= s.busiestDay.count) s.busiestDay = { key: d.key, count: d.count }
    months.set(d.key.slice(0, 7), (months.get(d.key.slice(0, 7)) ?? 0) + d.count)
  }
  s.spend = Math.round(s.spend * 100) / 100
  for (const [key, count] of [...months].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (!s.busiestMonth || count >= s.busiestMonth.count) s.busiestMonth = { key, count }
  }
  if (inside.length > 0) {
    const todayN = dayNumber(to)
    s.sinceLast = todayN - dayNumber(inside[inside.length - 1].key)
    s.longestQuiet = s.sinceLast
    for (let i = 1; i < inside.length; i++) s.longestQuiet = Math.max(s.longestQuiet, dayNumber(inside[i].key) - dayNumber(inside[i - 1].key) - 1)
  }
  return s
}

const MIN_CELL = 5
const MAX_CELL = 18
const MIN_WEEKS = 4
const LABEL_LEFT = 26
const LABEL_TOP = 16

export type HeatGeometry = { weeks: number; cell: number; gap: number; left: number; top: number }

/**
 * How the measured box (px) is spent: the most recent weeks that fit with cells
 * of at least `minCell` px (older weeks drop off before cells shrink further), the
 * cell and gap sizes, and the room taken by the weekday and month labels.
 * `weeks: 0` when not even seven rows and four weeks fit.
 */
export function heatGeometry({
  width,
  height,
  weeks,
  labels,
  minCell = MIN_CELL,
}: {
  width: number
  height: number
  weeks: number
  labels: boolean
  /** The smallest cell worth drawing; a larger one trades older weeks for readability. */
  minCell?: number
}): HeatGeometry {
  const left = labels ? LABEL_LEFT : 0
  const top = labels ? LABEL_TOP : 0
  const none: HeatGeometry = { weeks: 0, cell: 0, gap: 1, left, top }
  if (width <= 0 || height <= 0) return none
  const size = (w: number) => {
    for (const gap of [2, 1]) {
      const raw = Math.min((width - left + gap) / w - gap, (height - top + gap) / 7 - gap)
      if (raw >= 8 || gap === 1) return { cell: Math.floor(raw), gap, tall: (height - top + gap) / 7 - gap }
    }
    return { cell: 0, gap: 1, tall: 0 }
  }
  for (let w = weeks; w >= MIN_WEEKS; w--) {
    const { cell, gap, tall } = size(w)
    if (tall < minCell) return none
    if (cell >= minCell) return { weeks: w, cell: Math.min(cell, MAX_CELL), gap, left, top }
  }
  return none
}

/** Grouped rows (a day can come back more than once if some were stored with a time of day) as one entry per UTC day, oldest first. */
export function buildHeatDays(rows: readonly { date: Date; count: number; spend: number; rating?: number }[]): HeatDay[] {
  const byKey = new Map<string, HeatDay>()
  for (const r of rows) {
    const key = keyOf(r.date)
    const d = byKey.get(key) ?? { key, count: 0, spend: 0 }
    d.count += r.count
    d.spend = Math.round((d.spend + r.spend) * 100) / 100
    if (r.rating !== undefined) d.rating = Math.max(d.rating ?? 0, r.rating)
    byKey.set(key, d)
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
}

export type ColumnGeometry = { weeks: number; cell: number; gap: number; pad: number }

const COLUMN_PAD = 4

/**
 * A narrow, tall box (one grid column wide): the calendar turned so the seven
 * weekdays run across and the weeks run down, newest at the bottom. The cell
 * size fills the width exactly; as many recent weeks as the height holds.
 * `weeks: 0` when cells would be under 4px or fewer than 4 weeks fit.
 */
export function columnGeometry({ width, height, weeks }: { width: number; height: number; weeks: number }): ColumnGeometry {
  const none: ColumnGeometry = { weeks: 0, cell: 0, gap: 1, pad: COLUMN_PAD }
  if (width <= 0 || height <= 0) return none
  const inner = width - COLUMN_PAD * 2
  const gap = inner / 7 >= 12 ? 2 : 1
  const cell = (inner - 6 * gap) / 7
  if (cell < 4) return none
  const fit = Math.min(weeks, Math.floor((height - COLUMN_PAD * 2 + gap) / (cell + gap)))
  return fit >= MIN_WEEKS ? { weeks: fit, cell, gap, pad: COLUMN_PAD } : none
}

/**
 * A short, wide box (one row tall): the calendar as usual, weekdays down and
 * weeks across (newest at the right), the cell size filling the height
 * exactly; as many recent weeks as the width holds. `weeks: 0` when cells would
 * be under 4px or fewer than 4 weeks fit.
 */
export function rowGeometry({ width, height, weeks }: { width: number; height: number; weeks: number }): ColumnGeometry {
  const none: ColumnGeometry = { weeks: 0, cell: 0, gap: 1, pad: COLUMN_PAD }
  if (width <= 0 || height <= 0) return none
  const inner = height - COLUMN_PAD * 2
  const gap = inner / 7 >= 12 ? 2 : 1
  const cell = (inner - 6 * gap) / 7
  if (cell < 4) return none
  const fit = Math.min(weeks, Math.floor((width - COLUMN_PAD * 2 + gap) / (cell + gap)))
  return fit >= MIN_WEEKS ? { weeks: fit, cell, gap, pad: COLUMN_PAD } : none
}
