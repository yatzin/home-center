import { describe, expect, it } from "vitest"
import type { Features } from "@/lib/features"
import {
  CARD_TYPES,
  availableCardTypes,
  cardType,
  defaultLayout,
  limitsMap,
  PHONE_WIDTH_SCALE,
  tierOf,
  type CardTypeDef,
} from "./card-types"
import { LARGE_COLS, LAYOUT_FORMAT, PHONE_COLS, validateLayout } from "./layout"

const ALL_ON: Features = { health: true, rooms: true, equipmentTab: true, customizedDashboards: true }

const IDS = [
  "properties",
  "vehicles",
  "people",
  "equipment",
  "rooms",
  "records",
  "active-warranties",
  "due-maintenance",
  "intake",
  "reminders",
  "expiring-warranties",
  "spending-trend",
  "spending-breakdown",
]

const within = (s: { w: number; h: number }, d: CardTypeDef) =>
  d.min.w <= s.w && s.w <= d.max.w && d.min.h <= s.h && s.h <= d.max.h

describe("CARD_TYPES", () => {
  it("has exactly the thirteen first-round ids, each once", () => {
    const ids = CARD_TYPES.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...IDS].sort())
  })

  it("gates People on health and Rooms on rooms, nothing else", () => {
    const gated = Object.fromEntries(CARD_TYPES.filter((d) => d.requires).map((d) => [d.id, d.requires]))
    expect(gated).toEqual({ people: "health", rooms: "rooms" })
  })

  it.each(CARD_TYPES.map((d) => [d.id, d] as const))("%s has sane sizes", (_id, d) => {
    expect(d.min.w).toBeGreaterThanOrEqual(1)
    expect(d.min.h).toBeGreaterThanOrEqual(1)
    expect(d.max.w).toBeLessThanOrEqual(LARGE_COLS)
    expect(within(d.large, d)).toBe(true)
    expect(within(d.phone, d)).toBe(true)
    expect(d.phone.w).toBeLessThanOrEqual(PHONE_COLS)
  })

  it.each(CARD_TYPES.map((d) => [d.id, d] as const))("%s has ascending tiers starting at its minimum", (_id, d) => {
    expect(d.tiers.length).toBeGreaterThanOrEqual(2)
    expect(d.tiers[0]).toMatchObject({ minW: d.min.w, minH: d.min.h })
    for (let i = 1; i < d.tiers.length; i++) {
      const a = d.tiers[i - 1]
      const b = d.tiers[i]
      expect(b.minW >= a.minW && b.minH >= a.minH && (b.minW > a.minW || b.minH > a.minH)).toBe(true)
    }
    // Every tier is reachable within the card's maximum.
    const top = d.tiers[d.tiers.length - 1]
    expect(top.minW <= d.max.w && top.minH <= d.max.h).toBe(true)
    expect(new Set(d.tiers.map((t) => t.name)).size).toBe(d.tiers.length)
  })

  it.each(CARD_TYPES.map((d) => [d.id, d] as const))("%s default config parses with its own schema", (_id, d) => {
    const r = d.configSchema.safeParse(d.defaultConfig)
    expect(r.success).toBe(true)
    expect(d.configSchema.safeParse({}).success).toBe(true)
  })

  it("is frozen, so in-place edits cannot corrupt the catalog", () => {
    expect(Object.isFrozen(CARD_TYPES)).toBe(true)
    for (const d of CARD_TYPES) {
      for (const o of [d, d.min, d.max, d.large, d.phone, d.tiers, ...d.tiers, d.defaultConfig]) {
        expect(Object.isFrozen(o)).toBe(true)
      }
    }
    const props = cardType("properties")!
    expect(() => {
      ;(props.min as { w: number }).w = 9
    }).toThrow()
    expect(cardType("vehicles")!.min.w).toBe(2)
  })

  it("has a lucide icon name, label and description for every card", () => {
    for (const d of CARD_TYPES) {
      expect(d.icon).toMatch(/^[A-Z][A-Za-z0-9]+$/)
      expect(d.label.length).toBeGreaterThan(0)
      expect(d.description.length).toBeGreaterThan(0)
    }
  })
})

