"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth-guard"
import { encrypt } from "@/lib/secret-box"
import { originChanged } from "@/lib/llm/settings-schema"
import { createPaperlessClient, normalizeBaseUrl, PaperlessError } from "@/lib/paperless/client"
import { loadPaperlessConfig, PAPERLESS_SETTINGS_ID } from "@/lib/paperless/config"
import { isPaperlessCheckRunning, runPaperlessCheck } from "@/lib/paperless/sync-server"

const inputSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().max(500),
  /** A new token. Empty or missing keeps the stored one. */
  apiToken: z.string().max(500).optional(),
  clearToken: z.boolean().optional(),
  access: z.enum(["EVERYONE", "ADMIN"]),
  schedule: z.enum(["OFF", "DAILY", "WEEKLY"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekday: z.number().int().min(0).max(6),
})

export type PaperlessSettingsInput = z.input<typeof inputSchema>

type Result = { ok: true } | { error: string }

function tryNormalize(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  try {
    return { ok: true, url: normalizeBaseUrl(raw) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid Paperless URL" }
  }
}

export async function savePaperlessSettings(input: PaperlessSettingsInput): Promise<Result> {
  await requireAdmin()
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input." }
  const data = parsed.data

  const saved = await prisma.paperlessSettings.findUnique({
    where: { id: PAPERLESS_SETTINGS_ID },
    select: { baseUrl: true, apiTokenEnc: true },
  })

  const raw = data.baseUrl.trim()
  let baseUrl: string | null = null
  if (raw) {
    const n = tryNormalize(raw)
    if (n.ok) baseUrl = n.url
    else if (data.enabled) return { error: n.error }
  }
  if (data.enabled && !baseUrl) return { error: "Enter the Paperless URL first." }

  // A stored token never follows the settings to a different server.
  // Disabling with a blank or invalid URL leaves the saved URL (and so its token) alone.
  const keepUrl = !data.enabled && baseUrl === null
  const serverChanged = !keepUrl && originChanged(saved?.baseUrl ?? null, baseUrl)
  const apiTokenEnc: string | null | undefined = data.clearToken
    ? null
    : data.apiToken
      ? encrypt(data.apiToken)
      : serverChanged
        ? null
        : undefined // undefined = keep the stored token

  const willHaveToken = apiTokenEnc === undefined ? Boolean(saved?.apiTokenEnc) : apiTokenEnc !== null
  if (data.enabled && !willHaveToken) return { error: "Enter an access token first." }

  const fields = {
    enabled: data.enabled,
    access: data.access,
    schedule: data.schedule,
    time: data.time,
    weekday: data.weekday,
  }
  await prisma.paperlessSettings.upsert({
    where: { id: PAPERLESS_SETTINGS_ID },
    create: { id: PAPERLESS_SETTINGS_ID, ...fields, baseUrl, apiTokenEnc: apiTokenEnc ?? null },
    update: { ...fields, ...(keepUrl ? {} : { baseUrl }), ...(apiTokenEnc === undefined ? {} : { apiTokenEnc }) },
  })

  revalidatePath("/settings")
  revalidatePath("/", "layout")
  return { ok: true }
}

const testSchema = z.object({
  baseUrl: z.string().max(500),
  apiToken: z.string().max(500).optional(),
  clearToken: z.boolean().optional(),
})

/** Tries what is on screen, falling back to what is saved. Never echoes the token. */
export async function testPaperlessConnection(
  input: z.input<typeof testSchema>,
): Promise<{ ok: true; version: string } | { error: string }> {
  await requireAdmin()
  const parsed = testSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input." }
  const data = parsed.data

  const saved = await loadPaperlessConfig()
  const raw = data.baseUrl.trim() || saved.baseUrl || ""
  if (!raw) return { error: "Enter the Paperless URL first." }
  const n = tryNormalize(raw)
  if (!n.ok) return { error: n.error }
  // The saved token is only sent to the server it was saved for.
  const savedToken = originChanged(saved.baseUrl, n.url) ? null : saved.token
  const token = data.clearToken ? null : data.apiToken || savedToken
  if (!token) return { error: "Enter an access token first." }

  try {
    const { version } = await createPaperlessClient({ baseUrl: n.url, token }).status()
    return { ok: true, version }
  } catch (e) {
    if (e instanceof PaperlessError) return { error: e.message }
    return { error: "Connection test failed." }
  }
}

/** "Check now" in settings. Returns fixed phrases only, never the token. */
export async function runPaperlessCheckNow(): Promise<{ ok: true; summary: string } | { error: string }> {
  await requireAdmin()
  const cfg = await loadPaperlessConfig()
  if (!cfg.enabled || !cfg.baseUrl || !cfg.token) return { error: "Paperless is not enabled." }
  if (isPaperlessCheckRunning()) return { error: "A Paperless check is already running." }

  try {
    await runPaperlessCheck("MANUAL")
  } catch (e) {
    console.error("[paperless] manual check failed:", e instanceof Error ? e.name : "unknown")
    revalidatePath("/settings")
    return { error: "The Paperless check failed." }
  }
  revalidatePath("/settings")
  const after = await loadPaperlessConfig()
  if (after.lastCheckError) return { error: after.lastCheckError }
  return { ok: true, summary: after.lastCheckSummary ?? "" }
}
