import { prisma } from "@/lib/prisma"
import { notificationService } from "./channels"

const WARRANTY_WARN_DAYS = 60

// Checks for due maintenance and expiring warranties, creating in-app notifications where needed.
// Safe to call on every dashboard load — deduplication prevents duplicate notifications.
export async function checkAndNotify() {
  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "USER"] } },
    select: { id: true },
  })
  if (users.length === 0) return

  const now = new Date()

  // ── Maintenance due ───────────────────────────────────────────────────────
  const schedules = await prisma.maintenanceSchedule.findMany({
    where: {
      isActive: true,
      nextDueDate: { lte: new Date(now.getTime() + 30 * 86400000) }, // within 30 days
    },
  })

  for (const s of schedules) {
    const daysLeft = s.nextDueDate
      ? Math.ceil((new Date(s.nextDueDate).getTime() - now.getTime()) / 86400000)
      : null

    if (daysLeft === null || daysLeft > s.reminderDaysBefore) continue

    for (const user of users) {
      const exists = await prisma.notification.findFirst({
        where: { userId: user.id, relatedEntityId: s.id, type: "MAINTENANCE_DUE", isRead: false },
      })
      if (exists) continue

      const isOverdue = daysLeft < 0
      await notificationService.send({
        userId: user.id,
        type: "MAINTENANCE_DUE",
        title: isOverdue ? `Overdue: ${s.title}` : `Due soon: ${s.title}`,
        message: isOverdue
          ? `"${s.title}" was due ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""} ago.`
          : `"${s.title}" is due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`,
        relatedEntityId: s.id,
        relatedEntityType: "MaintenanceSchedule",
      })
    }
  }

  // ── Warranties expiring ───────────────────────────────────────────────────
  const warranties = await prisma.warranty.findMany({
    where: {
      expirationDate: {
        gte: now,
        lte: new Date(now.getTime() + WARRANTY_WARN_DAYS * 86400000),
      },
    },
  })

  for (const w of warranties) {
    const daysLeft = Math.ceil((new Date(w.expirationDate!).getTime() - now.getTime()) / 86400000)

    for (const user of users) {
      const exists = await prisma.notification.findFirst({
        where: { userId: user.id, relatedEntityId: w.id, type: "WARRANTY_EXPIRING", isRead: false },
      })
      if (exists) continue

      await notificationService.send({
        userId: user.id,
        type: "WARRANTY_EXPIRING",
        title: `Warranty expiring: ${w.productName}`,
        message: `Warranty for "${w.productName}" expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`,
        relatedEntityId: w.id,
        relatedEntityType: "Warranty",
      })
    }
  }
}
