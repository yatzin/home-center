// Pure shaping for the Equipment Life card. Client-safe: no Prisma, no React.
// How far through its expected life each item is (lib/equipment-life.ts owns
// the start date and the "same day N years later" rule), ranked and summed.
// Every date is a UTC calendar day, "today" is localDay().
import { z } from "zod"
import { addYearsUTC, equipmentAge, lifeStart, type LifeFields } from "@/lib/equipment-life"

/** From this share of its life an item counts as nearing the end. */
export const LIFE_NEAR = 0.8

export type LifeStatus = "ok" | "near" | "past"

export type LifeRow = {
  id: string
  name: string
  /** Share of the expected life used: 1 at the end, above 1 once past it. */
  pct: number
  status: LifeStatus
  /** Whole months to the end of the life; negative once past it. */
  monthsLeft: number
  /** Whole years old, and the expected life in years. */
  years: number
  lifeYears: number
  replacementCost: number | null
}

export type LifeProgress = Pick<LifeRow, "pct" | "status" | "monthsLeft" | "years" | "lifeYears">

const dayKey = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
const DAY_MS = 86400000

/** Whole months from `a` to a later `b`. */
function monthsBetween(a: Date, b: Date): number {
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  if (b.getUTCDate() < a.getUTCDate()) m--
  return Math.max(0, m)
}

/** Null when the item has no expected life or nothing to count from. */
export function lifeProgress(e: LifeFields, today: Date): LifeProgress | null {
  const start = lifeStart(e)
  const age = equipmentAge(e, today)
  if (!start || !age) return null
  const end = addYearsUTC(start, age.lifeYears)
  const span = (dayKey(end) - dayKey(start)) / DAY_MS
  const used = (dayKey(today) - dayKey(start)) / DAY_MS
  const pct = Math.max(0, used / span)
  const status: LifeStatus = pct >= 1 ? "past" : pct >= LIFE_NEAR ? "near" : "ok"
  const monthsLeft = dayKey(end) >= dayKey(today) ? monthsBetween(today, end) : -monthsBetween(end, today)
  return { pct, status, monthsLeft, years: age.years, lifeYears: age.lifeYears }
}

/** "5 yr left", "7 mo left", "Ends this month", "1 yr over". */
export function lifeRemaining(monthsLeft: number): string {
  const m = Math.abs(monthsLeft)
  if (monthsLeft === 0) return "Ends this month"
  const span = m >= 12 ? `${Math.floor(m / 12)} yr` : `${m} mo`
  return `${span} ${monthsLeft > 0 ? "left" : "over"}`
}

export const LIFE_SHOWS = ["all", "attention"] as const
export type LifeShow = (typeof LIFE_SHOWS)[number]

/** Text values: the settings dialog's choice field keeps strings. */
export const lifeConfigSchema = z.object({ show: z.enum(LIFE_SHOWS).optional() })

export function lifeShowOf(config: Record<string, unknown>): LifeShow {
  return config.show === "attention" ? "attention" : "all"
}

/** Most worn first (ties by name, then id); "attention" keeps only what is near or past its life. */
export function rankLife<T extends Pick<LifeRow, "id" | "name" | "pct" | "status">>(rows: readonly T[], show: LifeShow, max: number): T[] {
  return rows
    .filter((r) => show === "all" || r.status !== "ok")
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, max)
}

export type LifeSummary = {
  tracked: number
  past: number
  near: number
  ok: number
  /** What replacing everything near or past its life would cost, and for how many of those a cost is known. */
  replacement: number
  replacementKnown: number
  mostWorn: LifeRow | null
}

export function summarizeLife(rows: readonly LifeRow[]): LifeSummary {
  const s: LifeSummary = { tracked: rows.length, past: 0, near: 0, ok: 0, replacement: 0, replacementKnown: 0, mostWorn: null }
  for (const r of rows) {
    s[r.status]++
    if (r.status !== "ok" && r.replacementCost != null) {
      s.replacement += r.replacementCost
      s.replacementKnown++
    }
    if (!s.mostWorn || r.pct > s.mostWorn.pct) s.mostWorn = r
  }
  s.replacement = Math.round(s.replacement * 100) / 100
  return s
}

/** The bars' full scale as a share of life: 1 (the end marker is the right edge) until something is past its life, then the most worn item, at most 2. */
export function lifeAxisMax(rows: readonly Pick<LifeRow, "pct">[]): number {
  return Math.min(2, Math.max(1, ...rows.map((r) => r.pct)))
}

/** How many bullet rows fit in `height` px, never more than `count`. */
export function lifeBulletRows(height: number, rowPx: number, count: number): number {
  return Math.max(0, Math.min(count, Math.floor(height / rowPx)))
}
