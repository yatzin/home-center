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

export type PropertyRooms = { propertyId: string; propertyName: string; rooms: { id: string; name: string }[] }

/** Rooms grouped under their property; properties and rooms ordered by name. */
export function roomsByProperty(
  rooms: readonly { id: string; name: string; propertyId: string; propertyName: string }[],
): PropertyRooms[] {
  const groups = new Map<string, PropertyRooms>()
  for (const r of rooms) {
    let g = groups.get(r.propertyId)
    if (!g) groups.set(r.propertyId, (g = { propertyId: r.propertyId, propertyName: r.propertyName, rooms: [] }))
    g.rooms.push({ id: r.id, name: r.name })
  }
  const byName = (a: string, b: string) => a.localeCompare(b)
  return [...groups.values()]
    .map((g) => ({ ...g, rooms: g.rooms.sort((a, b) => byName(a.name, b.name)) }))
    .sort((a, b) => byName(a.propertyName, b.propertyName))
}

/** Mileage-driven items report the meter; date-driven ones report days. */
export function dueLabel(due: Due, fmt: { meterShort: (u: NonNullable<Due["meterUnit"]>) => string }): string {
  if (due.reason === "mileage" && due.milesLeft != null) {
    const unit = fmt.meterShort(due.meterUnit ?? "MILES")
    return due.milesLeft < 0
      ? `${Math.abs(due.milesLeft).toLocaleString()} ${unit} over`
      : `${due.milesLeft.toLocaleString()} ${unit}`
  }
  const d = due.daysLeft
  if (d === null) return "—"
  return d < 0 ? `${Math.abs(d)}d late` : d === 0 ? "Today" : `${d}d`
}
