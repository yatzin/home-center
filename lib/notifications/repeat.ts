// How often a due item is raised again, chosen per person under
// Settings → Notifications. Pure so the rules can be tested without a database.
//
// A "cycle" is one due date of one item. Logging the service, moving a refill
// date or editing a warranty changes the cycle key, so the next due date is
// treated as new whatever happened to the last one.

export type NotificationRepeat = "ONCE" | "REACHED_AND_DUE" | "UNTIL_DISMISSED"

/** REACHED: inside the warning window. DUE: on or after the due date. */
export type Stage = "REACHED" | "DUE"

// What each option does, shown under the dropdown as "Applies as:". The first
// notification comes when an item enters its warning window: a maintenance
// reminder's own "Remind (days before)", or a fixed window for the rest.
export const REPEAT_OPTIONS: { value: NotificationRepeat; label: string; applies: string }[] = [
  {
    value: "REACHED_AND_DUE",
    label: "When it's coming up, and on the due date",
    applies:
      "Each due item sends 2 notifications. The first comes when it's coming up: a maintenance reminder uses its own \"Remind (days before)\" setting, and other items use fixed windows (7 to 60 days). The second comes on the day it's due. Nothing in between.",
  },
  {
    value: "ONCE",
    label: "Only once",
    applies:
      "Each due item sends 1 notification, the first time a check finds it due: normally when it's coming up (a maintenance reminder uses its own \"Remind (days before)\" setting, and other items use fixed windows of 7 to 60 days), or on the due date if it wasn't noticed earlier. Nothing more until it gets a new due date.",
  },
  {
    value: "UNTIL_DISMISSED",
    label: "Every check until dismissed",
    applies:
      "Each due item sends the same notification again on every check, starting when it's coming up. It stops when you dismiss it, or when you complete or snooze a maintenance reminder.",
  },
]

/** An existing notification for the same person, type and item. */
export type Prior = {
  id: string
  cycleKey: string | null
  stage: string | null
  dismissedAt: Date | null
  createdAt: Date
}

export type Decision = { action: "create" } | { action: "resurface"; id: string } | { action: "skip" }

const CREATE: Decision = { action: "create" }
const SKIP: Decision = { action: "skip" }

export function decide(mode: NotificationRepeat, stage: Stage, cycleKey: string, prior: Prior[]): Decision {
  // Rows written before cycles were tracked can't be matched to a due date.
  // Keep the old rule for them: one that is still open means "already told".
  if (prior.some((p) => p.cycleKey === null && !p.dismissedAt)) return SKIP

  const current = prior.filter((p) => p.cycleKey === cycleKey)
  if (current.length === 0) return CREATE

  switch (mode) {
    case "ONCE":
      return SKIP
    case "REACHED_AND_DUE":
      return current.some((p) => p.stage === stage) ? SKIP : CREATE
    case "UNTIL_DISMISSED": {
      if (current.some((p) => p.dismissedAt)) return SKIP
      const latest = current.reduce((a, b) => (b.createdAt > a.createdAt ? b : a))
      return { action: "resurface", id: latest.id }
    }
  }
}

/** Joins the fields that define one due date, so any change starts a new cycle. */
export function cycleKeyOf(...parts: (Date | number | string | null | undefined)[]): string {
  return parts.map((p) => (p instanceof Date ? p.toISOString() : p ?? "")).join("|")
}

/**
 * The cycle of a maintenance reminder's current due date. A snooze that has run
 * out starts a new cycle, so it's raised again whatever the repeat setting;
 * unsnoozed rows keep the original two-part key.
 */
export function maintenanceCycleKey(s: { nextDueDate: Date | null; nextDueMileage: number | null; snoozedUntil: Date | null }): string {
  return s.snoozedUntil
    ? cycleKeyOf(s.nextDueDate, s.nextDueMileage, s.snoozedUntil)
    : cycleKeyOf(s.nextDueDate, s.nextDueMileage)
}
