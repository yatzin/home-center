// The Clock card: its config, and the pure time math behind its view (when
// to tick next, where the analog hands point). Pure TS, shared by the catalog,
// the view and the tests. The time and date formats are not the card's: they
// follow Settings > Regional (lib/regional.ts), and the time is the viewer's
// device time. How it is laid out at each size is in clock-layout.ts.
import { z } from "zod"

export const CLOCK_FACES = ["auto", "always", "never"] as const
/** auto: an analog face from 2x2 up; always: also beside the time on one wide row; never: digital only. */
export type ClockFace = (typeof CLOCK_FACES)[number]

export type ClockConfig = { showSeconds: boolean; showDate: boolean; face: ClockFace }

export const CLOCK_DEFAULTS: Readonly<ClockConfig> = Object.freeze({ showSeconds: false, showDate: true, face: "auto" })

/** The card's configSchema: missing keys get their defaults, unknown keys (a 12/24 hour setting too) are dropped. */
export const clockConfigSchema = z.object({
  showSeconds: z.boolean().default(CLOCK_DEFAULTS.showSeconds),
  showDate: z.boolean().default(CLOCK_DEFAULTS.showDate),
  face: z.enum(CLOCK_FACES).default(CLOCK_DEFAULTS.face),
})

/** A stored config as the card uses it: a missing or damaged value is its default. */
export function readClockConfig(config: Record<string, unknown>): ClockConfig {
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d)
  return {
    showSeconds: bool(config.showSeconds, CLOCK_DEFAULTS.showSeconds),
    showDate: bool(config.showDate, CLOCK_DEFAULTS.showDate),
    face: CLOCK_FACES.find((f) => f === config.face) ?? CLOCK_DEFAULTS.face,
  }
}

/**
 * Milliseconds from `now` to the next whole second (withSeconds) or the next
 * whole local minute: (0, 1000] or (0, 60000]. Read from local fields, so a
 * zone whose offset is not whole minutes still ticks on its own minute. A
 * timer that fires a little early just waits the remainder: no drift.
 */
export function nextTickDelay(now: Date, withSeconds: boolean): number {
  const ms = now.getMilliseconds()
  return withSeconds ? 1000 - ms : 60_000 - (now.getSeconds() * 1000 + ms)
}

/** `ms` rounded down to its second (withSeconds) or its local minute: a stable value between ticks. */
export function tickOf(ms: number, withSeconds: boolean): number {
  const d = new Date(ms)
  d.setMilliseconds(0)
  if (!withSeconds) d.setSeconds(0)
  return d.getTime()
}

/**
 * Hand angles in degrees clockwise from 12, for the local time `d`. The hour
 * hand moves with the minutes; the minute hand moves with the seconds only
 * when the second hand shows (otherwise it steps once a minute, as it ticks).
 */
export function handAngles(d: Date, withSeconds: boolean): { hour: number; minute: number; second: number } {
  const h = d.getHours() % 12
  const m = d.getMinutes()
  const s = d.getSeconds()
  return {
    hour: (h * 60 + m) / 2,
    minute: withSeconds ? (m * 60 + s) / 10 : m * 6,
    second: s * 6,
  }
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/** The local day of the week in English, like the Text card's {weekday}. */
export const weekdayName = (d: Date): string => WEEKDAYS[d.getDay()]
export const weekdayShort = (d: Date): string => WEEKDAYS[d.getDay()].slice(0, 3)
