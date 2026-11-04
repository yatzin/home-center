import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  status: vi.fn(),
  createClient: vi.fn(),
  runCheck: vi.fn(),
  checkRunning: vi.fn(),
  revalidate: vi.fn(),
}))
vi.mock("@/lib/auth-guard", () => ({ requireAdmin: h.requireAdmin }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }))
vi.mock("@/lib/paperless/sync-server", () => ({ runPaperlessCheck: h.runCheck, isPaperlessCheckRunning: h.checkRunning }))
vi.mock("@/lib/prisma", () => ({ prisma: { paperlessSettings: { findUnique: h.findUnique, upsert: h.upsert } } }))
vi.mock("@/lib/paperless/client", async (orig) => ({
  ...(await orig<typeof import("@/lib/paperless/client")>()),
  createPaperlessClient: h.createClient,
}))

import { decrypt, encrypt } from "@/lib/secret-box"
import { PaperlessError } from "@/lib/paperless/client"
import { runPaperlessCheckNow, savePaperlessSettings, testPaperlessConnection } from "./paperless-settings"

const FAKE = "fake-token-123"
const base = { enabled: true, baseUrl: "https://paperless.example", access: "EVERYONE", schedule: "OFF", time: "03:30", weekday: 0 } as const
let saved: Record<string, unknown> | null

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-paperless-actions"
})

beforeEach(() => {
  vi.clearAllMocks()
  saved = { baseUrl: "https://paperless.example", apiTokenEnc: encrypt("stored-token-xyz") }
  h.requireAdmin.mockResolvedValue({})
  h.findUnique.mockImplementation(async () => saved)
  h.upsert.mockImplementation(async () => ({
    enabled: true, baseUrl: (saved?.baseUrl as string) ?? null, apiTokenEnc: (saved?.apiTokenEnc as string) ?? null,
    access: "EVERYONE", schedule: "OFF", time: "03:30", weekday: 0, lastCheckedAt: null, lastCheckSummary: null, lastCheckError: null,
  }))
  h.status.mockResolvedValue({ version: "2.10.0" })
  h.createClient.mockReturnValue({ status: h.status })
  h.runCheck.mockResolvedValue({ examined: 0, updated: 0, textRefreshed: 0, broken: 0, restored: 0, skipped: 0 })
  h.checkRunning.mockReturnValue(false)
})

const updateArg = () => h.upsert.mock.calls[0][0].update as Record<string, unknown>

