import type { AssetType, ServiceCategory } from "@/app/generated/prisma/client"

// Pure, client-safe cost aggregation. Anything needing the database lives in
// lib/costs-server.ts instead, matching the assets.ts / assets-server.ts split.

/// The minimal row shape every rollup works from. Deliberately not the Prisma
/// model: these functions must stay usable from a client component and testable
/// without a database.
export type CostRow = {
  assetId: string
  assetType: AssetType
  date: Date
  cost: number
  category: ServiceCategory | null
  vendor: string | null
  title: string
  mileageAtService: number | null
}

export type Bucket = { total: number; count: number }

/// Map key standing in for `category === null`. Records logged before categories
/// existed get their own bucket rather than being folded into OTHER, which would
/// misstate every one of them.
export const UNCATEGORIZED = "UNCATEGORIZED"

export type CategoryKey = ServiceCategory | typeof UNCATEGORIZED

export const SERVICE_CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: "ROUTINE", label: "Routine" },
  { value: "REPAIR", label: "Repair" },
  { value: "UPGRADE", label: "Upgrade" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "PARTS", label: "Parts" },
  { value: "OTHER", label: "Other" },
]

// Fixed order, assigned in sequence and never cycled — the colour a category
// wears must not depend on which categories happen to be on screen. Uncategorized
// sorts last because it is an absence, not a kind of spending.
export const CATEGORY_ORDER: CategoryKey[] = [
  ...SERVICE_CATEGORIES.map((c) => c.value),
  UNCATEGORIZED,
]

const CATEGORY_LABELS = Object.fromEntries(
  SERVICE_CATEGORIES.map((c) => [c.value, c.label])
) as Record<ServiceCategory, string>

export function categoryLabel(key: CategoryKey): string {
  return key === UNCATEGORIZED ? "Uncategorized" : CATEGORY_LABELS[key] ?? "Other"
}

// Colours are CSS variables, not literals, so light and dark are one definition
// in globals.css rather than a branch in every component.
const CATEGORY_COLORS: Record<CategoryKey, string> = {
  ROUTINE: "var(--cost-routine)",
  REPAIR: "var(--cost-repair)",
  UPGRADE: "var(--cost-upgrade)",
  INSPECTION: "var(--cost-inspection)",
  PARTS: "var(--cost-parts)",
  OTHER: "var(--cost-other)",
  [UNCATEGORIZED]: "var(--cost-uncategorized)",
}

export function categoryColor(key: CategoryKey): string {
  return CATEGORY_COLORS[key]
}

