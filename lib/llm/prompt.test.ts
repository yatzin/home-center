import { describe, expect, it } from "vitest"
import { buildSystemPrompt } from "./prompt"

describe("buildSystemPrompt", () => {
  const now = new Date("2026-09-26T18:00:00Z")

  it("carries the date, rules and data model", () => {
    const p = buildSystemPrompt({ now })
    expect(p).toContain("Today is 2026-09-26")
    expect(p).toMatch(/only from data returned by your tools/)
    expect(p).toContain("- serviceRecord:")
    expect(p).toContain("search, cost_summary, asset_history, maintenance_status, warranty_status, health_alerts, observation_log")
    expect(p).not.toMatch(/passwordHash/)
  })

  it("appends admin instructions last", () => {
    const p = buildSystemPrompt({ now, extra: "Answer in Spanish." })
    expect(p.trimEnd().endsWith("Answer in Spanish.")).toBe(true)
    expect(buildSystemPrompt({ now, extra: null })).not.toContain("administrator")
  })

  it("tells the model how many lookup rounds it has", () => {
    expect(buildSystemPrompt({ now })).toContain("at most 8 turns of tool calls")
    expect(buildSystemPrompt({ now, maxRounds: 4 })).toContain("at most 4 turns of tool calls")
  })
})
