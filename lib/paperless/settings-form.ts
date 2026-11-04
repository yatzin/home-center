import type { PaperlessSettingsInput } from "@/lib/actions/paperless-settings"

/** What the settings form holds while editing. The token field is write-only: it starts empty. */
export type PaperlessFormState = {
  enabled: boolean
  baseUrl: string
  apiToken: string
  clearToken: boolean
  access: "EVERYONE" | "ADMIN"
  schedule: "OFF" | "DAILY" | "WEEKLY"
  time: string
  weekday: string
}

export function formFromView(v: {
  enabled: boolean
  baseUrl: string | null
  access: "EVERYONE" | "ADMIN"
  schedule: "OFF" | "DAILY" | "WEEKLY"
  time: string
  weekday: number
}): PaperlessFormState {
  return {
    enabled: v.enabled,
    baseUrl: v.baseUrl ?? "",
    apiToken: "",
    clearToken: false,
    access: v.access,
    schedule: v.schedule,
    time: v.time,
    weekday: String(v.weekday),
  }
}

function tokenFields(f: PaperlessFormState): { apiToken?: string; clearToken?: true } {
  if (f.clearToken) return { clearToken: true }
  const t = f.apiToken.trim()
  // Undefined keeps the stored token.
  return t ? { apiToken: t } : {}
}

export function toSaveInput(f: PaperlessFormState): PaperlessSettingsInput {
  const weekday = Number(f.weekday)
  return {
    enabled: f.enabled,
    baseUrl: f.baseUrl.trim(),
    ...tokenFields(f),
    access: f.access,
    schedule: f.schedule,
    time: f.time,
    weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : 0,
  }
}

export function toTestInput(f: PaperlessFormState): { baseUrl: string; apiToken?: string; clearToken?: boolean } {
  return { baseUrl: f.baseUrl.trim(), ...tokenFields(f) }
}
