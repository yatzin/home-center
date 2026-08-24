import type { AssetType } from "@/app/generated/prisma/client"

// A schedule can come due two ways: by date, or — for vehicles — by odometer.
// The rule used to live only in the asset-detail list, with the mileage warning
// window hardcoded at 500, so the dashboard, the maintenance page and the
// notification checker all reported a truck 300 miles past its oil change as
// "not due". It lives here now, reads reminderMilesBefore, and is the single
// definition all four share.

export type DueInput = {
  assetType: AssetType
  assetId: string
  nextDueDate: Date | null
  nextDueMileage: number | null
  reminderDaysBefore: number
  reminderMilesBefore: number
}

export type Due = {
  overdue: boolean
  dueSoon: boolean
  /** Days until due; negative when past due. Null when the schedule has no date. */
  daysLeft: number | null
  /** Miles until due; negative when past due. Null when it isn't mileage-tracked. */
  milesLeft: number | null
  /** Which side of the schedule is driving the status, for wording messages. */
  reason: "date" | "mileage" | null
}

/**
 * Odometer readings by vehicle id. Only vehicles have one. Built on the server
 * by loadVehicleMileage in lib/maintenance-due-server.ts — this module stays
 * free of Prisma so the asset-detail list can import it from the client.
 */
export type MileageIndex = Map<string, number>

export function scheduleDue(s: DueInput, mileage: MileageIndex, now: Date = new Date()): Due {
  const daysLeft = s.nextDueDate
    ? Math.ceil((new Date(s.nextDueDate).getTime() - now.getTime()) / 86400000)
    : null

  // Mileage only means anything for a vehicle whose odometer we actually know.
  const current = s.assetType === "VEHICLE" ? mileage.get(s.assetId) : undefined
  const milesLeft = s.nextDueMileage != null && current != null ? s.nextDueMileage - current : null

  const overdueByDate = daysLeft != null && daysLeft < 0
  const overdueByMiles = milesLeft != null && milesLeft < 0
  const soonByDate = daysLeft != null && daysLeft >= 0 && daysLeft <= s.reminderDaysBefore
  const soonByMiles = milesLeft != null && milesLeft >= 0 && milesLeft <= s.reminderMilesBefore

  const overdue = overdueByDate || overdueByMiles
  const dueSoon = !overdue && (soonByDate || soonByMiles)

  // Prefer whichever side actually triggered; when both did, mileage is the
  // more specific fact to tell someone about.
  let reason: Due["reason"] = null
  if (overdue) reason = overdueByMiles ? "mileage" : "date"
  else if (dueSoon) reason = soonByMiles ? "mileage" : "date"

  return { overdue, dueSoon, daysLeft, milesLeft, reason }
}

/** Badge wording shared by the maintenance page and the asset-detail list. */
export function dueBadge(due: Due, hasSchedule: boolean) {
  if (due.overdue) return { label: "Overdue", variant: "destructive" as const }
  if (due.dueSoon) {
    if (due.reason === "mileage" && due.milesLeft != null) {
      return { label: `${due.milesLeft.toLocaleString()} mi`, variant: "secondary" as const }
    }
    return { label: due.daysLeft != null ? `${due.daysLeft}d` : "Due soon", variant: "secondary" as const }
  }
  return hasSchedule ? { label: "OK", variant: "outline" as const } : null
}

/**
 * The rows worth evaluating: anything with a date inside the window, plus every
 * mileage-tracked row (an odometer has no equivalent of "within 30 days", so
 * they have to be checked in JS).
 */
export function dueCandidateFilter(withinDays: number, now: Date = new Date()) {
  return {
    isActive: true,
    OR: [
      { nextDueDate: { lte: new Date(now.getTime() + withinDays * 86400000) } },
      { nextDueMileage: { not: null } },
    ],
  }
}
