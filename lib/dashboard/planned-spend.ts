// Pure shaping for the Planned Spend card. Client-safe: no Prisma, no React.
// The numbers are the Costs page's own (lib/forecast.ts); this only splits them
// by asset type and decides how much of a chart the room and the data earn.
import { z } from "zod"
import type { AssetType } from "@/app/generated/prisma/client"
import { cents } from "@/lib/costs"
import { forecastByMonth, type Occurrence } from "@/lib/forecast"
import { validMonths } from "./spending"

export type PlannedHorizon = number

export const MIN_PLANNED_MONTHS = 1
export const MAX_PLANNED_MONTHS = 24

/** How many months ahead (`horizon` "6" / "12" is an older config's choice). */
export const plannedConfigSchema = z.object({
  months: z.number().int().min(MIN_PLANNED_MONTHS).max(MAX_PLANNED_MONTHS).optional(),
  horizon: z.enum(["6", "12"]).optional(),
})

export function plannedHorizonOf(config: Record<string, unknown>): PlannedHorizon {
  return validMonths(config.months, MIN_PLANNED_MONTHS, MAX_PLANNED_MONTHS) ?? (config.horizon === "6" ? 6 : 12)
}

/** The fixed order types stack in (and their legend lists them): the identity of a colour never follows rank. */
export const PLANNED_TYPE_ORDER: readonly AssetType[] = ["PROPERTY", "VEHICLE", "EQUIPMENT", "PERSON"]

export const PLANNED_TYPE_LABELS: Record<string, string> = {
  PROPERTY: "Property",
  VEHICLE: "Vehicle",
  EQUIPMENT: "Equipment",
  PERSON: "People",
}

export type PlannedPart = { assetType: AssetType; total: number }
export type PlannedMonth = { key: string; start: Date; total: number; count: number; parts: PlannedPart[] }

const keyOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`

/**
 * `months` entries from `from`'s UTC month, zero-filled. Totals and counts are
 * forecastByMonth's (so they equal the Costs page); `parts` splits each month
 * by asset type in PLANNED_TYPE_ORDER, leaving out types with nothing planned.
 */
export function plannedMonths(occurrences: Occurrence[], from: Date, months: number): PlannedMonth[] {
  const byMonth = new Map<string, Map<AssetType, number>>()
  for (const o of occurrences) {
    const key = keyOf(o.date)
    const types = byMonth.get(key) ?? new Map<AssetType, number>()
    types.set(o.assetType, (types.get(o.assetType) ?? 0) + o.cost)
    byMonth.set(key, types)
  }
  return forecastByMonth(occurrences, from, months).map((m) => {
    const types = byMonth.get(m.key)
    const parts: PlannedPart[] = []
    for (const assetType of PLANNED_TYPE_ORDER) {
      const total = cents(types?.get(assetType) ?? 0)
      if (total > 0) parts.push({ assetType, total })
    }
    return { key: m.key, start: m.start, total: m.total, count: m.count, parts }
  })
}

export type PlannedStats = {
  /** First month with the largest total; -1 when nothing is planned. */
  peakIndex: number
  /** The first three months together: what is close. */
  soon: number
  nonZeroMonths: number
  /** Asset types with anything planned, in stacking order. */
  types: AssetType[]
}

/** What the stats and the chart gate need of a month (the card gets it without `start`). */
export type PlannedMonthLike = { total: number; parts: { assetType: string }[] }

export function plannedStats(months: PlannedMonthLike[]): PlannedStats {
  let peakIndex = -1
  months.forEach((m, i) => {
    if (m.total > 0 && (peakIndex < 0 || m.total > months[peakIndex].total)) peakIndex = i
  })
  const present = new Set(months.flatMap((m) => m.parts.map((p) => p.assetType)))
  return {
    peakIndex,
    soon: cents(months.slice(0, 3).reduce((s, m) => s + m.total, 0)),
    nonZeroMonths: months.filter((m) => m.total > 0).length,
    types: PLANNED_TYPE_ORDER.filter((t) => present.has(t)),
  }
}

/** A chart earns its place with at least two months of planned spend; one lonely bar is just the number. */
export function plannedChartable(months: { total: number }[]): boolean {
  return months.filter((m) => m.total > 0).length >= 2
}

/**
 * Where the headline sits relative to the chart, from the measured body: beside
 * it in a wide, short card; above it otherwise.
 */
export function plannedArrangement(width: number, height: number): "side" | "stack" {
  return width >= 420 && height > 0 && height <= width / 2.2 ? "side" : "stack"
}

const AXIS_WIDTH = 38

/**
 * How much chart chrome the measured plot (px) can carry: a y-axis only in a
 * plot tall and wide enough for labelled gridlines, and month names, then
 * initials, then nothing, as each bar's slot narrows.
 */
export function plannedBarDensity(width: number, bars: number, height: number): { axis: boolean; labels: "month" | "initial" | "none" } {
  if (width <= 0 || height <= 0 || bars <= 0) return { axis: false, labels: "none" }
  const axis = height >= 110 && width >= 240
  const slot = (width - (axis ? AXIS_WIDTH : 0)) / bars
  const labels = height < 48 ? "none" : slot >= 30 ? "month" : slot >= 11 ? "initial" : "none"
  return { axis, labels }
}

const LIST_ROW = 34

/** How many list rows fit in `height` px, never more than `count`. */
export function plannedListRows(height: number, count: number): number {
  return Math.max(0, Math.min(count, Math.floor(height / LIST_ROW)))
}

/**
 * The first candidate (most precise first) whose estimated width at `fontPx`
 * fits `availPx`; the last (shortest) when none does. An estimate, not a
 * measurement: digits run about 0.56 em wide.
 */
export function fitText(candidates: string[], availPx: number, fontPx: number): string {
  if (candidates.length === 0) return ""
  return candidates.find((c) => c.length * fontPx * 0.56 <= availPx) ?? candidates[candidates.length - 1]
}
