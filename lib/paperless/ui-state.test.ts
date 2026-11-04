import { beforeEach, describe, expect, it, vi } from "vitest"

const findUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({ prisma: { paperlessSettings: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

import { loadPaperlessUiState } from "./ui-state"

const row = { enabled: true, baseUrl: "https://p.example", apiTokenEnc: "enc", access: "EVERYONE" }

beforeEach(() => findUnique.mockReset())

describe("loadPaperlessUiState", () => {
  it("is unavailable with no settings row", async () => {
    findUnique.mockResolvedValue(null)
    expect(await loadPaperlessUiState("ADMIN")).toEqual({ available: false, linkBase: null })
  })
  it("is unavailable when disabled", async () => {
    findUnique.mockResolvedValue({ ...row, enabled: false })
    expect(await loadPaperlessUiState("ADMIN")).toEqual({ available: false, linkBase: null })
  })
  it("is unavailable with no stored token", async () => {
    findUnique.mockResolvedValue({ ...row, apiTokenEnc: null })
    expect(await loadPaperlessUiState("ADMIN")).toEqual({ available: false, linkBase: null })
  })
  it("is unavailable with no base URL", async () => {
    findUnique.mockResolvedValue({ ...row, baseUrl: null })
    expect(await loadPaperlessUiState("ADMIN")).toEqual({ available: false, linkBase: null })
  })
  it("is unavailable with no role", async () => {
    findUnique.mockResolvedValue(row)
    expect(await loadPaperlessUiState(undefined)).toEqual({ available: false, linkBase: null })
  })
  it("USER with EVERYONE is available", async () => {
    findUnique.mockResolvedValue(row)
    expect(await loadPaperlessUiState("USER")).toEqual({ available: true, linkBase: "https://p.example" })
  })
  it("USER with ADMIN access is unavailable", async () => {
    findUnique.mockResolvedValue({ ...row, access: "ADMIN" })
    expect(await loadPaperlessUiState("USER")).toEqual({ available: false, linkBase: null })
  })
  it("ADMIN with ADMIN access is available", async () => {
    findUnique.mockResolvedValue({ ...row, access: "ADMIN" })
    expect(await loadPaperlessUiState("ADMIN")).toEqual({ available: true, linkBase: "https://p.example" })
  })
})
