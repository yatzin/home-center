import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ auth: vi.fn(), upsert: vi.fn() }))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/prisma", () => ({ prisma: { paperlessSettings: { upsert: h.upsert } } }))

import { encrypt } from "@/lib/secret-box"
import { paperlessRoute } from "./config"

const FAKE = "fake-token-123"
let row: Record<string, unknown>

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-paperless-route"
})

beforeEach(() => {
  vi.clearAllMocks()
  row = { enabled: true, baseUrl: "https://paperless.example", apiTokenEnc: encrypt(FAKE), access: "EVERYONE", schedule: "OFF", time: "03:30", weekday: 0, lastCheckedAt: null, lastCheckSummary: null, lastCheckError: null }
  h.upsert.mockImplementation(async () => row)
  h.auth.mockResolvedValue({ user: { role: "USER" } })
})

describe("paperlessRoute", () => {
  it("401 with no session", async () => {
    h.auth.mockResolvedValue(null)
    const r = await paperlessRoute()
    expect(r.client).toBeNull()
    expect(r.denied?.status).toBe(401)
  })
  it("404 when disabled", async () => {
    row.enabled = false
    expect((await paperlessRoute()).denied?.status).toBe(404)
  })
  it("404 when unconfigured", async () => {
    row.baseUrl = null
    expect((await paperlessRoute()).denied?.status).toBe(404)
    row.baseUrl = "https://paperless.example"
    row.apiTokenEnc = null
    expect((await paperlessRoute()).denied?.status).toBe(404)
  })
  it("404 (not 403) for a USER when access is ADMIN", async () => {
    row.access = "ADMIN"
    const r = await paperlessRoute()
    expect(r.denied?.status).toBe(404)
    expect(await r.denied?.json()).toEqual({ error: "Not found" })
  })
  it("allows an ADMIN when access is ADMIN, returning a client", async () => {
    row.access = "ADMIN"
    h.auth.mockResolvedValue({ user: { role: "ADMIN" } })
    const r = await paperlessRoute()
    expect(r.denied).toBeNull()
    expect(typeof r.client?.status).toBe("function")
  })
  it("allows a USER when access is EVERYONE", async () => {
    const r = await paperlessRoute()
    expect(r.denied).toBeNull()
    expect(r.client).not.toBeNull()
  })
})
