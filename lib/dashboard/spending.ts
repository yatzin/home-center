// Pure shaping for the Spending cards. Client-safe: no Prisma, no React.
import {
  bucketed,
  byCategory,
  cents,
  monthsBack,
  priorPeriod,
  sum,
  yearToDate,
  type BucketPoint,
  type CategoryKey,
  type CostRow,
  type DateRange,
} from "@/lib/costs"
import { localDay } from "@/lib/equipment-life"

/** "ytd", or a number of calendar months ending with the current one ("12m" in an older config is 12). */
export type SpendRange = "ytd" | number

/** Months in the trend chart for "ytd". A month count sets the chart's months too. */
export const TREND_MONTHS = 12

export const MIN_SPEND_MONTHS = 1
export const MAX_SPEND_MONTHS = 60

/** A stored month count, or null when it is missing, fractional or out of range. */
export function validMonths(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null
}

export function spendRangeOf(config: Record<string, unknown>): SpendRange {
  if (config.range === "12m") return 12
  if (config.range === "months") return validMonths(config.months, MIN_SPEND_MONTHS, MAX_SPEND_MONTHS) ?? 12
  return "ytd"
}

/** The months the trend chart shows for a range. */
export const trendMonthsOf = (range: SpendRange): number => (range === "ytd" ? TREND_MONTHS : range)

/**
 * The headline's period, `yearsBack` years earlier. "ytd": 1 January through
 * the end of today. A month count: that many calendar months, ending with the
 * current one (the first of the month N-1 months ago) through the end of
 * today, so the headline and the chart describe the same months.
 */
export function spendWindow(range: SpendRange, now: Date, yearsBack = 0): DateRange {
  // Record dates are UTC midnight (see lib/costs.ts), so the window is built in UTC from the viewer's local day.
  const today = localDay(now)
  const y = today.getUTCFullYear() - yearsBack
  const end = new Date(Date.UTC(y, today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999))
  const start =
    range === "ytd" ? new Date(Date.UTC(y, 0, 1)) : new Date(Date.UTC(y, today.getUTCMonth() - (range - 1), 1))
  return { start, end }
}

function rowsInWindow(rows: CostRow[], { start, end }: DateRange): CostRow[] {
  return rows.filter((r) => r.date >= start && r.date <= end)
}

function rowsInRange(rows: CostRow[], range: SpendRange, now: Date, yearsBack = 0): CostRow[] {
  // yearToDate is the app's definition of "the same point last year"; reuse it.
  return range === "ytd"
    ? yearToDate(rows, now, now.getFullYear() - yearsBack)
    : rowsInWindow(rows, spendWindow(range, now, yearsBack))
}

/**
 * Spend per category over the range, largest first (ties by category key).
 * A category that nets to zero or less (only refunds) is left out: it is not
 * spending, and a negative slice would make every share meaningless.
 */
export function spendingByCategory(
  rows: CostRow[],
  range: SpendRange,
  now: Date,
): { category: string; total: number }[] {
  return [...byCategory(rowsInRange(rows, range, now)).entries()]
    .filter(([, b]) => b.total > 0)
    .map(([category, b]) => ({ category: category as string, total: b.total }))
    .sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0))
}

/** Records per category over the range (for tooltips and the totals table). */
export function categoryCounts(rows: CostRow[], range: SpendRange, now: Date): Map<CategoryKey, number> {
  return new Map([...byCategory(rowsInRange(rows, range, now)).entries()].map(([k, b]) => [k, b.count]))
}

/**
 * The period's total against the same window a year earlier. `delta` is the
 * relative change, or null when nothing was spent then (no fair comparison).
 */
export function spendingSummary(rows: CostRow[], range: SpendRange, now: Date) {
  const total = sum(rowsInRange(rows, range, now))
  const priorTotal = sum(rowsInRange(rows, range, now, 1))
  return { total, priorTotal, delta: priorTotal > 0 ? (total - priorTotal) / priorTotal : null }
}

/**
 * Net spend from the first of the current month through the end of today
 * ("so far", like year-to-date: a record dated later this month is not
 * counted yet). Record dates are UTC midnight, so the window is built in UTC
 * from the viewer's local day, as spendWindow does.
 */
export function spendThisMonth(rows: CostRow[], now: Date): number {
  const today = localDay(now)
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()
  return sum(rowsInWindow(rows, { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m, today.getUTCDate(), 23, 59, 59, 999)) }))
}

/** `months` (12 by default) ending with the current one, and the same months a year earlier. */
export function spendTrend(rows: CostRow[], now: Date, months = TREND_MONTHS): { points: BucketPoint[]; prior: number[] } {
  const points = bucketed(rows, "month", { start: monthsBack(now, months), end: localDay(now) })
  return { points, prior: priorPeriod(rows, points, "month") }
}

/**
 * A chart earns its place only with at least two points of real spending. A
 * month or category that nets to a refund (zero or less) does not count: the
 * charts draw it at the baseline.
 */
export function chartable(values: number[]): boolean {
  return values.filter((v) => v > 0).length >= 2
}

/**
 * The change against a year earlier as the headline pill shows it: a whole
 * percent and its direction; a change that rounds to 0% is "flat".
 */
export function spendDelta(delta: number): { direction: "up" | "down" | "flat"; percent: number } {
  const percent = Math.round(Math.abs(delta) * 100)
  if (percent === 0) return { direction: "flat", percent: 0 }
  return { direction: delta > 0 ? "up" : "down", percent }
}

/**
 * Mean monthly spend over the trend's months, counting only months since the
 * first record: a household two months in is not shown a twelve-month mean.
 */
export function monthlyAverage(points: BucketPoint[], rows: CostRow[], now: Date): number {
  if (rows.length === 0 || points.length === 0) return 0
  const earliest = rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date)
  const elapsed = (now.getFullYear() - earliest.getUTCFullYear()) * 12 + (now.getMonth() - earliest.getUTCMonth()) + 1
  const months = Math.max(1, Math.min(points.length, elapsed))
  return cents(points.slice(points.length - months).reduce((s, p) => s + p.total, 0) / months)
}
