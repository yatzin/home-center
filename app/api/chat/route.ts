import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { loadLlmConfig } from "@/lib/llm/config"
import { isLlmReady } from "@/lib/llm/settings-schema"
import { createChatClient } from "@/lib/llm/client"
import { agentErrorMessage } from "@/lib/llm/errors"
import { runAgent } from "@/lib/llm/agent"
import { buildSystemPrompt } from "@/lib/llm/prompt"
import { chatRequestSchema, firstIssue } from "@/lib/llm/request-schema"
import { TOOLS } from "@/lib/llm/tools"
import type { AgentEvent } from "@/lib/llm/types"

export const runtime = "nodejs"

const WALL_CLOCK_MS = 120_000

// Streams one assistant turn as NDJSON. The thread arrives from the browser on
// every request and is never stored. Logs carry tool names and timings only —
// never message content or tool results, which include health records.
export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }
  const parsed = chatRequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })

  const config = await loadLlmConfig()
  if (!isLlmReady(config) || !config.baseUrl || !config.model) {
    const error = config.keyUnreadable
      ? "The saved API key can't be decrypted — an admin needs to re-enter it in Settings."
      : "The assistant isn't configured. An admin can set it up in Settings."
    return NextResponse.json({ error }, { status: 503 })
  }

  const timeout = AbortSignal.timeout(WALL_CLOCK_MS)
  const signal = AbortSignal.any([request.signal, timeout])
  const chat = createChatClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  })
  const model = config.model
  const userId = session.user.id
  const encoder = new TextEncoder()
  const started = Date.now()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // Client went away; the abort signal stops the loop.
        }
      }
      const used: string[] = []
      let rounds = 0
      try {
        const now = new Date()
        await runAgent({
          history: parsed.data.messages,
          systemPrompt: buildSystemPrompt({ now, extra: config.systemPrompt }),
          chat,
          tools: TOOLS,
          ctx: { userId, now },
          signal,
          model,
          emit: (event) => {
            if (event.type === "status") used.push(event.tool)
            if (event.type === "done") rounds = event.rounds
            send(event)
          },
        })
      } catch (error) {
        if (!request.signal.aborted) send({ type: "error", message: agentErrorMessage(error, timeout.aborted) })
        console.error("[llm] chat failed:", error instanceof Error ? `${error.name}: ${error.name === "LlmError" ? error.message : ""}` : typeof error)
      } finally {
        console.info(`[llm] chat user=${userId} rounds=${rounds} tools=${used.join(",") || "-"} ms=${Date.now() - started}`)
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}
