import { runAgent } from "../agent"
import { LlmError } from "../errors"
import { toToolContent } from "../serialize"
import { parseToolArgs, toOpenAiTools, type RegisteredTool } from "../tools/registry"
import type { ChatFn, ChatMessage } from "../types"
import { describeTool } from "./checks"
import type { ModelTestCase, ModelTestEvent, Outcome, ToolCallRecord } from "./types"

// Runs model-test cases against a chat function. Tool definitions are the
// app's real ones (same names, descriptions and argument schemas the model sees
// in production), but nothing touches the database: "answer" cases hand the
// model ready-made results and "end-to-end" cases run the real assistant loop
// against fake tools that serve each case's fixtures.

export type RunDeps = {
  chat: ChatFn
  /** The real tool registry — only names, descriptions and schemas are used. */
  tools: RegisteredTool[]
  systemPrompt: string
  signal: AbortSignal
}

const argsOf = (raw: string): Record<string, unknown> => (parseToolArgs(raw) as Record<string, unknown> | undefined) ?? { _unparsed: raw }

export async function runCase(c: ModelTestCase, deps: RunDeps): Promise<Outcome> {
  const system: ChatMessage = { role: "system", content: deps.systemPrompt }
  const history = c.history ?? []
  const user: ChatMessage = { role: "user", content: c.question }
  const openAiTools = toOpenAiTools(deps.tools)

  if (c.stage === "tool-choice") {
    const r = await deps.chat({ messages: [system, ...history, user], tools: openAiTools, toolChoice: "auto" }, () => {}, deps.signal)
    return { toolCalls: r.toolCalls.map((t) => ({ name: t.name, args: argsOf(t.arguments) })), answer: r.content, rounds: 1 }
  }

  if (c.stage === "answer") {
    const given = c.given ?? []
    const ids = given.map((_, i) => `call_${i}`)
    const messages: ChatMessage[] = [
      system,
      ...history,
      user,
      {
        role: "assistant",
        content: null,
        tool_calls: given.map((g, i) => ({ id: ids[i], type: "function", function: { name: g.name, arguments: JSON.stringify(g.args) } })),
      },
      ...given.map((g, i): ChatMessage => ({ role: "tool", tool_call_id: ids[i], content: toToolContent(g.result) })),
    ]
    const r = await deps.chat({ messages, tools: openAiTools, toolChoice: "none" }, () => {}, deps.signal)
    return { toolCalls: r.toolCalls.map((t) => ({ name: t.name, args: argsOf(t.arguments) })), answer: r.content, rounds: 1 }
  }

  // end-to-end
  const calls: ToolCallRecord[] = []
  const fakeTools: RegisteredTool[] = deps.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    label: () => `Test data: ${describeTool(t.name)}`,
    async execute(raw) {
      const args = (raw ?? {}) as Record<string, unknown>
      calls.push({ name: t.name, args })
      const fixture = c.fixtures?.[t.name]
      if (fixture === undefined) return JSON.stringify({ error: "No data for this lookup in the test." })
      return toToolContent(typeof fixture === "function" ? (fixture as (a: Record<string, unknown>) => unknown)(args) : fixture)
    },
  }))
  let answer = ""
  let rounds = 0
  await runAgent({
    history: [...history, { role: "user", content: c.question }],
    systemPrompt: deps.systemPrompt,
    chat: deps.chat,
    tools: fakeTools,
    ctx: { userId: "model-test", now: new Date() },
    signal: deps.signal,
    model: "model-test",
    emit: (e) => {
      if (e.type === "delta") answer += e.text
      if (e.type === "reset") answer = ""
      if (e.type === "done") rounds = e.rounds
    },
  })
  return { toolCalls: calls, answer, rounds }
}

export type SuiteOptions = RunDeps & {
  cases: ModelTestCase[]
  reps: number
  caseTimeoutMs: number
  emit: (e: ModelTestEvent) => void
}

/** Runs every case (reps times), one at a time, streaming progress. Never throws for a single failed case. */
export async function runSuite(o: SuiteOptions): Promise<{ passed: number; failed: number }> {
  let passed = 0
  let failed = 0
  for (const c of o.cases) {
    for (let rep = 0; rep < o.reps; rep++) {
      if (o.signal.aborted) return { passed, failed }
      const key = `${c.id}#${rep}`
      o.emit({ type: "running", key, id: c.id, rep })
      const started = Date.now()
      const caseTimeout = AbortSignal.timeout(o.caseTimeoutMs)
      try {
        const outcome = await runCase(c, { ...o, signal: AbortSignal.any([o.signal, caseTimeout]) })
        const check = c.check(outcome)
        if (check.pass) passed++
        else failed++
        o.emit({ type: "result", key, id: c.id, rep, ...check, ms: Date.now() - started, ...outcome })
      } catch (error) {
        if (o.signal.aborted) return { passed, failed }
        failed++
        const message = caseTimeout.aborted
          ? `It didn't finish within ${Math.round(o.caseTimeoutMs / 1000)} seconds.`
          : error instanceof LlmError
            ? error.message
            : "The model call failed."
        o.emit({
          type: "result", key, id: c.id, rep, pass: false, reason: message, ms: Date.now() - started,
          answer: "", toolCalls: [], rounds: 0, error: message,
        })
      }
    }
  }
  return { passed, failed }
}
