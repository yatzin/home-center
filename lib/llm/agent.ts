import type { ToolContext } from "./query"
import { EMPTY_ANSWER, FINAL_NUDGE } from "./prompt"
import { runToolCall, toOpenAiTools, toolLabel, type RegisteredTool } from "./tools/registry"
import type { AgentEvent, ChatFn, ChatMessage, HistoryMessage } from "./types"

export const MAX_TOOL_ROUNDS = 5
export const HISTORY_LIMIT = 20

export type AgentOptions = {
  history: HistoryMessage[]
  systemPrompt: string
  chat: ChatFn
  tools: RegisteredTool[]
  ctx: ToolContext
  emit: (event: AgentEvent) => void
  signal: AbortSignal
  model: string
  maxRounds?: number
}

/**
 * Up to maxRounds of "model picks tools → we run them", stopping early as soon
 * as a round comes back with text only. If the model still wants tools after
 * the last round, one more call with tool_choice "none" forces an answer from
 * what was gathered. Provider errors throw; the route turns them into an event.
 */
export async function runAgent(o: AgentOptions): Promise<void> {
  const maxRounds = o.maxRounds ?? MAX_TOOL_ROUNDS
  const tools = toOpenAiTools(o.tools)
  const messages: ChatMessage[] = [{ role: "system", content: o.systemPrompt }, ...o.history.slice(-HISTORY_LIMIT)]

  for (let round = 1; round <= maxRounds; round++) {
    let streamed = false
    const result = await o.chat(
      { messages, tools, toolChoice: "auto" },
      (text) => {
        streamed = true
        o.emit({ type: "delta", text })
      },
      o.signal
    )

    if (result.toolCalls.length === 0) {
      if (!result.content.trim()) {
        if (streamed) o.emit({ type: "reset" })
        o.emit({ type: "delta", text: EMPTY_ANSWER })
      }
      o.emit({ type: "done", rounds: round, model: o.model })
      return
    }

    // A "let me check" preface was streamed before the model decided to call tools.
    if (streamed) o.emit({ type: "reset" })

    messages.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })),
    })
    const outputs = await Promise.all(
      result.toolCalls.map((call) => {
        o.emit({ type: "status", tool: call.name, label: toolLabel(o.tools, call), round })
        return runToolCall(o.tools, call, o.ctx)
      })
    )
    if (o.signal.aborted) return
    result.toolCalls.forEach((call, i) => messages.push({ role: "tool", tool_call_id: call.id, content: outputs[i] }))
  }

  messages.push({ role: "system", content: FINAL_NUDGE })
  let streamed = false
  const final = await o.chat(
    { messages, tools, toolChoice: "none" },
    (text) => {
      streamed = true
      o.emit({ type: "delta", text })
    },
    o.signal
  )
  if (!final.content.trim()) {
    if (streamed) o.emit({ type: "reset" })
    o.emit({ type: "delta", text: EMPTY_ANSWER })
  }
  o.emit({ type: "done", rounds: maxRounds + 1, model: o.model })
}
