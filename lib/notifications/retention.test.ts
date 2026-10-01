import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { NOTIFICATION_RETENTION_DAYS, retentionCutoff } from "./retention"

describe("retentionCutoff", () => {
  it("is the retention period before now", () => {
    const now = new Date("2026-10-01T12:00:00Z")
    expect(NOTIFICATION_RETENTION_DAYS).toBe(365)
    expect(retentionCutoff(now).toISOString()).toBe("2025-10-01T12:00:00.000Z")
  })
})
