import { prisma } from "@/lib/prisma"

// Notifications are reminders, not records: the service record, warranty or
// policy they point at holds the history. A year is long enough to look back on
// what came up last season, and keeps the table from growing forever.
export const NOTIFICATION_RETENTION_DAYS = 365

export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

/** Deletes notifications older than the retention period. Returns how many went. */
export async function pruneOldNotifications(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.notification.deleteMany({ where: { createdAt: { lt: retentionCutoff(now) } } })
  return count
}
