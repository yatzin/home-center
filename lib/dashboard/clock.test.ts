import { describe, expect, it } from "vitest"
import {
  CLOCK_DEFAULTS,
  clockConfigSchema,
  handAngles,
  nextTickDelay,
  readClockConfig,
  tickOf,
  weekdayName,
  weekdayShort,
} from "./clock"

// Run under several zones too: TZ=America/Los_Angeles, Asia/Tokyo, UTC (see the report).

describe("clockConfigSchema", () => {
  it("fills the defaults: seconds off, date on, face auto", () => {
    expect(clockConfigSchema.parse({})).toEqual({ showSeconds: false, showDate: true, face: "auto" })
    expect(CLOCK_DEFAULTS).toEqual({ showSeconds: false, showDate: true, face: "auto" })
  })

  it("drops unknown keys, including a 12/24 hour setting (that is Settings > Regional)", () => {
    expect(clockConfigSchema.parse({ showSeconds: true, hour12: false, timeZone: "Asia/Tokyo" })).toEqual({
      showSeconds: true,
      showDate: true,
      face: "auto",
    })
  })

  it("rejects bad values", () => {
    expect(clockConfigSchema.safeParse({ face: "sometimes" }).success).toBe(false)
    expect(clockConfigSchema.safeParse({ showSeconds: "yes" }).success).toBe(false)
    expect(clockConfigSchema.safeParse({ showDate: 1 }).success).toBe(false)
  })

  it("accepts every face", () => {
    for (const face of ["auto", "always", "never"]) expect(clockConfigSchema.safeParse({ face }).success).toBe(true)
  })
})

describe("readClockConfig", () => {
  it("reads a stored config, defaulting missing or damaged values", () => {
    expect(readClockConfig({})).toEqual(CLOCK_DEFAULTS)
    expect(readClockConfig({ showSeconds: true, showDate: false, face: "never" })).toEqual({ showSeconds: true, showDate: false, face: "never" })
    expect(readClockConfig({ showSeconds: "true", showDate: null, face: "huge" })).toEqual(CLOCK_DEFAULTS)
  })
})

describe("nextTickDelay", () => {
  it("waits for the next second", () => {
    expect(nextTickDelay(new Date(2026, 9, 27, 10, 42, 7, 250), true)).toBe(750)
    expect(nextTickDelay(new Date(2026, 9, 27, 10, 42, 7, 999), true)).toBe(1)
  })

  it("waits for the next minute", () => {
    expect(nextTickDelay(new Date(2026, 9, 27, 10, 42, 7, 250), false)).toBe(52_750)
    expect(nextTickDelay(new Date(2026, 9, 27, 10, 42, 59, 999), false)).toBe(1)
  })

  it("on a boundary, waits a whole unit (never 0: no busy loop)", () => {
    expect(nextTickDelay(new Date(2026, 9, 27, 10, 42, 0, 0), true)).toBe(1000)
    expect(nextTickDelay(new Date(2026, 9, 27, 10, 42, 0, 0), false)).toBe(60_000)
  })

  it("lands exactly on a local boundary, any time of day (around midnight too)", () => {
    const starts = [
      new Date(2026, 11, 31, 23, 59, 59, 400), // New Year's Eve, just before midnight
      new Date(2026, 9, 27, 0, 0, 0, 1),
      new Date(2026, 1, 28, 23, 59, 30, 0),
    ]
    for (let i = 0; i < 500; i++) starts.push(new Date(Date.UTC(2026, 0, 1) + i * 7_919_017))
    for (const now of starts) {
      for (const withSeconds of [true, false]) {
        const d = nextTickDelay(now, withSeconds)
        expect(d).toBeGreaterThan(0)
        expect(d).toBeLessThanOrEqual(withSeconds ? 1000 : 60_000)
        const at = new Date(now.getTime() + d)
        expect(at.getMilliseconds()).toBe(0)
        if (!withSeconds) expect(at.getSeconds()).toBe(0)
      }
    }
  })

  it("crosses midnight into the next day", () => {
    const now = new Date(2026, 11, 31, 23, 59, 59, 400)
    const at = new Date(now.getTime() + nextTickDelay(now, false))
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2027, 0, 1, 0, 0])
  })

  it("crosses a DST change on a minute boundary (US spring forward and fall back instants)", () => {
    // 2026-03-08 10:00Z is 03:00 PDT in Los Angeles (02:00 never happens); 2026-11-01 09:00Z is 01:00 PST.
    for (const boundary of [Date.UTC(2026, 2, 8, 10, 0, 0), Date.UTC(2026, 10, 1, 9, 0, 0)]) {
      const now = new Date(boundary - 500)
      expect(nextTickDelay(now, false)).toBe(500)
      expect(nextTickDelay(now, true)).toBe(500)
    }
  })
})

describe("tickOf", () => {
  it("rounds down to the second or to the local minute", () => {
    const t = new Date(2026, 9, 27, 10, 42, 7, 250).getTime()
    expect(tickOf(t, true)).toBe(new Date(2026, 9, 27, 10, 42, 7, 0).getTime())
    expect(tickOf(t, false)).toBe(new Date(2026, 9, 27, 10, 42, 0, 0).getTime())
  })

  it("is stable within a unit and changes across one", () => {
    const base = new Date(2026, 9, 27, 10, 42, 0, 0).getTime()
    expect(tickOf(base + 59_999, false)).toBe(tickOf(base, false))
    expect(tickOf(base + 60_000, false)).not.toBe(tickOf(base, false))
    expect(tickOf(base + 999, true)).toBe(tickOf(base, true))
  })
})

describe("handAngles", () => {
  const at = (h: number, m: number, s: number) => new Date(2026, 9, 27, h, m, s)

  it("points every hand at 12 at midnight and noon", () => {
    expect(handAngles(at(0, 0, 0), true)).toEqual({ hour: 0, minute: 0, second: 0 })
    expect(handAngles(at(12, 0, 0), true)).toEqual({ hour: 0, minute: 0, second: 0 })
  })

  it("quarter past three", () => {
    expect(handAngles(at(15, 15, 0), false)).toEqual({ hour: 97.5, minute: 90, second: 0 })
  })

  it("moves the hour hand with the minutes and, with seconds, the minute hand with the seconds", () => {
    expect(handAngles(at(10, 42, 7), true)).toEqual({ hour: 321, minute: 252.7, second: 42 })
    // Without seconds the minute hand jumps once a minute.
    expect(handAngles(at(10, 42, 7), false)).toEqual({ hour: 321, minute: 252, second: 42 })
  })

  it("stays in [0, 360)", () => {
    const a = handAngles(at(23, 59, 59), true)
    for (const v of Object.values(a)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(360)
    }
  })
})

describe("weekdays", () => {
  it("English names for the local day", () => {
    expect(weekdayName(new Date(2026, 9, 27, 0, 0, 1))).toBe("Tuesday")
    expect(weekdayName(new Date(2026, 9, 27, 23, 59, 59))).toBe("Tuesday")
    expect(weekdayShort(new Date(2026, 9, 28, 12))).toBe("Wed")
  })
})