describe("savePaperlessSettings", () => {
  it("calls requireAdmin first; a rejection writes nothing", async () => {
    h.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"))
    await expect(savePaperlessSettings({ ...base })).rejects.toThrow("NEXT_REDIRECT")
    expect(h.findUnique).not.toHaveBeenCalled()
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it("keeps the stored token when none is given", async () => {
    expect(await savePaperlessSettings({ ...base })).toEqual({ ok: true })
    expect("apiTokenEnc" in updateArg()).toBe(false)
  })

  it("clears the token on clearToken (enabled=false)", async () => {
    expect(await savePaperlessSettings({ ...base, enabled: false, clearToken: true })).toEqual({ ok: true })
    expect(updateArg().apiTokenEnc).toBeNull()
  })

  it("stores a new token encrypted", async () => {
    expect(await savePaperlessSettings({ ...base, apiToken: FAKE })).toEqual({ ok: true })
    const enc = updateArg().apiTokenEnc as string
    expect(enc).not.toContain(FAKE)
    expect(decrypt(enc)).toBe(FAKE)
  })

  it("drops the stored token when the server origin changes", async () => {
    expect(await savePaperlessSettings({ ...base, enabled: false, baseUrl: "https://other.example" })).toEqual({ ok: true })
    expect(updateArg().apiTokenEnc).toBeNull()
  })

  it("rejects enabling without a valid URL", async () => {
    expect(await savePaperlessSettings({ ...base, baseUrl: "" })).toHaveProperty("error")
    expect(await savePaperlessSettings({ ...base, baseUrl: "ftp://x" })).toHaveProperty("error")
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it("rejects enabling without a token", async () => {
    saved = { baseUrl: "https://paperless.example", apiTokenEnc: null }
    expect(await savePaperlessSettings({ ...base })).toHaveProperty("error")
    saved = { baseUrl: "https://paperless.example", apiTokenEnc: encrypt("t") }
    expect(await savePaperlessSettings({ ...base, clearToken: true })).toHaveProperty("error")
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it("disabling with a blank or invalid URL keeps the saved URL and token", async () => {
    for (const baseUrl of ["", "   ", "not a url"]) {
      h.upsert.mockClear()
      expect(await savePaperlessSettings({ ...base, enabled: false, baseUrl })).toEqual({ ok: true })
      const u = updateArg()
      expect("baseUrl" in u).toBe(false)
      expect("apiTokenEnc" in u).toBe(false)
      expect(u.enabled).toBe(false)
    }
  })

  it("never returns the token", async () => {
    const r = await savePaperlessSettings({ ...base, apiToken: FAKE })
    const bad = await savePaperlessSettings({ ...base, baseUrl: "", apiToken: FAKE })
    expect(JSON.stringify([r, bad])).not.toContain(FAKE)
  })
})

describe("testPaperlessConnection", () => {
  it("calls requireAdmin first; a rejection fetches nothing", async () => {
    h.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"))
    await expect(testPaperlessConnection({ baseUrl: "https://paperless.example", apiToken: FAKE })).rejects.toThrow("NEXT_REDIRECT")
    expect(h.createClient).not.toHaveBeenCalled()
  })

  it("uses the typed token and returns the version only", async () => {
    const r = await testPaperlessConnection({ baseUrl: "https://paperless.example", apiToken: FAKE })
    expect(r).toEqual({ ok: true, version: "2.10.0" })
    expect(h.createClient.mock.calls[0][0]).toMatchObject({ token: FAKE })
    expect(JSON.stringify(r)).not.toContain(FAKE)
  })

  it("falls back to the saved token on the same origin", async () => {
    h.upsert.mockImplementation(async () => ({
      enabled: true, baseUrl: "https://paperless.example", apiTokenEnc: saved?.apiTokenEnc,
      access: "EVERYONE", schedule: "OFF", time: "03:30", weekday: 0, lastCheckedAt: null, lastCheckSummary: null, lastCheckError: null,
    }))
    await testPaperlessConnection({ baseUrl: "https://paperless.example" })
    expect(h.createClient.mock.calls[0][0]).toMatchObject({ token: "stored-token-xyz" })
  })

  it("drops the saved token when the origin changed", async () => {
    const r = await testPaperlessConnection({ baseUrl: "https://other.example" })
    expect(r).toHaveProperty("error")
    expect(h.createClient).not.toHaveBeenCalled()
  })

  it("returns fixed phrases on failure, never the token", async () => {
    h.status.mockRejectedValue(new PaperlessError("unauthorized"))
    const r1 = await testPaperlessConnection({ baseUrl: "https://paperless.example", apiToken: FAKE })
    h.status.mockRejectedValue(new Error(`boom ${FAKE}`))
    const r2 = await testPaperlessConnection({ baseUrl: "https://paperless.example", apiToken: FAKE })
    expect(r1).toEqual({ error: "Paperless rejected the access token" })
    expect(r2).toEqual({ error: "Connection test failed." })
    expect(JSON.stringify([r1, r2])).not.toContain(FAKE)
  })
})

describe("runPaperlessCheckNow", () => {
  const settingsRow = (over: Record<string, unknown> = {}) => ({
    enabled: true, baseUrl: "https://paperless.example", apiTokenEnc: encrypt(FAKE),
    access: "EVERYONE", schedule: "OFF", time: "03:30", weekday: 0, lastCheckedAt: null, lastCheckSummary: null, lastCheckError: null,
    ...over,
  })

  it("calls requireAdmin first; a rejection runs nothing", async () => {
    h.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"))
    await expect(runPaperlessCheckNow()).rejects.toThrow("NEXT_REDIRECT")
    expect(h.upsert).not.toHaveBeenCalled()
    expect(h.runCheck).not.toHaveBeenCalled()
  })

  it.each([
    ["disabled", { enabled: false }],
    ["no URL", { baseUrl: null }],
    ["no token", { apiTokenEnc: null }],
  ])("%s -> not enabled error, no run", async (_n, over) => {
    h.upsert.mockResolvedValue(settingsRow(over))
    expect(await runPaperlessCheckNow()).toEqual({ error: "Paperless is not enabled." })
    expect(h.runCheck).not.toHaveBeenCalled()
  })

  it("runs a MANUAL check and returns the summary, never the token", async () => {
    h.upsert
      .mockResolvedValueOnce(settingsRow())
      .mockResolvedValueOnce(settingsRow({ lastCheckSummary: "Checked 2 documents: 1 file updated, 0 text refreshed, 0 broken." }))
    const r = await runPaperlessCheckNow()
    expect(h.runCheck).toHaveBeenCalledWith("MANUAL")
    expect(r).toEqual({ ok: true, summary: "Checked 2 documents: 1 file updated, 0 text refreshed, 0 broken." })
    expect(h.revalidate).toHaveBeenCalledWith("/settings")
    expect(JSON.stringify(r)).not.toContain(FAKE)
  })

  it("returns the fixed lastCheckError phrase when the run failed", async () => {
    h.upsert
      .mockResolvedValueOnce(settingsRow())
      .mockResolvedValueOnce(settingsRow({ lastCheckError: "Paperless-ngx could not be reached." }))
    expect(await runPaperlessCheckNow()).toEqual({ error: "Paperless-ngx could not be reached." })
  })

  it("already running -> fixed error, no second run", async () => {
    h.upsert.mockResolvedValue(settingsRow())
    h.checkRunning.mockReturnValue(true)
    expect(await runPaperlessCheckNow()).toEqual({ error: "A Paperless check is already running." })
    expect(h.runCheck).not.toHaveBeenCalled()
  })

  it("an unexpected throw becomes a fixed phrase without the token", async () => {
    h.upsert.mockResolvedValue(settingsRow())
    h.runCheck.mockRejectedValue(new Error(`boom ${FAKE}`))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const r = await runPaperlessCheckNow()
    expect(r).toEqual({ error: "The Paperless check failed." })
    expect(JSON.stringify(r)).not.toContain(FAKE)
  })
})
