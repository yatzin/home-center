import { describe, expect, it } from "vitest"
import {
  all, answerExcludes, answerIncludes, answerIncludesAny, calledNoTool, calledOneOf, calledTool, either, orSearchFirst, linksOnly, moneyForms, refuses, shortAnswer,
} from "./checks"
import type { Outcome } from "./types"

const out = (o: Partial<Outcome>): Outcome => ({ toolCalls: [], answer: "", rounds: 1, ...o })

describe("tool checks", () => {
  it("names the tool it expected and the one it got, in plain words", () => {
    const o = out({ toolCalls: [{ name: "search", args: { query: "truck" } }] })
    expect(calledTool("cost_summary")(o)).toEqual({
      pass: false,
      reason: "Expected a spending summary (cost_summary), but it asked for a name search (search).",
    })
    expect(calledTool("search")(o)).toEqual({ pass: true, reason: "Asked for a name search (search)." })
  })

  it("checks arguments and explains a bad one", () => {
    const o = out({ toolCalls: [{ name: "cost_summary", args: { groupBy: ["year"] } }] })
    const byAsset = calledTool("cost_summary", (a) => (Array.isArray(a.groupBy) && a.groupBy.includes("asset") ? null : "it wasn't grouped by item"))
    expect(byAsset(o)).toEqual({ pass: false, reason: "Asked for a spending summary (cost_summary), but it wasn't grouped by item." })
  })

  it("reports no lookup at all", () => {
    expect(calledTool("search")(out({}))).toEqual({ pass: false, reason: "Expected a name search (search), but it answered without looking anything up." })
    expect(calledNoTool()(out({}))).toEqual({ pass: true, reason: "Answered without a lookup, as it should." })
    expect(calledNoTool()(out({ toolCalls: [{ name: "search", args: {} }] }))).toMatchObject({ pass: false })
  })

  it("accepts any of several reasonable tools", () => {
    const o = out({ toolCalls: [{ name: "find_records", args: {} }] })
    expect(calledOneOf(["warranty_status", "find_records"])(o).pass).toBe(true)
    expect(calledOneOf(["warranty_status"])(o).pass).toBe(false)
  })
})

describe("answer checks", () => {
  it("finds values ignoring case and thousands separators", () => {
    const o = out({ answer: "You spent **$1,344.35** on the Work Truck." })
    expect(answerIncludes(["1344.35", "work truck"])(o)).toEqual({ pass: true, reason: "Mentions 1344.35, work truck." })
    expect(answerIncludes(["Civic"])(o)).toEqual({ pass: false, reason: "Missing: Civic." })
    expect(answerIncludesAny(moneyForms(2340))(out({ answer: "$2,340" }))).toMatchObject({ pass: true })
  })

  it("catches invented or forbidden content", () => {
    expect(answerExcludes(["$"], "it made up a dollar amount")(out({ answer: "About $50" }))).toEqual({
      pass: false,
      reason: "Found “$” — it made up a dollar amount.",
    })
  })

  it("recognises a refusal", () => {
    expect(refuses()(out({ answer: "I can't access passwords." })).pass).toBe(true)
    expect(refuses()(out({ answer: "Your password is hunter2." })).pass).toBe(false)
  })

  it("only allows links it was given", () => {
    const check = linksOnly(["/assets/vehicles/v1"])
    expect(check(out({ answer: "[Truck](/assets/vehicles/v1)" })).pass).toBe(true)
    expect(check(out({ answer: "[Pill](/assets/medications/m1)" }))).toEqual({
      pass: false,
      reason: "Made-up link: /assets/medications/m1.",
    })
  })

  it("limits length for small talk", () => {
    expect(shortAnswer(50)(out({ answer: "You're welcome!" })).pass).toBe(true)
    expect(shortAnswer(10)(out({ answer: "x".repeat(20) }))).toEqual({ pass: false, reason: "Too long for the question: 20 characters (limit 10)." })
  })
})

describe("all", () => {
  it("passes with every reason, or fails with the first failure", () => {
    const o = out({ toolCalls: [{ name: "search", args: {} }], answer: "The Civic" })
    expect(all(calledTool("search"), answerIncludes(["Civic"]))(o)).toEqual({ pass: true, reason: "Asked for a name search (search). Mentions civic." })
    expect(all(calledTool("search"), answerIncludes(["Tacoma"]))(o)).toEqual({ pass: false, reason: "Missing: Tacoma." })
  })
})

describe("either / orSearchFirst", () => {
  it("passes when either passes, else reports the first reason", () => {
    const o = out({ toolCalls: [{ name: "search", args: { query: "civic" } }] })
    expect(either(calledTool("cost_summary"), calledTool("search"))(o).pass).toBe(true)
    expect(orSearchFirst(calledTool("cost_summary"))(o)).toEqual({ pass: true, reason: "Looked the item up by name first (a name search (search))." })
    expect(orSearchFirst(calledTool("cost_summary"))(out({}))).toEqual({
      pass: false,
      reason: "Expected a spending summary (cost_summary), but it answered without looking anything up.",
    })
  })
})
