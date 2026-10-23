// Pure data shaping for dashboard cards (no Prisma, no React), so it is tested
// on fixed fixtures. The loaders in loaders.ts fetch; this decides.
import { scheduleDue, type Due, type DueInput, type MileageIndex } from "@/lib/maintenance-due"

/** The window the Due card's headline counts, in days (the legacy "Due (30d)"). */
export const DUE_WINDOW_DAYS = 30

const severity = (d: Due) => (d.overdue ? 0 : d.dueSoon ? 1 : 2)

/**
 * The candidates that are actually due: overdue, due soon by their own reminder
 * window, or within `windowDays` (default DUE_WINDOW_DAYS, inclusive). Most
 * severe first (overdue, soon, later), then fewest days left, then id so the
 * order is stable. Mirrors the legacy dashboard: a truck 300 miles past an oil
 * change ranks above a date-only item.
 */
export function dueMaintenance<T extends DueInput & { id: string }>(
  candidates: readonly T[],
  mileage: MileageIndex,
  now: Date,
  windowDays: number = DUE_WINDOW_DAYS,
): { s: T; due: Due }[] {
  return candidates
    .map((s) => ({ s, due: scheduleDue(s, mileage, now) }))
    .filter(({ due }) => due.overdue || due.dueSoon || (due.daysLeft != null && due.daysLeft <= windowDays))
    .sort(
      (a, b) =>
        severity(a.due) - severity(b.due) ||
        (a.due.daysLeft ?? Infinity) - (b.due.daysLeft ?? Infinity) ||
        a.s.id.localeCompare(b.s.id),
    )
}

export function dueMaintenanceCount<T extends DueInput & { id: string }>(
  candidates: readonly T[],
  mileage: MileageIndex,
  now: Date,
): number {
  return dueMaintenance(candidates, mileage, now).length
}

export type PropertyRooms = {
  propertyId: string
  propertyName: string
  /** The property's true room count, whatever `rooms` was cut to. */
  roomCount: number
  /** Room chips for the large tier; a bounded sample, possibly fewer than roomCount (or none). */
  rooms: { id: string; name: string }[]
}

/**
 * Per-property room counts joined with a (bounded) sample of room names. Every
 * property with rooms stays in the result with its true count; only the chips
 * are limited. Properties and rooms ordered by name.
 */
export function roomGroups(
  counts: readonly { propertyId: string; propertyName: string; count: number }[],
  chips: readonly { id: string; name: string; propertyId: string }[],
): PropertyRooms[] {
  const byName = (a: string, b: string) => a.localeCompare(b)
  return counts
    .filter((c) => c.count > 0)
    .map((c) => ({
      propertyId: c.propertyId,
      propertyName: c.propertyName,
      roomCount: c.count,
      rooms: chips
        .filter((r) => r.propertyId === c.propertyId)
        .map((r) => ({ id: r.id, name: r.name }))
        .sort((a, b) => byName(a.name, b.name)),
    }))
    .sort((a, b) => byName(a.propertyName, b.propertyName))
}

/** Mileage-driven items report the meter; date-driven ones report days. */
export function dueLabel(due: Due, fmt: { meterShort: (u: NonNullable<Due["meterUnit"]>) => string }): string {
  if (due.reason === "mileage" && due.milesLeft != null) {
    const unit = fmt.meterShort(due.meterUnit ?? "MILES")
    return due.milesLeft < 0
      ? `${Math.abs(due.milesLeft).toLocaleString("en-US")} ${unit} over`
      : `${due.milesLeft.toLocaleString("en-US")} ${unit}`
  }
  const d = due.daysLeft
  if (d === null) return "—"
  return d < 0 ? `${Math.abs(d)}d late` : d === 0 ? "Today" : `${d}d`
}

/** The most urgent `limit` due schedules (ranked as the legacy Reminders card), and how many are due in all. */
export function urgentMaintenance<T extends DueInput & { id: string }>(
  candidates: readonly T[],
  mileage: MileageIndex,
  now: Date,
  limit: number,
  windowDays: number = DUE_WINDOW_DAYS,
): { total: number; items: { s: T; due: Due }[] } {
  const due = dueMaintenance(candidates, mileage, now, windowDays)
  return { total: due.length, items: due.slice(0, Math.max(0, limit)) }
}

export type Urgency = "overdue" | "dueSoon" | "upcoming"

const URGENCY_LABELS: Record<Urgency, string> = { overdue: "Overdue", dueSoon: "Due soon", upcoming: "Upcoming" }
const URGENCY_ORDER: Urgency[] = ["overdue", "dueSoon", "upcoming"]

export const urgencyOf = (due: Due): Urgency => (due.overdue ? "overdue" : due.dueSoon ? "dueSoon" : "upcoming")

/** Items split into overdue / due soon / upcoming, in that order; empty groups omitted, item order kept. */
export function groupByUrgency<T extends { urgency: Urgency }>(items: readonly T[]): { key: Urgency; label: string; items: T[] }[] {
  return URGENCY_ORDER.map((key) => ({ key, label: URGENCY_LABELS[key], items: items.filter((i) => i.urgency === key) })).filter(
    (g) => g.items.length > 0,
  )
}

const DAY_MS = 86400000

/**
 * Warranties expiring from now through `windowDays` (both ends inclusive),
 * soonest first (ties by id), cut to `limit`; `total` is the count before the
 * cut. Rows without an expiration date never expire, so they are not listed.
 * `daysLeft` rounds up, as the legacy card does.
 */
export function expiringWarranties<T extends { id: string; expirationDate: Date | null }>(
  rows: readonly T[],
  now: Date,
  windowDays: number,
  limit: number,
): { total: number; items: (T & { expirationDate: Date; daysLeft: number })[] } {
  const end = now.getTime() + windowDays * DAY_MS
  const inWindow = rows
    .filter((r): r is T & { expirationDate: Date } => r.expirationDate != null && r.expirationDate.getTime() >= now.getTime() && r.expirationDate.getTime() <= end)
    .sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime() || a.id.localeCompare(b.id))
  return {
    total: inWindow.length,
    items: inWindow
      .slice(0, Math.max(0, limit))
      .map((r) => ({ ...r, daysLeft: Math.ceil((r.expirationDate.getTime() - now.getTime()) / DAY_MS) })),
  }
}

/** "2026-07" from the date's local fields, the same day the formatter shows. */
export const monthKeyOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

/** Consecutive items sharing a monthKey, grouped; the label is the first item's. */
export function groupByMonth<T extends { monthKey: string; monthLabel: string }>(
  items: readonly T[],
): { key: string; label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.key === item.monthKey) last.items.push(item)
    else groups.push({ key: item.monthKey, label: item.monthLabel, items: [item] })
  }
  return groups
}
