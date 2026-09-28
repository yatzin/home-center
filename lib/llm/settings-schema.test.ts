import { describe, expect, it } from "vitest"
import { isLlmReady, LLM_PRESETS, originChanged, parseExtraBody, parseLlmSettings, type LlmSettingsInput } from "./settings-schema"

const base: LlmSettingsInput = {
  enabled: true,
  baseUrl: "https://api.openai.com/v1/",
  model: "gpt-4o-mini",
  temperature: "",
  maxTokens: "",
  systemPrompt: "",
}

describe("parseLlmSettings", () => {
  it("normalises a complete config", () => {
    const r = parseLlmSettings({ ...base, temperature: "0.2", maxTokens: "1500", systemPrompt: " Be brief. " })
    expect(r).toEqual({
      ok: true,
      value: {
        enabled: true,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        temperature: 0.2,
        maxTokens: 1500,
        systemPrompt: "Be brief.",
        timeoutSeconds: null,
        maxToolRounds: null,
        extraBody: null,
      },
    })
  })

  it("stores blanks as null", () => {
    const r = parseLlmSettings({ ...base, enabled: false, baseUrl: "", model: "" })
    expect(r).toEqual({
      ok: true,
      value: {
        enabled: false, baseUrl: null, model: null, temperature: null, maxTokens: null, systemPrompt: null,
        timeoutSeconds: null, maxToolRounds: null, extraBody: null,
      },
    })
  })

  it("rejects non-http URLs", () => {
    expect(parseLlmSettings({ ...base, baseUrl: "ftp://x" })).toEqual({ ok: false, error: "Base URL must be an http(s) URL." })
    expect(parseLlmSettings({ ...base, baseUrl: "not a url" })).toEqual({ ok: false, error: "Base URL must be an http(s) URL." })
  })

  it("rejects out-of-range numbers", () => {
    expect(parseLlmSettings({ ...base, temperature: "3" })).toMatchObject({ ok: false, error: "Temperature must be between 0 and 2." })
    expect(parseLlmSettings({ ...base, maxTokens: "0" })).toMatchObject({ ok: false, error: "Max tokens must be a whole number from 1 to 32000." })
    expect(parseLlmSettings({ ...base, maxTokens: "1.5" })).toMatchObject({ ok: false })
  })

  it("requires URL and model to enable, unless told otherwise", () => {
    expect(parseLlmSettings({ ...base, model: "" })).toEqual({
      ok: false,
      error: "Base URL and model are required to turn the assistant on.",
    })
    expect(parseLlmSettings({ ...base, model: "" }, { requireComplete: false }).ok).toBe(true)
  })
})

describe("isLlmReady", () => {
  const ready = { enabled: true, baseUrl: "http://x/v1", model: "m", keyUnreadable: false }
  it("needs enabled, URL, model and a readable key", () => {
    expect(isLlmReady(ready)).toBe(true)
    expect(isLlmReady({ ...ready, enabled: false })).toBe(false)
    expect(isLlmReady({ ...ready, baseUrl: null })).toBe(false)
    expect(isLlmReady({ ...ready, model: null })).toBe(false)
    expect(isLlmReady({ ...ready, keyUnreadable: true })).toBe(false)
  })
})

describe("LLM_PRESETS", () => {
  it("has http(s) base URLs without trailing slashes", () => {
    for (const p of LLM_PRESETS) expect(p.baseUrl).toMatch(/^https?:\/\/.+[^/]$/)
  })
})

describe("originChanged", () => {
  it("is true only when both URLs are set and their origins differ", () => {
    expect(originChanged("https://api.openai.com/v1", "https://api.openai.com/v2")).toBe(false)
    expect(originChanged("https://api.openai.com/v1", "https://openrouter.ai/api/v1")).toBe(true)
    expect(originChanged("http://localhost:11434/v1", "http://localhost:1234/v1")).toBe(true)
    expect(originChanged(null, "https://openrouter.ai/api/v1")).toBe(false)
    expect(originChanged("https://api.openai.com/v1", null)).toBe(false)
  })
})

describe("time limit and extra request JSON", () => {
  it("accepts a time limit in range", () => {
    expect(parseLlmSettings({ ...base, timeoutSeconds: "300" })).toMatchObject({ ok: true, value: { timeoutSeconds: 300 } })
    expect(parseLlmSettings({ ...base, maxToolRounds: "10" })).toMatchObject({ ok: true, value: { maxToolRounds: 10 } })
    expect(parseLlmSettings({ ...base, maxToolRounds: "2" })).toEqual({ ok: false, error: "Lookup rounds must be a whole number from 3 to 12." })
    expect(parseLlmSettings({ ...base, maxToolRounds: "6.5" })).toMatchObject({ ok: false })
    expect(parseLlmSettings({ ...base, timeoutSeconds: "10" })).toEqual({
      ok: false,
      error: "Time limit must be a whole number of seconds from 30 to 900.",
    })
  })

  it("normalises a JSON object and rejects anything else", () => {
    const r = parseLlmSettings({ ...base, extraBody: ' { "chat_template_kwargs": { "enable_thinking": true } } ' })
    expect(r).toMatchObject({ ok: true, value: { extraBody: '{"chat_template_kwargs":{"enable_thinking":true}}' } })
    expect(parseLlmSettings({ ...base, extraBody: "{nope" })).toEqual({ ok: false, error: "Extra request JSON must be a JSON object." })
    expect(parseLlmSettings({ ...base, extraBody: "[1]" })).toEqual({ ok: false, error: "Extra request JSON must be a JSON object." })
  })

  it("refuses fields the assistant sets itself", () => {
    expect(parseLlmSettings({ ...base, extraBody: '{"model":"x","stream":false}' })).toEqual({
      ok: false,
      error: "Extra request JSON can't set model, stream — the assistant sets those.",
    })
  })

  it("parseExtraBody reads stored JSON safely", () => {
    expect(parseExtraBody('{"a":1}')).toEqual({ a: 1 })
    expect(parseExtraBody(null)).toBeNull()
    expect(parseExtraBody("garbage")).toBeNull()
  })
})
