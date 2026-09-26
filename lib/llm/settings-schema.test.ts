import { describe, expect, it } from "vitest"
import { isLlmReady, LLM_PRESETS, parseLlmSettings, type LlmSettingsInput } from "./settings-schema"

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
      },
    })
  })

  it("stores blanks as null", () => {
    const r = parseLlmSettings({ ...base, enabled: false, baseUrl: "", model: "" })
    expect(r).toEqual({
      ok: true,
      value: { enabled: false, baseUrl: null, model: null, temperature: null, maxTokens: null, systemPrompt: null },
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
