import { describe, expect, it } from "vitest"
import type { Features } from "@/lib/features"
import { cardType, defaultLayout, limitsMap } from "./card-types"
import { LAYOUT_FORMAT, PHONE_COLS, validateLayout, type DashboardLayout, type Placement } from "./layout"
import { resolvePhoneLayout } from "./resolve-phone"

const ALL_ON: Features = { health: true, rooms: true, equipmentTab: true, customizedDashboards: true }
const NO_HEALTH: Features = { ...ALL_ON, health: false }

const ids = (ps: readonly Placement[]) => ps.map((p) => p.id).sort()
const readingOrder = (ps: readonly Placement[]) => [...ps].sort((a, b) => a.y - b.y || a.x - b.x).map((p) => p.id)
const isValidPhone = (layout: DashboardLayout, phone: Placement[]) =>
  validateLayout({ ...layout, phone }, limitsMap())

function layoutOf(cards: [id: string, type: string][], large: Placement[], phone: Placement[] | null): DashboardLayout {
  return { format: LAYOUT_FORMAT, cards: cards.map(([id, type]) => ({ id, type, config: {} })), large, phone }
}

describe("resolvePhoneLayout", () => {
  it("returns the stored phone placements when present", () => {
    const layout = layoutOf(
      [
        ["a", "properties"],
        ["b", "records"],
      ],
      [
        { id: "a", x: 0, y: 0, w: 3, h: 4 },
        { id: "b", x: 3, y: 0, w: 2, h: 1 },
      ],
      [
        { id: "b", x: 0, y: 0, w: 2, h: 1 },
        { id: "a", x: 0, y: 1, w: 2, h: 3 },
      ],
    )
    expect(resolvePhoneLayout(layout, ALL_ON)).toEqual(layout.phone)
  })

  it("derives from the large layout in row-major order with each type's phone size", () => {
    const layout = layoutOf(
      [
        ["late", "intake"],
        ["right", "records"],
        ["left", "properties"],
      ],
      [
        { id: "late", x: 0, y: 4, w: 3, h: 4 },
        { id: "right", x: 10, y: 0, w: 2, h: 1 },
        { id: "left", x: 0, y: 0, w: 3, h: 4 },
      ],
      null,
    )
    const phone = resolvePhoneLayout(layout, ALL_ON)
    expect(readingOrder(phone)).toEqual(["left", "right", "late"])
    for (const p of phone) {
      const type = layout.cards.find((c) => c.id === p.id)!.type
      expect({ w: p.w, h: p.h }).toEqual({ ...cardType(type)!.phone })
    }
    expect(isValidPhone(layout, phone)).toBeNull()
  })

  it("derives the default layout into a valid full-width column of every card", () => {
    for (const features of [ALL_ON, NO_HEALTH]) {
      const layout = defaultLayout(features)
      const phone = resolvePhoneLayout(layout, features)
      expect(ids(phone)).toEqual(ids(layout.large))
      expect(phone.every((p) => p.x === 0 && p.w === PHONE_COLS)).toBe(true)
      expect(isValidPhone(layout, phone)).toBeNull()
    }
  })

  it("puts cards whose feature is off after the visible ones, so they leave no gap", () => {
    // A layout saved with health on, now viewed with health off.
    const layout = defaultLayout(ALL_ON)
    const phone = resolvePhoneLayout(layout, NO_HEALTH)
    expect(ids(phone)).toEqual(ids(layout.large))
    const order = readingOrder(phone)
    expect(order[order.length - 1]).toBe("people")
    const visibleBottom = Math.max(...phone.filter((p) => p.id !== "people").map((p) => p.y + p.h))
    const people = phone.find((p) => p.id === "people")!
    expect(people.y).toBe(visibleBottom)
    expect(isValidPhone(layout, phone)).toBeNull()
  })

  it("always contains exactly the placed cards: missing ones appended, orphans dropped", () => {
    const layout = layoutOf(
      [
        ["a", "properties"],
        ["b", "records"],
      ],
      [
        { id: "a", x: 0, y: 0, w: 3, h: 4 },
        { id: "b", x: 3, y: 0, w: 2, h: 1 },
      ],
      [
        { id: "a", x: 0, y: 0, w: 2, h: 4 },
        { id: "ghost", x: 0, y: 4, w: 2, h: 1 },
      ],
    )
    const phone = resolvePhoneLayout(layout, ALL_ON)
    expect(ids(phone)).toEqual(["a", "b"])
    expect(phone.find((p) => p.id === "a")).toEqual({ id: "a", x: 0, y: 0, w: 2, h: 4 })
    expect(phone.find((p) => p.id === "b")).toEqual({ id: "b", x: 0, y: 4, w: 2, h: 1 })
    expect(isValidPhone(layout, phone)).toBeNull()
  })

  it("keeps a card of an unknown type, full width below the known ones, without overlaps", () => {
    const layout = layoutOf(
      [
        ["a", "properties"],
        ["x", "no-such-card"],
      ],
      [
        { id: "x", x: 0, y: 0, w: 4, h: 2 },
        { id: "a", x: 4, y: 0, w: 3, h: 4 },
      ],
      null,
    )
    const phone = resolvePhoneLayout(layout, ALL_ON)
    expect(ids(phone)).toEqual(["a", "x"])
    const a = phone.find((p) => p.id === "a")!
    const x = phone.find((p) => p.id === "x")!
    expect(a).toEqual({ id: "a", x: 0, y: 0, w: 2, h: 4 })
    expect(x.x).toBe(0)
    expect(x.w).toBe(PHONE_COLS)
    expect(x.y).toBeGreaterThanOrEqual(a.y + a.h)
  })

  it("returns an empty list for an empty layout", () => {
    expect(resolvePhoneLayout(layoutOf([], [], null), ALL_ON)).toEqual([])
    expect(resolvePhoneLayout(layoutOf([], [], []), ALL_ON)).toEqual([])
  })

  it("does not mutate its input", () => {
    const layout = defaultLayout(ALL_ON)
    const before = JSON.stringify(layout)
    resolvePhoneLayout(layout, NO_HEALTH)
    expect(JSON.stringify(layout)).toBe(before)
  })
})
