// Wire types for OpenAI-compatible Chat Completions, plus the events /api/chat
// streams to the browser. Type-only — safe to import from client components.

export type ToolCall = { id: string; name: string; arguments: string }

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant"
      content: string | null
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[]
    }
  | { role: "tool"; tool_call_id: string; content: string }

export type OpenAiTool = {
  type: "function"
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type ChatRequest = { messages: ChatMessage[]; tools?: OpenAiTool[]; toolChoice?: "auto" | "none" }

export type ChatResult = { content: string; toolCalls: ToolCall[] }

/** One streamed completion. `onText` receives content deltas as they arrive. */
export type ChatFn = (req: ChatRequest, onText: (text: string) => void, signal: AbortSignal) => Promise<ChatResult>

/** What the browser keeps and sends: text only, never tool calls or results. */
export type HistoryMessage = { role: "user" | "assistant"; content: string }

export type AgentEvent =
  | { type: "status"; tool: string; label: string; round: number }
  | { type: "reset" }
  | { type: "delta"; text: string }
  | { type: "done"; rounds: number; model: string }
  | { type: "error"; message: string }
