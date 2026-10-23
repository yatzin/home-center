// Pure shaping for the Spending cards. Client-safe: no Prisma, no React.
import {
  bucketed,
  byCategory,
  cents,
  priorPeriod,
  sum,
  yearToDate,
  type BucketPoint,
  type CategoryKey,
  type CostRow,
  type DateRange,
} from "@/lib/costs"

export type SpendRange = "ytd" | "12m"

/** Months in the trend chart, whatever the headline's range. */
export const TREND_MONTHS = 12

export function spendRangeOf(config: Record<string, unknown>): SpendRange {
  return config.range === "12m" ? "12m" : "ytd"
}

/**
 * The headline's period, `yearsBack` years earlier. "ytd": 1 January through
 * the end of today. "12m": the twelve calendar months the trend chart shows
 * (the first of the month eleven months ago) through the end of today, so the
 * headline and the chart describe the same months.
 */
export function spendWindow(range: SpendRange, now: Date, yearsBack = 0): DateRange {
  const y = now.getFullYear() - yearsBack
  const end = new Date(y, now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const start = range === "ytd" ? new Date(y, 0, 1) : new Date(y, now.getMonth() - (TREND_MONTHS - 1), 1)
  return { start, end }
}

export function rowsInWindow(rows: CostRow[], { start, end }: DateRange): CostRow[] {
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

/** Twelve months ending with the current one, and the same months a year earlier. */
export function spendTrend(rows: CostRow[], now: Date): { points: BucketPoint[]; prior: number[] } {
  const points = bucketed(rows, "month", {
    start: new Date(now.getFullYear(), now.getMonth() - (TREND_MONTHS - 1), 1),
    end: now,
  })
  return { points, prior: priorPeriod(rows, points, "month") }
}

/** A chart earns its place only with at least two non-zero points. */
export function chartable(values: number[]): boolean {
  return values.filter((v) => v !== 0).length >= 2
}

/**
 * Mean monthly spend over the trend's months, counting only months since the
 * first record: a household two months in is not shown a twelve-month mean.
 */
export function monthlyAverage(points: BucketPoint[], rows: CostRow[], now: Date): number {
  if (rows.length === 0 || points.length === 0) return 0
  const earliest = rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date)
  const elapsed = (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth()) + 1
  const months = Math.max(1, Math.min(points.length, elapsed))
  return cents(points.slice(points.length - months).reduce((s, p) => s + p.total, 0) / months)
}
