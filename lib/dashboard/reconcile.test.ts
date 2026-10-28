import { describe, expect, it } from "vitest"
import type { Features } from "@/lib/features"
import { defaultLayout, limitsMap } from "./card-types"
import { reconcile } from "./reconcile"
import { validateLayout } from "./layout"

const ALL_ON: Features = { health: true, rooms: true, equipmentTab: true }
const NO_HEALTH: Features = { ...ALL_ON, health: false }

describe("reconcile", () => {
  it("falls back to the default for null", () => {
    expect(reconcile(null, ALL_ON)).toEqual(defaultLayout(ALL_ON))
  })
  it("falls back to the default for invalid JSON", () => {
    expect(reconcile("not json", ALL_ON)).toEqual(defaultLayout(ALL_ON))
  })
  it("falls back to the default for the wrong shape", () => {
    expect(reconcile(JSON.stringify({ hello: 1 }), ALL_ON)).toEqual(defaultLayout(ALL_ON))
    expect(reconcile("[]", ALL_ON)).toEqual(defaultLayout(ALL_ON))
  })
  it("repairs an unknown card type away", () => {
    const l = defaultLayout(ALL_ON)
    l.cards.push({ id: "x", type: "bogus", config: {} })
    l.large.push({ id: "x", x: 0, y: 40, w: 3, h: 3 })
    const out = reconcile(JSON.stringify(l), ALL_ON)
    expect(out.cards.some((c) => c.type === "bogus")).toBe(false)
    expect(validateLayout(out, limitsMap())).toBeNull()
  })
  it("keeps feature-gated cards when the feature is off", () => {
    const stored = defaultLayout(ALL_ON)
    expect(stored.cards.some((c) => c.type === "people")).toBe(true)
    const out = reconcile(JSON.stringify(stored), NO_HEALTH)
    expect(out.cards.some((c) => c.type === "people")).toBe(true)
  })
})
