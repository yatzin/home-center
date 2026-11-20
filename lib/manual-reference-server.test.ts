import { beforeEach, describe, expect, it, vi } from "vitest"

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { attachment: { findMany } } }))
vi.mock("@/lib/features-server", () => ({ loadFeatures: async () => ({ health: true }) }))

import { loadManualOptions } from "./manual-reference-server"

/** Each relation filter in a where clause is one table in SQLite's join; the limit is 64. */
function relationFilters(where: unknown): number {
  if (Array.isArray(where)) return where.reduce((n, w) => n + relationFilters(w), 0)
  if (!where || typeof where !== "object") return 0
  return Object.entries(where).reduce(
    (n, [k, v]) => n + (k === "maintenanceSchedule" ? 1 : 0) + relationFilters(v),
    0,
  )
}

beforeEach(() => {
  findMany.mockReset()
  findMany.mockResolvedValue([])
})

describe("loadManualOptions", () => {
  it("keeps the join count flat however much equipment a property has", async () => {
    const targets = [
      { assetType: "PROPERTY" as const, assetId: "p1" },
      ...Array.from({ length: 100 }, (_, i) => ({ assetType: "EQUIPMENT" as const, assetId: `e${i}` })),
    ]
    await loadManualOptions(targets)
    expect(relationFilters(findMany.mock.calls[0][0].where)).toBeLessThan(10)
  })

  it("still matches every target's documents and reminder files", async () => {
    await loadManualOptions([
      { assetType: "PROPERTY", assetId: "p1" },
      { assetType: "EQUIPMENT", assetId: "e1" },
      { assetType: "EQUIPMENT", assetId: "e2" },
    ])
    const json = JSON.stringify(findMany.mock.calls[0][0].where)
    for (const id of ["p1", "e1", "e2"]) expect(json).toContain(id)
    expect(json).toContain("DOCUMENT")
    expect(json).toContain("MAINTENANCE")
  })
})
