import { describe, expect, it, vi } from "vitest"
import { createChatClient, type ClientConfig } from "./client"
import { LlmError } from "./errors"

const config: ClientConfig = { baseUrl: "http://llm/v1", apiKey: "sk-test", model: "m", temperature: 0.1, maxTokens: null }

function sseResponse(payloads: string[]) {
  const body = payloads.map((p) => `data: ${p}\n\n`).join("")
  const enc = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(c) {
        // Odd-sized chunks so lines and JSON split mid-way.
        for (let i = 0; i < body.length; i += 7) c.enqueue(enc.encode(body.slice(i, i + 7)))
        c.close()
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } }
  )
}

const delta = (d: object) => JSON.stringify({ choices: [{ delta: d }] })
const signal = () => new AbortController().signal

describe("createChatClient", () => {
  it("posts an OpenAI-shaped streaming request", async () => {
    const fetchImpl = vi.fn(async () => sseResponse([delta({ content: "hi" }), "[DONE]"]))
    const chat = createChatClient(config, fetchImpl as unknown as typeof fetch)
    const tools = [{ type: "function" as const, function: { name: "t", description: "d", parameters: {} } }]
    await chat({ messages: [{ role: "user", content: "q" }], tools, toolChoice: "none" }, () => {}, signal())

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://llm/v1/chat/completions")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test")
    expect(JSON.parse(init.body as string)).toEqual({
      model: "m",
      messages: [{ role: "user", content: "q" }],
      stream: true,
      tools,
      tool_choice: "none",
      temperature: 0.1,
    })
  })

  it("omits Authorization and tools when not needed", async () => {
    const fetchImpl = vi.fn(async () => sseResponse(["[DONE]"]))
    const chat = createChatClient({ ...config, apiKey: null }, fetchImpl as unknown as typeof fetch)
    await chat({ messages: [] }, () => {}, signal())
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(JSON.parse(init.body as string).tools).toBeUndefined()
  })

  it("streams text and assembles tool calls", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        delta({ content: "Let me " }),
        delta({ content: "check." }),
        delta({ tool_calls: [{ index: 0, id: "c1", function: { name: "search", arguments: '{"query":' } }] }),
        delta({ tool_calls: [{ index: 0, function: { arguments: '"civic"}' } }] }),
        "[DONE]",
      ])
    )
    const live: string[] = []
    const chat = createChatClient(config, fetchImpl as unknown as typeof fetch)
    const result = await chat({ messages: [] }, (t) => live.push(t), signal())
    expect(live.join("")).toBe("Let me check.")
    expect(result).toEqual({
      content: "Let me check.",
      toolCalls: [{ id: "c1", name: "search", arguments: '{"query":"civic"}' }],
    })
  })

  it("accepts a non-streaming JSON reply", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: null, tool_calls: [{ id: "x", function: { name: "search", arguments: "{}" } }] } }],
      })
    )
    const chat = createChatClient(config, fetchImpl as unknown as typeof fetch)
    expect(await chat({ messages: [] }, () => {}, signal())).toEqual({
      content: "",
      toolCalls: [{ id: "x", name: "search", arguments: "{}" }],
    })
  })

  it("translates HTTP errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }))
    const chat = createChatClient(config, fetchImpl as unknown as typeof fetch)
    await expect(chat({ messages: [] }, () => {}, signal())).rejects.toThrow(/API key/)
    await expect(chat({ messages: [] }, () => {}, signal())).rejects.toBeInstanceOf(LlmError)
  })

  it("translates network errors", async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })
    })
    const chat = createChatClient(config, fetchImpl as unknown as typeof fetch)
    await expect(chat({ messages: [] }, () => {}, signal())).rejects.toThrow("Couldn't reach the LLM server at llm.")
  })

  it("rethrows aborts untranslated", async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError")
    })
    const chat = createChatClient(config, fetchImpl as unknown as typeof fetch)
    await expect(chat({ messages: [] }, () => {}, controller.signal)).rejects.not.toBeInstanceOf(LlmError)
  })
})