/// `ServiceRecord.cost` is a SQLite Float, so summing many of them accumulates
/// sub-cent drift. Every rollup rounds at its boundary.
export function cents(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatMoney(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/// For column captions and axis ticks, where "$12,480.00" is more precision than
/// the reader needs and wider than the space available.
export function formatMoneyCompact(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${Math.round(n)}`
}

/// The one primitive every grouping is built from. Returning `null` from `keyFn`
/// drops the row, which is how records with no vendor stay out of vendor
/// rankings without a separate filtering pass.
export function rollup<K extends string>(
  rows: CostRow[],
  keyFn: (row: CostRow) => K | null
): Map<K, Bucket> {
  const out = new Map<K, Bucket>()
  for (const row of rows) {
    const key = keyFn(row)
    if (key === null) continue
    const bucket = out.get(key)
    if (bucket) {
      bucket.total += row.cost
      bucket.count += 1
    } else {
      out.set(key, { total: row.cost, count: 1 })
    }
  }
  for (const bucket of out.values()) bucket.total = cents(bucket.total)
  return out
}

export function assetKey(assetType: AssetType, assetId: string): string {
  return `${assetType}:${assetId}`
}

export function parseAssetKey(key: string): { assetType: AssetType; assetId: string } {
  const i = key.indexOf(":")
  return { assetType: key.slice(0, i) as AssetType, assetId: key.slice(i + 1) }
}

export function byYear(rows: CostRow[]): Map<string, Bucket> {
  return rollup(rows, (r) => String(r.date.getFullYear()))
}

export function byAsset(rows: CostRow[]): Map<string, Bucket> {
  return rollup(rows, (r) => assetKey(r.assetType, r.assetId))
}

export function byCategory(rows: CostRow[]): Map<CategoryKey, Bucket> {
  return rollup(rows, (r) => (r.category ?? UNCATEGORIZED) as CategoryKey)
}

export function byVendor(rows: CostRow[]): Map<string, Bucket> {
  return rollup(rows, (r) => {
    const v = r.vendor?.trim()
    return v ? v : null
  })
}

export type RankedEntry = {
  key: string
  label: string
  total: number
  count: number
  /// This entry's total as a fraction of the largest total, for bar width.
  share: number
}

/// Sorted descending, with a key tiebreaker so equal totals keep a stable order
/// between renders.
export function ranked(
  map: Map<string, Bucket>,
  { limit, label }: { limit?: number; label?: (key: string) => string } = {}
): RankedEntry[] {
  const sorted = [...map.entries()].sort(
    (a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0])
  )
  const max = sorted[0]?.[1].total ?? 0
  return (limit ? sorted.slice(0, limit) : sorted).map(([key, bucket]) => ({
    key,
    label: label ? label(key) : key,
    total: bucket.total,
    count: bucket.count,
    share: max > 0 ? bucket.total / max : 0,
  }))
}

export type StackSegment = { key: CategoryKey; label: string; color: string; total: number }
export type YearColumn = { year: string; total: number; segments: StackSegment[]; share: number }

export function stackedByYear(rows: CostRow[]): YearColumn[] {
  const grouped = new Map<string, CostRow[]>()
  for (const row of rows) {
    const year = String(row.date.getFullYear())
    const list = grouped.get(year)
    if (list) list.push(row)
    else grouped.set(year, [row])
  }

  const columns = [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, yearRows]) => {
      const categories = byCategory(yearRows)
      // Walk CATEGORY_ORDER rather than the map's own order, so a category keeps
      // its position in the stack whether or not the year above it used it.
      const segments = CATEGORY_ORDER.filter((key) => categories.has(key)).map((key) => ({
        key,
        label: categoryLabel(key),
        color: categoryColor(key),
        total: categories.get(key)!.total,
      }))
      return {
        year,
        total: cents(segments.reduce((s, seg) => s + seg.total, 0)),
        segments,
      }
    })

  const max = Math.max(0, ...columns.map((c) => c.total))
  return columns.map((c) => ({ ...c, share: max > 0 ? c.total / max : 0 }))
}

export type SparkPoint = { year: string; total: number }

/// Every year between the first and last is emitted, including the ones with no
/// spend. Skipping them would draw a straight line across a gap and tell the
/// reader that money was spent in a year when none was.
export function yearSeries(rows: CostRow[]): SparkPoint[] {
  const map = byYear(rows)
  if (map.size === 0) return []
  const years = [...map.keys()].map(Number)
  const out: SparkPoint[] = []
  for (let y = Math.min(...years); y <= Math.max(...years); y++) {
    out.push({ year: String(y), total: map.get(String(y))?.total ?? 0 })
  }
  return out
}

export function sum(rows: CostRow[]): number {
  return cents(rows.reduce((s, r) => s + r.cost, 0))
}

export function inYear(rows: CostRow[], year: number): CostRow[] {
  return rows.filter((r) => r.date.getFullYear() === year)
}

/// Rows from 1 January of `year` through the same month and day as `now`.
/// Passing `now.getFullYear() - 1` gives the same window a year earlier, which is
/// what makes a year-on-year comparison fair in, say, March.
export function yearToDate(rows: CostRow[], now: Date, year: number = now.getFullYear()): CostRow[] {
  const start = new Date(year, 0, 1)
  const end = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return rows.filter((r) => r.date >= start && r.date <= end)
}

/// Divides all-time spend by the months elapsed since the earliest costed record,
/// not by twelve — a household two months in should not be shown a twelve-month
/// average.
export function averagePerMonth(rows: CostRow[], now: Date): number {
  if (rows.length === 0) return 0
  const earliest = rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date)
  const months = Math.max(
    1,
    (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth()) + 1
  )
  return cents(sum(rows) / months)
}

/// Cost per mile or hour across the meter span the records themselves cover.
/// Two readings are the minimum for a span to exist; anything less returns null
/// so the caller omits the figure rather than printing a divide-by-zero.
export function costPerMeter(rows: CostRow[]): number | null {
  const readings = rows.flatMap((r) => (r.mileageAtService != null ? [r.mileageAtService] : []))
  if (readings.length < 2) return null
  const span = Math.max(...readings) - Math.min(...readings)
  if (span <= 0) return null
  return sum(rows) / span
}
