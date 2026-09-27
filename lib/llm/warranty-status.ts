// Expired / expiring / active for a warranty, by calendar day. Days are compared
// in UTC like the rest of the app's stored dates, so a warranty ending today
// still counts as expiring, not expired.

const DAY = 86_400_000
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

export type WarrantyState = { state: "expired" | "expiring" | "active"; daysLeft: number | null }

export function warrantyState(expiration: Date | null, now: Date, withinDays: number): WarrantyState {
  if (!expiration) return { state: "active", daysLeft: null }
  const daysLeft = Math.round((utcDay(expiration) - utcDay(now)) / DAY)
  if (daysLeft < 0) return { state: "expired", daysLeft }
  return { state: daysLeft <= withinDays ? "expiring" : "active", daysLeft }
}
