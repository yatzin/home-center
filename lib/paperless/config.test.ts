import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

import { paperlessAllowed } from "./config"

const ok = { enabled: true, baseUrl: "https://paperless.example", token: "tok", access: "EVERYONE" as const }

describe("paperlessAllowed", () => {
  it("is false when disabled", () => {
    expect(paperlessAllowed({ ...ok, enabled: false }, "ADMIN")).toBe(false)
  })
  it("is false without a token or base URL", () => {
    expect(paperlessAllowed({ ...ok, token: null }, "ADMIN")).toBe(false)
    expect(paperlessAllowed({ ...ok, baseUrl: null }, "ADMIN")).toBe(false)
  })
  it("EVERYONE lets a USER in", () => {
    expect(paperlessAllowed(ok, "USER")).toBe(true)
  })
  it("ADMIN keeps a USER out and lets an ADMIN in", () => {
    expect(paperlessAllowed({ ...ok, access: "ADMIN" }, "USER")).toBe(false)
    expect(paperlessAllowed({ ...ok, access: "ADMIN" }, "ADMIN")).toBe(true)
  })
  it("is false with no role", () => {
    expect(paperlessAllowed(ok, undefined)).toBe(false)
  })
})