describe("config schemas", () => {
  it("asset cards take an item filter and a limit", () => {
    const s = cardType("properties")!.configSchema
    expect(s.safeParse({ itemId: "abc", limit: 5 }).success).toBe(true)
    expect(s.safeParse({ limit: 0 }).success).toBe(false)
    expect(s.safeParse({ itemId: 3 }).success).toBe(false)
  })

  it("reminder-like cards take a window, an asset type and a limit", () => {
    const s = cardType("reminders")!.configSchema
    expect(s.safeParse({ windowDays: 14, assetType: "VEHICLE", limit: 4 }).success).toBe(true)
    expect(s.safeParse({ assetType: "BOAT" }).success).toBe(false)
    expect(s.safeParse({ windowDays: -1 }).success).toBe(false)
    expect(cardType("expiring-warranties")!.configSchema.safeParse({ windowDays: 90 }).success).toBe(true)
  })

  it("spending cards take a range", () => {
    for (const id of ["spending-trend", "spending-breakdown"]) {
      const s = cardType(id)!.configSchema
      expect(s.safeParse({ range: "12m" }).success).toBe(true)
      expect(s.safeParse({ range: "ytd" }).success).toBe(true)
      expect(s.safeParse({ range: "5y" }).success).toBe(false)
    }
  })
})

describe("cardType", () => {
  it("finds by id and returns undefined for unknown ids", () => {
    expect(cardType("vehicles")?.label).toBe("Vehicles")
    expect(cardType("nope")).toBeUndefined()
  })
})

describe("availableCardTypes", () => {
  it("lists everything when all features are on", () => {
    expect(availableCardTypes(ALL_ON).map((d) => d.id)).toEqual(CARD_TYPES.map((d) => d.id))
  })

  it("omits People without health and Rooms without rooms", () => {
    const noHealth = availableCardTypes({ ...ALL_ON, health: false }).map((d) => d.id)
    expect(noHealth).not.toContain("people")
    expect(noHealth).toContain("rooms")
    const noRooms = availableCardTypes({ ...ALL_ON, rooms: false }).map((d) => d.id)
    expect(noRooms).not.toContain("rooms")
    expect(noRooms).toContain("people")
  })
})

describe("limitsMap", () => {
  it("maps every type to its min, max and large size as default", () => {
    const m = limitsMap()
    expect(m.size).toBe(CARD_TYPES.length)
    for (const d of CARD_TYPES) expect(m.get(d.id)).toEqual({ min: d.min, max: d.max, default: d.large })
  })
})

describe("tierOf", () => {
  const def = {
    ...cardType("properties")!,
    tiers: [
      { name: "a", minW: 2, minH: 1 },
      { name: "b", minW: 3, minH: 2 },
      { name: "c", minW: 6, minH: 4 },
    ],
  }

  it("returns 0 below the first tier", () => {
    expect(tierOf(def, { w: 1, h: 1 })).toBe(0)
    expect(tierOf(def, { w: 0, h: 0 })).toBe(0)
  })

  it("picks the highest tier whose both minimums are met, at the boundaries", () => {
    expect(tierOf(def, { w: 2, h: 1 })).toBe(0)
    expect(tierOf(def, { w: 3, h: 1 })).toBe(0)
    expect(tierOf(def, { w: 2, h: 2 })).toBe(0)
    expect(tierOf(def, { w: 3, h: 2 })).toBe(1)
    expect(tierOf(def, { w: 5, h: 8 })).toBe(1)
    expect(tierOf(def, { w: 12, h: 3 })).toBe(1)
    expect(tierOf(def, { w: 6, h: 4 })).toBe(2)
    expect(tierOf(def, { w: 12, h: 8 })).toBe(2)
  })

  it("shows today's content at each card's default size", () => {
    const tierName = (id: string) => {
      const d = cardType(id)!
      return d.tiers[tierOf(d, d.large)].name
    }
    // Hero tiles show their photos; the spending card shows its chart.
    expect(tierName("properties")).toBe("thumbnails")
    expect(tierName("vehicles")).toBe("thumbnails")
    expect(tierName("spending-trend")).toBe("chart")
    expect(tierName("reminders")).toBe("list")
    expect(tierName("records")).toBe("count")
  })
})

