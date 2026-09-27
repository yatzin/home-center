import { describe, expect, it } from "vitest"
import { analyzeObservations, MAX_LOG_ROWS, timeOfDay, type LogEntry } from "./observation-log"

const alex = { id: "h-alex", name: "Alex" }
let n = 0
const entry = (date: string, extra: Partial<LogEntry> = {}): LogEntry => ({
  id: `o${++n}`, date: new Date(date), time: null, type: "Meltdown", severity: null, durationMinutes: null,
  notes: null, tags: null, condition: null, person: alex, ...extra,
})
const opts = { href: (e: LogEntry) => `/assets/people/${e.person.id}?tab=observations&open=${e.id}`, manyPeople: false }

describe("timeOfDay", () => {
  it("buckets the clock", () => {
    expect(["05:59", "06:00", "11:59", "12:00", "16:59", "17:00", "21:59", "22:00"].map(timeOfDay)).toEqual([
      "night", "morning", "morning", "afternoon", "afternoon", "evening", "evening", "night",
    ])
  })
})

describe("analyzeObservations", () => {
  it("summarises counts, patterns and tags, newest entries first", () => {
    const r = analyzeObservations(
      [
        // 2026-06-01 is a Monday.
        entry("2026-06-01", { time: "07:30", severity: 4, durationMinutes: 20, tags: "school, tired", notes: "Before the bus", condition: { name: "ADHD" } }),
        entry("2026-06-08", { time: "18:00", severity: 2, tags: "Tired" }),
        entry("2026-05-20", { type: "Bad night" }),
      ],
      opts
    )
    expect(r.summary).toEqual({ count: 3, byType: [{ type: "Meltdown", count: 2 }, { type: "Bad night", count: 1 }], avgSeverity: 3, totalMinutes: 20 })
    expect(r.byMonth).toEqual([{ month: "2026-05", count: 1 }, { month: "2026-06", count: 2 }])
    expect(r.byWeekday).toEqual({ Monday: 2, Wednesday: 1 })
    expect(r.byTimeOfDay).toEqual({ morning: 1, evening: 1, untimed: 1 })
    expect(r.topTags).toEqual([{ tag: "tired", count: 2 }, { tag: "school", count: 1 }])
    const rows = r.rows as Record<string, unknown>[]
    expect(rows.map((x) => x.date)).toEqual(["2026-06-08", "2026-06-01", "2026-05-20"])
    expect(rows[1]).toEqual({
      id: rows[1].id, date: "2026-06-01", time: "07:30", type: "Meltdown", severity: 4, durationMinutes: 20,
      condition: "ADHD", tags: "school, tired", notes: "Before the bus", href: `/assets/people/h-alex?tab=observations&open=${rows[1].id}`,
    })
    expect(r.note).toBeUndefined()
  })

  it("names the person only when several are mixed, and says when rows are cut", () => {
    const many = Array.from({ length: MAX_LOG_ROWS + 2 }, (_, i) => entry(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`))
    const r = analyzeObservations(many, { ...opts, manyPeople: true })
    expect((r.rows as unknown[]).length).toBe(MAX_LOG_ROWS)
    expect((r.rows as Record<string, unknown>[])[0].person).toBe("Alex")
    expect(r.note).toBe(`Showing the newest ${MAX_LOG_ROWS} of ${MAX_LOG_ROWS + 2} entries; the counts above cover all of them.`)
    expect(r.byTimeOfDay).toBeUndefined()
  })
})
