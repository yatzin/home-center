import type { Stage } from "@/lib/llm/model-test/types"
import type { CaseRunState, HistoryEntry, ModelTestCatalogEntry } from "./types"

// Pure helpers for the model-test page: formatting, scoring and localStorage
// history. No React here, so this is easy to unit-test if needed and keeps
// use-model-test.ts focused on state transitions.

export const HISTORY_KEY = "hc.modelTest.history"
const MAX_HISTORY = 10

export function formatSeconds(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—"
  return `${(ms / 1000).toFixed(1)}s`
}

/** A single-line, length-capped preview of the extra JSON for a history row. */
export function shortJson(raw: string | null | undefined, max = 60): string {
  if (!raw) return "—"
  const flat = raw.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export function formatTemperature(t: number | string | null | undefined): string {
  if (t === null || t === undefined || t === "") return "default"
  return String(t)
}

/** The raw value as it belongs in the form field: "" (not "default") when unset. */
function fieldTemperature(t: number | string | null | undefined): string {
  if (t === null || t === undefined) return ""
  return String(t)
}

/** Per-stage pass counts across every result row that has finished. */
export function stageScores(
  catalog: ModelTestCatalogEntry[],
  repeat: number,
  selectedIds: Set<string>,
  results: Record<string, CaseRunState>,
  stages: { id: Stage; label: string }[]
): { stage: Stage; label: string; passed: number; total: number }[] {
  return stages.map(({ id, label }) => {
    const casesInStage = catalog.filter((c) => c.stage === id && selectedIds.has(c.id))
    let passed = 0
    let total = 0
    for (const c of casesInStage) {
      for (let rep = 0; rep < repeat; rep++) {
        const r = results[`${c.id}#${rep}`]
        total++
        if (r?.status === "pass") passed++
      }
    }
    return { stage: id, label, passed, total }
  })
}

/** Builds the history row saved when a run finishes (or is stopped mid-way). */
export function buildHistoryEntry(args: {
  model: string
  temperature: number | string | null
  extraBody: string | null
  results: Record<string, CaseRunState>
  catalog: ModelTestCatalogEntry[]
  repeat: number
  selectedIds: Set<string>
  stages: { id: Stage; label: string }[]
  stoppedEarly: boolean
  topics?: string[]
}): HistoryEntry {
  const finished = Object.values(args.results).filter((r) => r.status === "pass" || r.status === "fail")
  const passed = finished.filter((r) => r.status === "pass").length
  const total = finished.length
  const withMs = finished.filter((r): r is CaseRunState & { ms: number } => typeof r.ms === "number")
  const avgMs = withMs.length ? withMs.reduce((sum, r) => sum + r.ms, 0) / withMs.length : 0
  const perStage = stageScores(args.catalog, args.repeat, args.selectedIds, args.results, args.stages).map((s) => ({
    stage: s.stage,
    passed: s.passed,
    total: s.total,
  }))
  return {
    at: new Date().toISOString(),
    model: args.model,
    temperature: fieldTemperature(args.temperature),
    extraBody: args.extraBody ?? "",
    passed,
    total,
    scorePct: total ? Math.round((passed / total) * 100) : 0,
    avgMs: Math.round(avgMs),
    perStage,
    stoppedEarly: args.stoppedEarly,
    ...(args.topics?.length ? { topics: args.topics } : {}),
  }
}

function isHistoryEntry(v: unknown): v is HistoryEntry {
  if (!v || typeof v !== "object") return false
  const e = v as Record<string, unknown>
  return (
    typeof e.at === "string" &&
    typeof e.model === "string" &&
    typeof e.temperature === "string" &&
    typeof e.extraBody === "string" &&
    typeof e.passed === "number" &&
    typeof e.total === "number" &&
    typeof e.scorePct === "number" &&
    typeof e.avgMs === "number" &&
    Array.isArray(e.perStage) &&
    typeof e.stoppedEarly === "boolean" &&
    (e.topics === undefined || (Array.isArray(e.topics) && e.topics.every((t) => typeof t === "string")))
  )
}

/** Reads and validates the saved run history; never throws. */
export function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isHistoryEntry)
  } catch {
    return []
  }
}

/** Prepends a run and trims to the last MAX_HISTORY; never throws. */
export function saveHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...loadHistory()].slice(0, MAX_HISTORY)
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // Storage full or unavailable (private browsing) — the run still ran.
  }
  return next
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(HISTORY_KEY)
  } catch {
    // ignore
  }
}
