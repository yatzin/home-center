import { prisma } from "@/lib/prisma"
import { notificationService, type NotificationPayload } from "./channels"
import { scheduleDue, dueCandidateFilter, meterUnitWord, type Due } from "@/lib/maintenance-due"
import { loadVehicleMileage } from "@/lib/maintenance-due-server"

const WARRANTY_WARN_DAYS = 60
const MAINTENANCE_WINDOW_DAYS = 30

const plural = (n: number, unit: string) => `${n.toLocaleString()} ${unit}${n !== 1 ? "s" : ""}`

// Says which of the two clocks ran out, so "due soon" on an oil change reads
// "in 300 miles" rather than a date the owner may be nowhere near.
function dueMessage(title: string, due: Due) {
  if (due.reason === "mileage" && due.milesLeft != null) {
    const word = meterUnitWord(due.meterUnit ?? "MILES")
    return due.milesLeft < 0
      ? `"${title}" was due ${plural(Math.abs(due.milesLeft), word)} ago.`
      : `"${title}" is due in ${plural(due.milesLeft, word)}.`
  }
  if (due.daysLeft == null) return `"${title}" is due.`
  return due.daysLeft < 0
    ? `"${title}" was due ${plural(Math.abs(due.daysLeft), "day")} ago.`
    : `"${title}" is due in ${plural(due.daysLeft, "day")}.`
}

const dedupKey = (userId: string, type: string, entityId: string) => `${userId}:${type}:${entityId}`

/**
 * Creates in-app notifications for due maintenance and expiring warranties.
 *
 * Called by the scheduler in ./scheduler.ts, which is the only caller — it
 * serialises runs, so the dedup read below can't race another pass writing the
 * same notification between the read and the write.
 *
 * Returns how many notifications it created, for the scheduler's log line.
 */
export async function checkAndNotify(): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true } })
  if (users.length === 0) return 0

  const now = new Date()

  const [schedules, mileage, warranties] = await Promise.all([
    prisma.maintenanceSchedule.findMany({ where: dueCandidateFilter(MAINTENANCE_WINDOW_DAYS, now) }),
    loadVehicleMileage(),
    prisma.warranty.findMany({
      where: {
        expirationDate: {
          gte: now,
          lte: new Date(now.getTime() + WARRANTY_WARN_DAYS * 86400000),
        },
      },
    }),
  ])

  // Build every notification this run would want to send, then filter against
  // what already exists. Asking the database per row per user instead cost one
  // sequential round-trip each, which grew with both counts.
  const wanted: NotificationPayload[] = []

  for (const s of schedules) {
    const due = scheduleDue(s, mileage, now)
    if (!due.overdue && !due.dueSoon) continue

    for (const user of users) {
      wanted.push({
        userId: user.id,
        type: "MAINTENANCE_DUE",
        title: due.overdue ? `Overdue: ${s.title}` : `Due soon: ${s.title}`,
        message: dueMessage(s.title, due),
        relatedEntityId: s.id,
        relatedEntityType: "MaintenanceSchedule",
      })
    }
  }

  for (const w of warranties) {
    const daysLeft = Math.ceil((new Date(w.expirationDate!).getTime() - now.getTime()) / 86400000)

    for (const user of users) {
      wanted.push({
        userId: user.id,
        type: "WARRANTY_EXPIRING",
        title: `Warranty expiring: ${w.productName}`,
        message: `Warranty for "${w.productName}" expires in ${plural(daysLeft, "day")}.`,
        relatedEntityId: w.id,
        relatedEntityType: "Warranty",
      })
    }
  }

  if (wanted.length === 0) return 0

  // One read covers the whole run. An unread notification for the same entity
  // means the user hasn't dealt with it yet, so don't pile on another.
  const existing = await prisma.notification.findMany({
    where: {
      isRead: false,
      relatedEntityId: { in: [...new Set(wanted.map((w) => w.relatedEntityId!))] },
    },
    select: { userId: true, type: true, relatedEntityId: true },
  })
  const seen = new Set(existing.map((e) => dedupKey(e.userId, e.type, e.relatedEntityId!)))

  const fresh = wanted.filter((w) => !seen.has(dedupKey(w.userId, w.type, w.relatedEntityId!)))

  // Sent through the channel service rather than a bulk insert so that adding
  // an email or push channel still delivers these.
  for (const payload of fresh) await notificationService.send(payload)

  return fresh.length
}
