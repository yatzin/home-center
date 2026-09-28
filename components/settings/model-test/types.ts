import type { ModelTestCatalogEntry } from "@/lib/llm/model-test/cases"
import type { Stage, ToolCallRecord } from "@/lib/llm/model-test/types"

// Client-side types for the admin model-test page. Nothing here talks to the
// server directly; use-model-test.ts turns ModelTestEvent (from the shared
// lib types) into this shape as it streams in.

export type CaseStatus = "pending" | "running" | "pass" | "fail"

/** One row in the results list: a case at a given repeat index. */
export type CaseRunState = {
  key: string
  id: string
  rep: number
  status: CaseStatus
  reason?: string
  ms?: number
  answer?: string
  toolCalls?: ToolCallRecord[]
  rounds?: number
  error?: string
}

export type WarmupState = { status: "pending" | "ok" | "warn"; ms?: number; error?: string }

export type StageScore = { stage: Stage; label: string; passed: number; total: number }

/**
 * One saved run. `temperature`/`extraBody` are the raw values actually sent
 * (blank = none), kept in full so "Use these settings" can restore them
 * exactly — the run-history table truncates extraBody for display only.
 */
export type HistoryEntry = {
  at: string
  model: string
  temperature: string
  extraBody: string
  passed: number
  total: number
  scorePct: number
  avgMs: number
  perStage: { stage: Stage; passed: number; total: number }[]
  stoppedEarly: boolean
  /** Lookup rounds the run allowed; absent in runs saved before the setting existed. */
  rounds?: number
  /** Topics the run was limited to; absent = every topic. */
  topics?: string[]
}

export type ExtraPreset = { label: string; value: string }

export const EXTRA_PRESETS: ExtraPreset[] = [
  { label: "Thinking off", value: JSON.stringify({ chat_template_kwargs: { enable_thinking: false } }) },
  { label: "Thinking on", value: JSON.stringify({ chat_template_kwargs: { enable_thinking: true } }) },
  { label: "None", value: "" },
]

export type { ModelTestCatalogEntry, Stage }