describe("tierOf in phone mode", () => {
  const name = (id: string, size: { w: number; h: number }) => {
    const d = cardType(id)!
    return d.tiers[tierOf(d, size, "phone")].name
  }

  it("scales phone width by PHONE_WIDTH_SCALE and leaves height alone", () => {
    expect(PHONE_WIDTH_SCALE).toBe(2)
    const d = cardType("properties")!
    expect(tierOf(d, { w: 2, h: 2 }, "phone")).toBe(tierOf(d, { w: 4, h: 2 }))
    expect(tierOf(d, { w: 2, h: 1 }, "phone")).toBe(0)
    // Large mode is the default and unchanged.
    expect(tierOf(d, { w: 2, h: 4 })).toBe(0)
    expect(tierOf(d, { w: 2, h: 4 }, "large")).toBe(0)
  })

  it.each([
    ["properties", "thumbnails"],
    ["vehicles", "thumbnails"],
    ["people", "thumbnails"],
    ["equipment", "thumbnails"],
    ["rooms", "thumbnails"],
    ["records", "count"],
    ["active-warranties", "count"],
    ["due-maintenance", "next"],
    ["intake", "list"],
    ["reminders", "list"],
    ["expiring-warranties", "list"],
    ["spending-trend", "chart"],
    ["spending-breakdown", "ranked"],
  ])("%s's phone default size shows its %s tier", (id, tier) => {
    expect(name(id, cardType(id)!.phone)).toBe(tier)
  })

  it.each(["properties", "vehicles", "reminders", "expiring-warranties", "intake", "spending-trend"])(
    "a full-width phone %s reaches its middle tier given the height",
    (id) => {
      expect(tierOf(cardType(id)!, { w: PHONE_COLS, h: 8 }, "phone")).toBeGreaterThanOrEqual(1)
    },
  )
})

describe("defaultLayout", () => {
  it("is a valid layout with a derived phone layout", () => {
    for (const f of [ALL_ON, { ...ALL_ON, health: false }, { ...ALL_ON, rooms: false }]) {
      const l = defaultLayout(f)
      expect(l.format).toBe(LAYOUT_FORMAT)
      expect(l.phone).toBeNull()
      expect(validateLayout(l, limitsMap())).toBeNull()
    }
  })

  it("contains every element of today's dashboard, in order, and no Rooms", () => {
    const l = defaultLayout(ALL_ON)
    expect(l.cards.map((c) => c.type)).toEqual([
      "properties",
      "vehicles",
      "people",
      "equipment",
      "records",
      "active-warranties",
      "due-maintenance",
      "intake",
      "reminders",
      "expiring-warranties",
      "spending-trend",
    ])
  })

  it("omits People when health is off", () => {
    const l = defaultLayout({ ...ALL_ON, health: false })
    expect(l.cards.map((c) => c.type)).not.toContain("people")
    expect(l.cards.map((c) => c.type)).toContain("equipment")
  })

  it("puts the hero tiles and stacks on top and the four lower cards in a row below", () => {
    const l = defaultLayout(ALL_ON)
    const at = new Map(l.cards.map((c) => [c.type, l.large.find((p) => p.id === c.id)!]))
    const top = ["properties", "vehicles", "people", "equipment", "records", "active-warranties", "due-maintenance"]
    const bottom = ["intake", "reminders", "expiring-warranties", "spending-trend"]
    const topBottom = Math.max(...top.map((t) => at.get(t)!.y + at.get(t)!.h))
    for (const t of bottom) expect(at.get(t)!.y).toBe(topBottom)
    expect(bottom.map((t) => at.get(t)!.x)).toEqual([0, 3, 6, 9])
    // Properties then Vehicles side by side; People above Equipment in one column.
    expect(at.get("properties")!.x).toBeLessThan(at.get("vehicles")!.x)
    expect(at.get("people")!.x).toBe(at.get("equipment")!.x)
    expect(at.get("people")!.y).toBeLessThan(at.get("equipment")!.y)
    // The top block has no holes: its cards (which never overlap) tile it exactly.
    const area = top.reduce((sum, t) => sum + at.get(t)!.w * at.get(t)!.h, 0)
    expect(area).toBe(LARGE_COLS * topBottom)
  })

  it("gives Equipment the whole column when People is gone", () => {
    const l = defaultLayout({ ...ALL_ON, health: false })
    const eq = l.large.find((p) => l.cards.find((c) => c.id === p.id)!.type === "equipment")!
    const prop = l.large.find((p) => l.cards.find((c) => c.id === p.id)!.type === "properties")!
    expect(eq.y).toBe(0)
    expect(eq.h).toBe(prop.h)
    const area = l.large.filter((p) => p.y < prop.h).reduce((sum, p) => sum + p.w * p.h, 0)
    expect(area).toBe(LARGE_COLS * prop.h)
  })

  it("is deterministic with unique, stable card ids and default configs", () => {
    const a = defaultLayout(ALL_ON)
    expect(defaultLayout(ALL_ON)).toEqual(a)
    expect(new Set(a.cards.map((c) => c.id)).size).toBe(a.cards.length)
    for (const c of a.cards) expect(c.config).toEqual(cardType(c.type)!.defaultConfig)
    // Mutating one result does not leak into the next.
    a.cards[0].config.limit = 99
    expect(defaultLayout(ALL_ON).cards[0].config.limit).not.toBe(99)
  })
})
