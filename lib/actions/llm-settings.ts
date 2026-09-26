"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { encrypt } from "@/lib/secret-box"
import { loadLlmConfig, LLM_SETTINGS_ID } from "@/lib/llm/config"
import { originChanged, parseLlmSettings, type LlmSettingsInput } from "@/lib/llm/settings-schema"
import { createChatClient } from "@/lib/llm/client"
import { LlmError } from "@/lib/llm/errors"
import type { OpenAiTool } from "@/lib/llm/types"

async function requireAdmin() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/")
  return session
}

export async function updateLlmSettings(data: LlmSettingsInput): Promise<{ error: string } | { success: true }> {
  await requireAdmin()
  const result = parseLlmSettings(data)
  if (!result.ok) return { error: result.error }

  const saved = await prisma.llmSettings.findUnique({ where: { id: LLM_SETTINGS_ID }, select: { baseUrl: true } })
  // A stored key never follows the settings to a different server.
  const serverChanged = originChanged(saved?.baseUrl ?? null, result.value.baseUrl)
  const apiKeyEnc = data.clearApiKey
    ? null
    : data.apiKey
      ? encrypt(data.apiKey)
      : serverChanged
        ? null
        : undefined // undefined = keep the stored key

  await prisma.llmSettings.upsert({
    where: { id: LLM_SETTINGS_ID },
    create: { id: LLM_SETTINGS_ID, ...result.value, apiKeyEnc: apiKeyEnc ?? null },
    update: { ...result.value, ...(apiKeyEnc === undefined ? {} : { apiKeyEnc }) },
  })

  // The header button and sidebar item depend on this, on every page.
  revalidatePath("/", "layout")
  return { success: true }
}

const PING_TOOL: OpenAiTool = {
  type: "function",
  function: {
    name: "ping",
    description: "Connection test. Call it with ok set to true.",
    parameters: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
  },
}

/**
 * Tries what's on screen, falling back to what's saved, and checks the one
 * capability the assistant can't work without: tool calling.
 */
export async function testLlmConnection(
  data: LlmSettingsInput
): Promise<{ error: string } | { success: true; model: string; toolCalling: boolean }> {
  await requireAdmin()
  const parsed = parseLlmSettings(data, { requireComplete: false })
  if (!parsed.ok) return { error: parsed.error }

  const saved = await loadLlmConfig()
  const baseUrl = parsed.value.baseUrl ?? saved.baseUrl
  const model = parsed.value.model ?? saved.model
  if (!baseUrl || !model) return { error: "Enter a base URL and model first." }
  // The saved key is only sent to the server it was saved for.
  const savedKey = originChanged(saved.baseUrl, baseUrl) ? null : saved.apiKey
  const apiKey = data.clearApiKey ? null : data.apiKey || savedKey

  const chat = createChatClient({ baseUrl, apiKey, model, temperature: null, maxTokens: null })
  try {
    const result = await chat(
      {
        messages: [
          { role: "system", content: "You are a connection test." },
          { role: "user", content: "Call the ping tool with ok set to true." },
        ],
        tools: [PING_TOOL],
        toolChoice: "auto",
      },
      () => {},
      AbortSignal.timeout(30_000)
    )
    return { success: true, model, toolCalling: result.toolCalls.some((c) => c.name === "ping") }
  } catch (error) {
    if (error instanceof LlmError) return { error: error.message }
    return { error: `Test failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}
