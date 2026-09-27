import { describe, expect, it } from "vitest"
import { warrantyState } from "./warranty-status"

const now = new Date("2026-09-27T12:00:00Z")
const d = (s: string) => new Date(`${s}T14:00:00Z`)

describe("warrantyState", () => {
  it("classifies against today and the window", () => {
    expect(warrantyState(d("2026-09-26"), now, 180)).toEqual({ state: "expired", daysLeft: -1 })
    expect(warrantyState(d("2026-10-14"), now, 180)).toEqual({ state: "expiring", daysLeft: 17 })
    expect(warrantyState(d("2028-01-01"), now, 180)).toMatchObject({ state: "active" })
  })

  it("counts a warranty ending today as still expiring", () => {
    expect(warrantyState(d("2026-09-27"), now, 30)).toEqual({ state: "expiring", daysLeft: 0 })
  })

  it("treats a missing expiry as open-ended", () => {
    expect(warrantyState(null, now, 180)).toEqual({ state: "active", daysLeft: null })
  })
})
