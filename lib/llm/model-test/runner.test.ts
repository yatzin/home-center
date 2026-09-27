import { describe, expect, it } from "vitest"
import { z } from "zod/v4"
import { defineTool } from "../tools/registry"
import type { ChatFn, ChatRequest, ChatResult } from "../types"
import { answerIncludes, calledTool } from "./checks"
import { runCase, runSuite } from "./runner"
import type { ModelTestCase, ModelTestEvent } from "./types"

// Stand-ins for the real registry: only name/description/schema matter here.
const search = defineTool({
  name: "search",
  description: "Name search.",
  schema: z.object({ query: z.string() }),
  label: () => "",
  run: async () => {
    throw new Error("the real tool must never run in a model test")
  },
})
const tools = [search]

function scripted(responses: ChatResult[]) {
  const requests: ChatRequest[] = []
  const chat: ChatFn = async (req, onText) => {
    requests.push(structuredClone(req))
    const r = responses.shift()
    if (!r) throw new Error("unexpected call")
    if (r.content) onText(r.content)
    return r
  }
  return { chat, requests }
}

const deps = (chat: ChatFn) => ({ chat, tools, systemPrompt: "SYS", signal: new AbortController().signal })

describe("runCase", () => {
  it("tool-choice: one call, records the tool and parsed arguments", async () => {
    const { chat, requests } = scripted([{ content: "", toolCalls: [{ id: "a", name: "search", arguments: '{"query":"truck"}' }] }])
    const c: ModelTestCase = { id: "t", stage: "tool-choice", category: "x", title: "x", question: "Where's the truck?", check: calledTool("search") }
    const o = await runCase(c, deps(chat))
    expect(o.toolCalls).toEqual([{ name: "search", args: { query: "truck" } }])
    expect(requests[0].toolChoice).toBe("auto")
    expect(requests[0].messages).toEqual([{ role: "system", content: "SYS" }, { role: "user", content: "Where's the truck?" }])
    expect(requests[0].tools?.[0].function.name).toBe("search")
  })

  it("answer: hands the model the given results and asks for no more lookups", async () => {
    const { chat, requests } = scripted([{ content: "It's the Work Truck.", toolCalls: [] }])
    const c: ModelTestCase = {
      id: "a", stage: "answer", category: "x", title: "x", question: "Which truck?",
      given: [{ name: "search", args: { query: "truck" }, result: { rows: [{ name: "Work Truck" }] } }],
      check: answerIncludes(["Work Truck"]),
    }
    const o = await runCase(c, deps(chat))
    expect(o.answer).toBe("It's the Work Truck.")
    expect(requests[0].toolChoice).toBe("none")
    expect(requests[0].messages.slice(-2)).toEqual([
      { role: "assistant", content: null, tool_calls: [{ id: "call_0", type: "function", function: { name: "search", arguments: '{"query":"truck"}' } }] },
      { role: "tool", tool_call_id: "call_0", content: '{"rows":[{"name":"Work Truck"}]}' },
    ])
  })

  it("end-to-end: fake tools serve fixtures and the real loop runs", async () => {
    const { chat, requests } = scripted([
      { content: "", toolCalls: [{ id: "a", name: "search", arguments: '{"query":"truck"}' }] },
      { content: "Found the Work Truck.", toolCalls: [] },
    ])
    const c: ModelTestCase = {
      id: "e", stage: "end-to-end", category: "x", title: "x", question: "Find the truck",
      fixtures: { search: (args) => ({ rows: [{ name: `Work ${String(args.query) === "truck" ? "Truck" : "?"}` }] }) },
      check: answerIncludes(["Work Truck"]),
    }
    const o = await runCase(c, deps(chat))
    expect(o).toEqual({ toolCalls: [{ name: "search", args: { query: "truck" } }], answer: "Found the Work Truck.", rounds: 2 })
    expect(requests[1].messages.at(-1)).toEqual({ role: "tool", tool_call_id: "a", content: '{"rows":[{"name":"Work Truck"}]}' })
  })

  it("end-to-end: a tool with no fixture returns an error, not real data", async () => {
    const { chat, requests } = scripted([
      { content: "", toolCalls: [{ id: "a", name: "search", arguments: '{"query":"x"}' }] },
      { content: "Nothing found.", toolCalls: [] },
    ])
    const c: ModelTestCase = { id: "e2", stage: "end-to-end", category: "x", title: "x", question: "?", fixtures: {}, check: answerIncludes([]) }
    await runCase(c, deps(chat))
    expect(requests[1].messages.at(-1)).toMatchObject({ content: '{"error":"No data for this lookup in the test."}' })
  })
})

describe("runSuite", () => {
  it("streams running + result per case and repetition, and survives a failing call", async () => {
    let n = 0
    const chat: ChatFn = async () => {
      if (n++ === 0) throw new Error("boom")
      return { content: "", toolCalls: [{ id: "a", name: "search", arguments: "{}" }] }
    }
    const c: ModelTestCase = { id: "t", stage: "tool-choice", category: "x", title: "x", question: "q", check: calledTool("search") }
    const events: ModelTestEvent[] = []
    const summary = await runSuite({ ...deps(chat), cases: [c], reps: 2, caseTimeoutMs: 5000, emit: (e) => events.push(e) })
    expect(summary).toEqual({ passed: 1, failed: 1 })
    expect(events.map((e) => e.type)).toEqual(["running", "result", "running", "result"])
    expect(events[1]).toMatchObject({ key: "t#0", pass: false, reason: "The model call failed." })
    expect(events[3]).toMatchObject({ key: "t#1", pass: true })
  })

  it("stops when aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const c: ModelTestCase = { id: "t", stage: "tool-choice", category: "x", title: "x", question: "q", check: calledTool("search") }
    const events: ModelTestEvent[] = []
    await runSuite({ ...deps(scripted([]).chat), signal: controller.signal, cases: [c], reps: 1, caseTimeoutMs: 5000, emit: (e) => events.push(e) })
    expect(events).toEqual([])
  })
})
