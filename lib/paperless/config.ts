import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/secret-box"
import { createPaperlessClient, type PaperlessClient } from "./client"

export const PAPERLESS_SETTINGS_ID = "singleton"

export type PaperlessAccessMode = "EVERYONE" | "ADMIN"
export type PaperlessScheduleMode = "OFF" | "DAILY" | "WEEKLY"

/** Server-only: includes the decrypted token. Never pass this to a client component. */
export type PaperlessConfig = {
  enabled: boolean
  baseUrl: string | null
  token: string | null
  hasStoredToken: boolean
  /** A token is stored but AUTH_SECRET can no longer decrypt it. */
  tokenUnreadable: boolean
  access: PaperlessAccessMode
  schedule: PaperlessScheduleMode
  time: string
  weekday: number
  lastCheckedAt: Date | null
  lastCheckSummary: string | null
  lastCheckError: string | null
}

export async function loadPaperlessConfig(): Promise<PaperlessConfig> {
  const row = await prisma.paperlessSettings.upsert({
    where: { id: PAPERLESS_SETTINGS_ID },
    create: { id: PAPERLESS_SETTINGS_ID },
    update: {},
  })
  const token = row.apiTokenEnc ? decrypt(row.apiTokenEnc) : null
  return {
    enabled: row.enabled,
    baseUrl: row.baseUrl,
    token,
    hasStoredToken: Boolean(row.apiTokenEnc),
    tokenUnreadable: Boolean(row.apiTokenEnc) && token === null,
    access: row.access,
    schedule: row.schedule,
    time: row.time,
    weekday: row.weekday,
    lastCheckedAt: row.lastCheckedAt,
    lastCheckSummary: row.lastCheckSummary,
    lastCheckError: row.lastCheckError,
  }
}

/** What a settings page may show: everything except the token itself. */
export type PaperlessSettingsView = Omit<PaperlessConfig, "token">

export async function loadPaperlessSettingsView(): Promise<PaperlessSettingsView> {
  const cfg = await loadPaperlessConfig()
  return {
    enabled: cfg.enabled,
    baseUrl: cfg.baseUrl,
    hasStoredToken: cfg.hasStoredToken,
    tokenUnreadable: cfg.tokenUnreadable,
    access: cfg.access,
    schedule: cfg.schedule,
    time: cfg.time,
    weekday: cfg.weekday,
    lastCheckedAt: cfg.lastCheckedAt,
    lastCheckSummary: cfg.lastCheckSummary,
    lastCheckError: cfg.lastCheckError,
  }
}

/** Pure: false when disabled or unconfigured; ADMIN access needs an ADMIN role. */
export function paperlessAllowed(
  cfg: { enabled: boolean; baseUrl: string | null; token: string | null; access: PaperlessAccessMode },
  role: "ADMIN" | "USER" | (string & {}) | undefined,
): boolean {
  if (!cfg.enabled || !cfg.baseUrl || !cfg.token) return false
  return paperlessRoleAllowed(cfg.access, role)
}

/** Pure: whether this role passes the access rule alone (no check that the feature is configured). */
export function paperlessRoleAllowed(access: PaperlessAccessMode, role: string | undefined): boolean {
  if (!role) return false
  return access === "EVERYONE" || role === "ADMIN"
}

/** For route handlers: 401 with no session, 404 when the feature is off, unconfigured or not allowed for this role. */
export async function paperlessRoute(): Promise<
  { denied: NextResponse; client: null } | { denied: null; client: PaperlessClient; session: Session }
> {
  const session = await auth()
  if (!session) return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), client: null }
  const cfg = await loadPaperlessConfig()
  if (!paperlessAllowed(cfg, session.user.role) || !cfg.baseUrl || !cfg.token) {
    return { denied: NextResponse.json({ error: "Not found" }, { status: 404 }), client: null }
  }
  const client = createPaperlessClient({ baseUrl: cfg.baseUrl, token: cfg.token, timeoutMs: 60_000 })
  return { denied: null, client, session }
}
