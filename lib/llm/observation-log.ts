import { summarizeObservations, type ObservationLike } from "@/lib/observations"
import { compact, toDay } from "./serialize"

// The analysis behind the observation_log tool: counts and the patterns people
// ask about (which days, what time of day, which tags keep coming up), plus the
// entries themselves so the model can quote notes. Pure, so it is tested
// without a database.

export type LogEntry = ObservationLike & {
  id: string
  notes: string | null
  tags: string | null
  condition: { name: string } | null
  person: { id: string; name: string }
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
export const MAX_LOG_ROWS = 40

export function timeOfDay(time: string): "morning" | "afternoon" | "evening" | "night" {
  const h = Number(time.slice(0, 2))
  if (h >= 6 && h < 12) return "morning"
  if (h >= 12 && h < 17) return "afternoon"
  if (h >= 17 && h < 22) return "evening"
  return "night"
}

/** Counts keyed in a stable order, zeros dropped. */
function tally<K extends string>(keys: readonly K[], values: K[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {}
  for (const k of keys) {
    const n = values.filter((v) => v === k).length
    if (n) out[k] = n
  }
  return out
}

export function analyzeObservations(entries: LogEntry[], opts: { href: (e: LogEntry) => string; manyPeople: boolean }) {
  const newest = [...entries].sort((a, b) => b.date.getTime() - a.date.getTime() || (b.time ?? "").localeCompare(a.time ?? ""))
  const months = new Map<string, number>()
  for (const e of entries) {
    const m = toDay(e.date).slice(0, 7)
    months.set(m, (months.get(m) ?? 0) + 1)
  }
  const tagCounts = new Map<string, { tag: string; count: number }>()
  for (const e of entries) {
    for (const t of (e.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      const hit = tagCounts.get(t.toLowerCase())
      if (hit) hit.count++
      else tagCounts.set(t.toLowerCase(), { tag: t, count: 1 })
    }
  }
  const timed = entries.filter((e) => e.time).map((e) => timeOfDay(e.time!))

  return compact({
    summary: summarizeObservations(entries),
    byMonth: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
    byWeekday: tally(WEEKDAYS, entries.map((e) => WEEKDAYS[e.date.getUTCDay()])),
    byTimeOfDay: timed.length ? { ...tally(["morning", "afternoon", "evening", "night"] as const, timed), untimed: entries.length - timed.length } : undefined,
    topTags: [...tagCounts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, 10),
    rows: newest.slice(0, MAX_LOG_ROWS).map((e) =>
      compact({
        id: e.id,
        date: toDay(e.date),
        time: e.time,
        type: e.type,
        severity: e.severity,
        durationMinutes: e.durationMinutes,
        condition: e.condition?.name,
        tags: e.tags,
        notes: e.notes,
        person: opts.manyPeople ? e.person.name : undefined,
        href: opts.href(e),
      })
    ),
    note: entries.length > MAX_LOG_ROWS
      ? `Showing the newest ${MAX_LOG_ROWS} of ${entries.length} entries; the counts above cover all of them.`
      : undefined,
  })
}
