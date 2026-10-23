// Pure data shaping for dashboard cards (no Prisma, no React), so it is tested
// on fixed fixtures. The loaders in loaders.ts fetch; this decides.
import { scheduleDue, type Due, type DueInput, type MileageIndex } from "@/lib/maintenance-due"

/** The window the Due card's headline counts, in days (the legacy "Due (30d)"). */
export const DUE_WINDOW_DAYS = 30

const severity = (d: Due) => (d.overdue ? 0 : d.dueSoon ? 1 : 2)

/**
 * The candidates that are actually due: overdue, due soon by their own reminder
 * window, or within DUE_WINDOW_DAYS. Most severe first (overdue, soon, later),
 * then fewest days left, then id so the order is stable. Mirrors the legacy
 * dashboard: a truck 300 miles past an oil change ranks above a date-only item.
 */
export function dueMaintenance<T extends DueInput & { id: string }>(
  candidates: readonly T[],
  mileage: MileageIndex,
  now: Date,
): { s: T; due: Due }[] {
  return candidates
    .map((s) => ({ s, due: scheduleDue(s, mileage, now) }))
    .filter(({ due }) => due.overdue || due.dueSoon || (due.daysLeft != null && due.daysLeft <= DUE_WINDOW_DAYS))
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
