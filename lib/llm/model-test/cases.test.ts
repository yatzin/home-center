import { describe, expect, it } from "vitest"
import { MODEL_TEST_CASES } from "./cases"
import type { Outcome } from "./types"

// Sanity checks on the case library itself — not on any model. These guard
// against cases that would pass trivially, reference pages that don't exist,
// or drift out of the shape the runner and admin page expect.

const EMPTY: Outcome = { toolCalls: [], answer: "", rounds: 1 }

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ASSET_HREF = /^\/assets\/(properties|vehicles|equipment|people)\/[a-z0-9-]+$/
/** Mirrors the FIXED_PAGES set in lib/llm/link-check.ts — pages that need no lookup to link. */
const FIXED_PAGES = new Set([
  "/", "/chat", "/costs", "/maintenance", "/warranties", "/records", "/insurance", "/providers", "/notifications", "/settings",
  "/assets/properties", "/assets/vehicles", "/assets/equipment", "/assets/people",
])

function collectHrefs(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const v of value) collectHrefs(v, out)
    return
  }
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key === "href" && typeof v === "string") out.push(v)
      else collectHrefs(v, out)
    }
  }
}

const byStage = (stage: string) => MODEL_TEST_CASES.filter((c) => c.stage === stage)

describe("MODEL_TEST_CASES", () => {
  it("has unique, kebab-case ids", () => {
    const ids = MODEL_TEST_CASES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(KEBAB)
  })

  it("keeps stage and total counts in the expected ranges", () => {
    expect(byStage("tool-choice").length).toBeGreaterThanOrEqual(18)
    expect(byStage("tool-choice").length).toBeLessThanOrEqual(22)
    expect(byStage("answer").length).toBeGreaterThanOrEqual(15)
    expect(byStage("answer").length).toBeLessThanOrEqual(18)
    expect(byStage("end-to-end").length).toBeGreaterThanOrEqual(10)
    expect(byStage("end-to-end").length).toBeLessThanOrEqual(14)
    expect(MODEL_TEST_CASES.length).toBeGreaterThanOrEqual(45)
    expect(MODEL_TEST_CASES.length).toBeLessThanOrEqual(55)
  })

  it.each(byStage("answer").map((c) => [c.id, c] as const))("%s: has a non-empty given", (_id, c) => {
    expect(c.given && c.given.length).toBeGreaterThan(0)
  })

  it.each(byStage("end-to-end").map((c) => [c.id, c] as const))("%s: has fixtures", (_id, c) => {
    expect(c.fixtures).toBeDefined()
  })

  it.each(byStage("tool-choice").map((c) => [c.id, c] as const))("%s: has neither given nor fixtures", (_id, c) => {
    expect(c.given).toBeUndefined()
    expect(c.fixtures).toBeUndefined()
  })

  it.each(MODEL_TEST_CASES.map((c) => [c.id, c] as const))("%s: check fails on the empty outcome", (_id, c) => {
    expect(c.check(EMPTY).pass).toBe(false)
  })

  it.each(MODEL_TEST_CASES.map((c) => [c.id, c] as const))("%s: every href is a real asset page or a fixed page", (_id, c) => {
    const hrefs: string[] = []
    for (const g of c.given ?? []) collectHrefs(g.result, hrefs)
    if (c.fixtures) collectHrefs(c.fixtures, hrefs)
    for (const href of hrefs) expect(ASSET_HREF.test(href) || FIXED_PAGES.has(href)).toBe(true)
  })

  it("passes on a hand-written ideal outcome for representative cases, proving the checks aren't too strict", () => {
    const ideal: Record<string, Outcome> = {
      "choice-spending-per-vehicle": {
        toolCalls: [{ name: "cost_summary", args: { groupBy: ["asset"], assetType: "VEHICLE" } }],
        answer: "",
        rounds: 1,
      },
      "choice-small-talk-thanks": { toolCalls: [], answer: "You're welcome!", rounds: 1 },
      "choice-refuse-password-lookup": { toolCalls: [], answer: "I can't share passwords or account credentials.", rounds: 1 },
      "answer-spending-sum-civic": { toolCalls: [], answer: "You've spent $1,344.35 on the Civic in total.", rounds: 1 },
      "answer-health-refill-link": {
        toolCalls: [],
        answer: "[Alex](/assets/people/h-alex) has a Lisinopril refill due June 20.",
        rounds: 1,
      },
      "e2e-two-tools-warranty-and-maintenance": {
        toolCalls: [{ name: "warranty_status", args: {} }, { name: "maintenance_status", args: {} }],
        answer: "The furnace's warranty is active until January 1, 2027, and its filter is due July 1, 2026.",
        rounds: 2,
      },
    }
    for (const [id, outcome] of Object.entries(ideal)) {
      const c = MODEL_TEST_CASES.find((x) => x.id === id)
      expect(c).toBeDefined()
      expect(c!.check(outcome)).toMatchObject({ pass: true })
    }
  })
})
