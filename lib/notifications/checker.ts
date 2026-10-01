import { prisma } from "@/lib/prisma"
import { notificationService, type NotificationPayload } from "./channels"
import { scheduleDue, dueCandidateFilter, meterUnitWord, type Due } from "@/lib/maintenance-due"
import { loadVehicleMileage } from "@/lib/maintenance-due-server"
import { daysUntil, HEALTH_WINDOWS, immunizationDue, insuranceExpiring, isSupersededImmunization, refillDue } from "@/lib/health"
import { ownedWhere } from "@/lib/features"
import { loadFeatures } from "@/lib/features-server"

const WARRANTY_WARN_DAYS = 60
const MAINTENANCE_WINDOW_DAYS = 30

const plural = (n: number, unit: string) => `${n.toLocaleString()} ${unit}${n !== 1 ? "s" : ""}`

const DAY = 86_400_000

// "is due in 3 days" / "is due today" / "was due 2 days ago".
function dueWhen(days: number) {
  if (days < 0) return `was due ${plural(-days, "day")} ago`
  if (days === 0) return "is due today"
  return `is due in ${plural(days, "day")}`
}

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
 * Creates in-app notifications for due maintenance, expiring warranties, and health items (refills, vaccines, insurance).
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
  const startOfToday = new Date(now)
  startOfToday.setUTCHours(0, 0, 0, 0)

  // With Health off, nothing about people is raised: no health reminders, and
  // none for a person's own reminders or warranties.
  const features = await loadFeatures()
  const owned = ownedWhere(features)
  const health = <T,>(query: () => Promise<T[]>) => (features.health ? query() : Promise.resolve([] as T[]))

  const [schedules, mileage, warranties, medications, immunizations, policies] = await Promise.all([
    prisma.maintenanceSchedule.findMany({ where: { AND: [dueCandidateFilter(MAINTENANCE_WINDOW_DAYS, now), owned] } }),
    loadVehicleMileage(),
    prisma.warranty.findMany({
      where: {
        ...owned,
        expirationDate: {
          gte: now,
          lte: new Date(now.getTime() + WARRANTY_WARN_DAYS * 86400000),
        },
      },
    }),
    // The date filters only narrow the read; refillDue / immunizationDue /
    // insuranceExpiring below are the rules, shared with the UI badges.
    health(() => prisma.medication.findMany({
      where: { nextRefillDate: { lte: new Date(now.getTime() + HEALTH_WINDOWS.refillDays * DAY) } },
      include: { person: { select: { name: true } } },
    })),
    health(() => prisma.immunization.findMany({
      where: { nextDueDate: { lte: new Date(now.getTime() + HEALTH_WINDOWS.immunizationDays * DAY) } },
      include: { person: { select: { name: true } } },
    })),
    // endDate is stored as UTC midnight, so use startOfToday to include policies ending today.
    health(() => prisma.insurancePolicy.findMany({
      where: { endDate: { gte: startOfToday, lte: new Date(now.getTime() + HEALTH_WINDOWS.insuranceDays * DAY) } },
    })),
  ])

  // A later dose of the same vaccine supersedes an earlier one, so fetch every
  // dose on file for the candidates' people to check that once instead of
  // querying per row.
  const immunizationPersonIds = [...new Set(immunizations.map((i) => i.personId))]
  const immunizationsForCandidates = immunizationPersonIds.length
    ? await prisma.immunization.findMany({
        where: { personId: { in: immunizationPersonIds } },
        select: { personId: true, vaccine: true, dateGiven: true },
      })
    : []

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

  for (const m of medications) {
    if (!refillDue(m, now)) continue
    const days = daysUntil(m.nextRefillDate!, now)
    for (const user of users) {
      wanted.push({
        userId: user.id,
        type: "MEDICATION_REFILL",
        title: `Refill: ${m.name} (${m.person.name})`,
        message: `${m.person.name}'s ${m.name} refill ${dueWhen(days)}.`,
        relatedEntityId: m.id,
        relatedEntityType: "Medication",
      })
    }
  }

  for (const i of immunizations) {
    if (!immunizationDue(i, now) || isSupersededImmunization(i, immunizationsForCandidates)) continue
    const days = daysUntil(i.nextDueDate!, now)
    for (const user of users) {
      wanted.push({
        userId: user.id,
        type: "IMMUNIZATION_DUE",
        title: `Vaccine due: ${i.vaccine} (${i.person.name})`,
        message: `${i.person.name}'s ${i.vaccine} ${dueWhen(days)}.`,
        relatedEntityId: i.id,
        relatedEntityType: "Immunization",
      })
    }
  }

  for (const p of policies) {
    if (!insuranceExpiring(p, now)) continue
    const days = daysUntil(p.endDate!, now)
    const name = p.planName ? `${p.carrier} ${p.planName}` : p.carrier
    for (const user of users) {
      wanted.push({
        userId: user.id,
        type: "INSURANCE_EXPIRING",
        title: `Insurance ending: ${name}`,
        message: days === 0 ? `"${name}" coverage ends today.` : `"${name}" coverage ends in ${plural(days, "day")}.`,
        relatedEntityId: p.id,
        relatedEntityType: "InsurancePolicy",
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
