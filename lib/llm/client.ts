import { createDeltaAccumulator, createSseParser } from "./sse"
import { explainHttpError, explainNetworkError, LlmError } from "./errors"
import type { ChatFn, ChatResult } from "./types"

// A thin OpenAI-compatible Chat Completions client. Plain fetch rather than an
// SDK: the surface used is one endpoint, and it has to work against OpenAI,
// Ollama, LM Studio, OpenRouter and vLLM alike.

export type ClientConfig = {
  baseUrl: string
  apiKey: string | null
  model: string
  temperature: number | null
  maxTokens: number | null
}

export const REQUEST_TIMEOUT_MS = 60_000

function hostOf(baseUrl: string) {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}

type JsonCompletion = {
  choices?: {
    message?: {
      content?: string | null
      tool_calls?: { id?: string; function: { name: string; arguments?: string } }[]
    }
  }[]
}

export function createChatClient(config: ClientConfig, fetchImpl: typeof fetch = fetch): ChatFn {
  const host = hostOf(config.baseUrl)

  return async (req, onText, signal) => {
    const body = {
      model: config.model,
      messages: req.messages,
      stream: true,
      ...(req.tools?.length ? { tools: req.tools, tool_choice: req.toolChoice ?? "auto" } : {}),
      ...(config.temperature != null ? { temperature: config.temperature } : {}),
      ...(config.maxTokens != null ? { max_tokens: config.maxTokens } : {}),
    }

    let res: Response
    try {
      res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      })
    } catch (error) {
      if (signal.aborted) throw error
      throw new LlmError(explainNetworkError(error, host))
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new LlmError(explainHttpError(res.status, text), res.status)
    }

    // Some servers ignore stream:true and answer with one JSON body.
    if ((res.headers.get("content-type") ?? "").includes("application/json")) {
      const data = (await res.json()) as JsonCompletion
      const message = data.choices?.[0]?.message
      const content = message?.content ?? ""
      if (content) onText(content)
      const result: ChatResult = {
        content,
        toolCalls: (message?.tool_calls ?? []).map((c, i) => ({
          id: c.id || `call_${i}`,
          name: c.function.name,
          arguments: c.function.arguments ?? "",
        })),
      }
      return result
    }

    if (!res.body) throw new LlmError("The LLM server sent an empty response.")

    const acc = createDeltaAccumulator(onText)
    const parser = createSseParser((data) => {
      acc.push(data)
    })
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        parser.feed(value)
      }
      parser.flush()
    } catch (error) {
      if (signal.aborted || error instanceof LlmError) throw error
      throw new LlmError(explainNetworkError(error, host))
    }
    return acc.result()
  }
}
