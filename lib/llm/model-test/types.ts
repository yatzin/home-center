import type { HistoryMessage } from "../types"

// The admin model test: a fixed set of simulated questions run against the
// configured model with made-up data — nothing comes from the database — so
// models and settings can be compared on equal terms.

/**
 * - "tool-choice": one model call; does it pick the right lookup with sensible arguments?
 * - "answer": the lookups have "already run" with the given results; does the reply use them correctly?
 * - "end-to-end": the full assistant loop, with fake tools serving the case's fixtures.
 */
/** Every fixture is written as if today were this date; the system prompt says so too. */
export const MODEL_TEST_TODAY = "2026-06-15"

export type Stage = "tool-choice" | "answer" | "end-to-end"

export const STAGES: { id: Stage; label: string; description: string }[] = [
  { id: "tool-choice", label: "Picks the right lookup", description: "Given a question, does the model ask for the right data?" },
  { id: "answer", label: "Answers from the data", description: "Given the data, does the model answer correctly and stick to it?" },
  { id: "end-to-end", label: "Whole conversation", description: "The full assistant, with made-up data behind every lookup." },
]

export type ToolCallRecord = { name: string; args: Record<string, unknown> }

/** What a case produced. For "answer" cases toolCalls is whatever the model asked for anyway. */
export type Outcome = {
  toolCalls: ToolCallRecord[]
  answer: string
  rounds: number
}

export type CheckResult = { pass: boolean; reason: string }

/** A tool result the model is told it already received (stage "answer"). */
export type GivenResult = { name: string; args: Record<string, unknown>; result: unknown }

/** Fake data for stage "end-to-end": a fixed result, or one computed from the model's arguments. */
export type Fixture = ((args: Record<string, unknown>) => unknown) | Record<string, unknown> | unknown[] | string | number | boolean | null

export type ModelTestCase = {
  /** Stable, unique, kebab-case. */
  id: string
  stage: Stage
  /** Plain-language group, e.g. "Spending", "Maintenance", "Health", "Warranties", "Safety", "Conversation". */
  category: string
  /** What is being tested, in plain words, e.g. "Totals spending per vehicle". */
  title: string
  /** The user's question. */
  question: string
  /** Earlier turns, text only — exactly what the browser keeps. */
  history?: HistoryMessage[]
  /** Stage "answer": lookups already made and what they returned. */
  given?: GivenResult[]
  /** Stage "end-to-end": fake result per tool name. Tools without one return an error. */
  fixtures?: Record<string, Fixture>
  check: (outcome: Outcome) => CheckResult
}

/** Streamed from /api/assistant-test to the page, one JSON object per line. */
export type ModelTestEvent =
  | { type: "start"; total: number; model: string; temperature: number | null; extraBody: string | null; today: string }
  | { type: "warmup"; ms: number; ok: boolean; error?: string }
  | { type: "running"; key: string; id: string; rep: number }
  | {
      type: "result"
      key: string
      id: string
      rep: number
      pass: boolean
      reason: string
      ms: number
      answer: string
      toolCalls: ToolCallRecord[]
      rounds: number
      error?: string
    }
  | { type: "done"; passed: number; failed: number; ms: number }
  | { type: "error"; message: string }
