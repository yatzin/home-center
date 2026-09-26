import { z } from "zod"

// Pure validation for the Settings → Assistant form. Shared by the server
// actions and the layout's availability check; no database access here.

export const LLM_PRESETS = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "ollama", label: "Ollama", baseUrl: "http://localhost:11434/v1" },
  { id: "lmstudio", label: "LM Studio", baseUrl: "http://localhost:1234/v1" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
] as const

const schema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().trim(),
  // Empty means "leave the stored key alone" — the browser never sees it.
  apiKey: z.string().optional(),
  clearApiKey: z.boolean().optional(),
  model: z.string().trim(),
  temperature: z.string().trim().optional(),
  maxTokens: z.string().trim().optional(),
  systemPrompt: z.string().trim().max(4000).optional(),
})

export type LlmSettingsInput = z.infer<typeof schema>

export type ParsedLlmSettings = {
  enabled: boolean
  baseUrl: string | null
  model: string | null
  temperature: number | null
  maxTokens: number | null
  systemPrompt: string | null
}

type Result = { ok: true; value: ParsedLlmSettings } | { ok: false; error: string }

export function parseLlmSettings(input: LlmSettingsInput, opts: { requireComplete?: boolean } = {}): Result {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid input." }
  const v = parsed.data

  let baseUrl: string | null = null
  if (v.baseUrl) {
    let url: URL
    try {
      url = new URL(v.baseUrl)
    } catch {
      return { ok: false, error: "Base URL must be an http(s) URL." }
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "Base URL must be an http(s) URL." }
    baseUrl = v.baseUrl.replace(/\/+$/, "")
  }

  let temperature: number | null = null
  if (v.temperature) {
    const n = Number(v.temperature)
    if (!Number.isFinite(n) || n < 0 || n > 2) return { ok: false, error: "Temperature must be between 0 and 2." }
    temperature = n
  }

  let maxTokens: number | null = null
  if (v.maxTokens) {
    const n = Number(v.maxTokens)
    if (!Number.isInteger(n) || n < 1 || n > 32000) return { ok: false, error: "Max tokens must be a whole number from 1 to 32000." }
    maxTokens = n
  }

  const model = v.model || null
  if ((opts.requireComplete ?? true) && v.enabled && (!baseUrl || !model)) {
    return { ok: false, error: "Base URL and model are required to turn the assistant on." }
  }

  return {
    ok: true,
    value: { enabled: v.enabled, baseUrl, model, temperature, maxTokens, systemPrompt: v.systemPrompt || null },
  }
}

export function isLlmReady(c: { enabled: boolean; baseUrl: string | null; model: string | null; keyUnreadable: boolean }): boolean {
  return c.enabled && !!c.baseUrl && !!c.model && !c.keyUnreadable
}
