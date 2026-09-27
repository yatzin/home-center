import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/secret-box"
import { isLlmReady, type ParsedLlmSettings } from "@/lib/llm/settings-schema"

export const LLM_SETTINGS_ID = "singleton"

export type LlmConfig = ParsedLlmSettings & {
  apiKey: string | null
  hasStoredKey: boolean
  /** A key is stored but AUTH_SECRET can no longer decrypt it. */
  keyUnreadable: boolean
}

export async function loadLlmConfig(): Promise<LlmConfig> {
  const row = await prisma.llmSettings.findUnique({ where: { id: LLM_SETTINGS_ID } })
  const apiKey = row?.apiKeyEnc ? decrypt(row.apiKeyEnc) : null
  return {
    enabled: row?.enabled ?? false,
    baseUrl: row?.baseUrl ?? null,
    model: row?.model ?? null,
    temperature: row?.temperature ?? null,
    maxTokens: row?.maxTokens ?? null,
    systemPrompt: row?.systemPrompt ?? null,
    timeoutSeconds: row?.timeoutSeconds ?? null,
    extraBody: row?.extraBody ?? null,
    apiKey,
    hasStoredKey: Boolean(row?.apiKeyEnc),
    keyUnreadable: Boolean(row?.apiKeyEnc) && apiKey === null,
  }
}

/**
 * What the layout needs on every page. Skips decryption (scrypt is not free);
 * an unreadable key surfaces as an error from /api/chat instead.
 */
export async function loadLlmStatus(): Promise<{ available: boolean; model: string | null }> {
  const row = await prisma.llmSettings.findUnique({
    where: { id: LLM_SETTINGS_ID },
    select: { enabled: true, baseUrl: true, model: true },
  })
  const available = isLlmReady({
    enabled: row?.enabled ?? false,
    baseUrl: row?.baseUrl ?? null,
    model: row?.model ?? null,
    keyUnreadable: false,
  })
  return { available, model: available ? (row?.model ?? null) : null }
}
