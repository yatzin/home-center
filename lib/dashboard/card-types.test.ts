import { describe, expect, it } from "vitest"
import { z } from "zod"
import type { Features } from "@/lib/features"
import {
  CARD_TYPES,
  availableCardTypes,
  CARD_GROUPS,
  cardType,
  configFieldsFor,
  invalidCardConfig,
  normalizeCardConfigs,
  defaultLayout,
  groupCardTypes,
  limitsMap,
  PHONE_WIDTH_SCALE,
  phoneSizePresets,
  tierOf,
  type CardTypeDef,
} from "./card-types"
import { LARGE_COLS, LAYOUT_FORMAT, PHONE_COLS, repairLayout, validateLayout } from "./layout"
import { assetLook } from "./avatar-layout"
import { datedLook } from "./dated-list-layout"
import { resolvePhoneLayout } from "./resolve-phone"

const ALL_ON: Features = { health: true, rooms: true, equipmentTab: true }

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
  "text",
  "clock",
  "planned-spend",
  "equipment-life",
  "activity",
  "visits-heatmap",
  "observations-heatmap",
]

const within = (s: { w: number; h: number }, d: CardTypeDef) =>
  d.min.w <= s.w && s.w <= d.max.w && d.min.h <= s.h && s.h <= d.max.h

describe("CARD_TYPES", () => {
  it("has exactly the catalog's ids (the first round, Text and Clock), each once", () => {
    const ids = CARD_TYPES.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...IDS].sort())
  })

  it("gates People and the health calendars on health and Rooms on rooms, nothing else", () => {
    const gated = Object.fromEntries(CARD_TYPES.filter((d) => d.requires).map((d) => [d.id, d.requires]))
    expect(gated).toEqual({ people: "health", rooms: "rooms", "visits-heatmap": "health", "observations-heatmap": "health" })
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
    // Text has one look at every size; every other card shows more as it grows.
    const single = d.id === "text"
    expect(d.tiers.length).toBeGreaterThanOrEqual(single ? 1 : 2)
    expect(d.tiers[0]).toMatchObject({ minW: d.min.w, minH: d.min.h })
    // Avatar looks (asset cards) are picked by shape, not by size order: they
    // come first, and the sized tiers after them ascend as everywhere else.
    const looks = d.tiers.filter((t) => t.look)
    // A "column" tier (the calendar cards) or "rows" tier (the spending breakdown) is the look for a narrow, tall card: it
    // sits beside the wide-and-short "flat" look rather than above it, so it is left
    // out of the ordering check (and must be one column wide, two rows tall).
    const sized = d.tiers.filter((t) => !t.look && t.name !== "column" && t.name !== "rows")
    for (const branch of d.tiers.filter((t) => t.name === "column" || t.name === "rows")) expect(branch).toMatchObject({ minW: 1, minH: 2 })
    expect(d.tiers.slice(0, looks.length)).toEqual(looks)
    expect(sized.length).toBeGreaterThanOrEqual(looks.length > 0 || single ? 1 : 2)
    for (let i = 1; i < sized.length; i++) {
      const a = sized[i - 1]
      const b = sized[i]
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
    expect(cardType("vehicles")!.min.w).toBe(1)
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
    // The dated lists' default sizes now show their new looks (see "dated list looks").
    expect(tierName("reminders")).toBe("condensed")
    expect(tierName("records")).toBe("carousel")
  })

  it("keeps the spending chart and ranked bars to sizes that fit them", () => {
    const at = (id: string, w: number, h: number) => {
      const d = cardType(id)!
      return d.tiers[tierOf(d, { w, h })].name
    }
    // Three rows leave the trend chart too little height: the headline only.
    expect(at("spending-trend", 3, 3)).toBe("headline")
    expect(at("spending-trend", 3, 4)).toBe("chart")
    // Smaller than the ranked bars, the breakdown still shows every category, condensed.
    expect(at("spending-breakdown", 1, 1)).toBe("top")
    expect(at("spending-breakdown", 2, 1)).toBe("slices")
    expect(at("spending-breakdown", 12, 1)).toBe("slices")
    expect(at("spending-breakdown", 1, 2)).toBe("rows")
    expect(at("spending-breakdown", 1, 6)).toBe("rows")
    expect(at("spending-breakdown", 3, 3)).toBe("rows")
    expect(at("spending-breakdown", 4, 2)).toBe("rows")
    expect(at("spending-breakdown", 4, 3)).toBe("ranked")
  })
})

describe("tierOf in phone mode", () => {
  const name = (id: string, size: { w: number; h: number }) => {
    const d = cardType(id)!
    return d.tiers[tierOf(d, size, "phone")].name
  }

  it("scales phone width by PHONE_WIDTH_SCALE and leaves height alone", () => {
    expect(PHONE_WIDTH_SCALE).toBe(2)
    // Records' looks scale the phone width (asset cards' avatar looks read the raw size).
    const d = cardType("records")!
    expect(tierOf(d, { w: 2, h: 2 }, "phone")).toBe(tierOf(d, { w: 4, h: 2 }))
    expect(tierOf(d, { w: 2, h: 4 }, "phone")).toBe(tierOf(d, { w: 4, h: 4 }))
    expect(tierOf(d, { w: 2, h: 1 }, "phone")).toBe(0)
    // Large mode is the default and unscaled.
    expect(d.tiers[tierOf(d, { w: 2, h: 4 })].name).toBe("slim")
    expect(tierOf(d, { w: 2, h: 4 }, "large")).toBe(tierOf(d, { w: 2, h: 4 }))
    // Spending Trend has no looks: its sized tiers scale the same way.
    const t = cardType("spending-trend")!
    expect(tierOf(t, { w: 2, h: 4 }, "phone")).toBe(tierOf(t, { w: 4, h: 4 }))
  })

  // Asset cards on the phone grid are at most 2 columns wide, so they always
  // show an avatar look there (raw cells, not scaled): pills at full width.
  it.each([
    ["properties", "column-pills"],
    ["vehicles", "column-pills"],
    ["people", "column-pills"],
    ["equipment", "column-pills"],
    ["rooms", "thumbnails"],
    ["records", "carousel"],
    ["active-warranties", "carousel"],
    ["due-maintenance", "headline"],
    ["intake", "list"],
    ["reminders", "full"],
    ["expiring-warranties", "full"],
    ["spending-trend", "chart"],
    ["spending-breakdown", "ranked"],
    ["text", "text"],
  ])("%s's phone default size shows its %s tier", (id, tier) => {
    expect(name(id, cardType(id)!.phone)).toBe(tier)
  })

  it.each(["reminders", "expiring-warranties", "intake", "spending-trend"])(
    "a full-width phone %s reaches its middle tier given the height",
    (id) => {
      expect(tierOf(cardType(id)!, { w: PHONE_COLS, h: 8 }, "phone")).toBeGreaterThanOrEqual(1)
    },
  )
})

describe("asset card avatar looks", () => {
  const ASSETS = ["properties", "vehicles", "people", "equipment"]
  const name = (id: string, size: { w: number; h: number }, mode: "large" | "phone" = "large") => {
    const d = cardType(id)!
    return d.tiers[tierOf(d, size, mode)].name
  }

  it.each(ASSETS)("%s may be one cell; its maximum is unchanged", (id) => {
    const d = cardType(id)!
    expect(d.min).toEqual({ w: 1, h: 1 })
    expect(d.max).toEqual({ w: 12, h: 8 })
    expect(limitsMap().get(id)!.min).toEqual({ w: 1, h: 1 })
  })

  it("Rooms is not an avatar card: its minimum and tiers are as before", () => {
    const d = cardType("rooms")!
    expect(d.min).toEqual({ w: 2, h: 1 })
    expect(d.tiers.map((t) => t.name)).toEqual(["count", "thumbnails", "list"])
    expect(d.tiers.some((t) => t.look)).toBe(false)
  })

  it.each(ASSETS)("%s: each corner size shows its look, in either layout", (id) => {
    const cases: [number, number, string][] = [
      [1, 1, "single"],
      [1, 4, "column-circles"],
      [1, 6, "column-circles"],
      [2, 1, "row"],
      [2, 2, "column-pills"],
      [2, 6, "column-pills"],
      [3, 1, "row"],
      [12, 1, "row"],
      [3, 2, "thumbnails"],
      [12, 8, "list"],
    ]
    for (const [w, h, look] of cases) {
      expect(name(id, { w, h }), `${w}x${h}`).toBe(look)
      // assetLook names the look; "rich" sizes keep the sized tiers.
      expect(assetLook({ w, h })).toBe(["thumbnails", "list"].includes(look) ? "rich" : look)
    }
    // The phone grid uses the raw cells: a 2x2 phone card is not scaled to 4x2.
    for (const [w, h, look] of cases.filter(([w]) => w <= PHONE_COLS)) {
      expect(name(id, { w, h }, "phone"), `phone ${w}x${h}`).toBe(look)
    }
  })

  it.each(ASSETS)("%s: every size of 3+ columns and 2+ rows picks exactly today's tier", (id) => {
    // Today's rule: count 2x1, thumbnails 3x2, list 6x4, the richest that fits.
    const old = (w: number, h: number) => (w >= 6 && h >= 4 ? "list" : w >= 3 && h >= 2 ? "thumbnails" : "count")
    for (let w = 3; w <= 12; w++) {
      for (let h = 2; h <= 8; h++) expect(name(id, { w, h }), `${w}x${h}`).toBe(old(w, h))
    }
  })

  it("asset phone presets start at one cell (half the phone width)", () => {
    for (const id of ASSETS) {
      const presets = phoneSizePresets(cardType(id)!)
      expect(presets[0]).toEqual({ name: "Small", w: 1, h: 1 })
      expect(presets.slice(1).every((p) => p.w === PHONE_COLS)).toBe(true)
    }
  })

  it("a layout with one-cell and one-column asset cards is valid on both grids", () => {
    const l = {
      format: LAYOUT_FORMAT,
      cards: ASSETS.map((t) => ({ id: t, type: t, config: {} })),
      large: [
        { id: "properties", x: 0, y: 0, w: 1, h: 1 },
        { id: "vehicles", x: 1, y: 0, w: 1, h: 4 },
        { id: "people", x: 2, y: 0, w: 12 - 2, h: 1 },
        { id: "equipment", x: 2, y: 1, w: 2, h: 4 },
      ],
      phone: [
        { id: "properties", x: 0, y: 0, w: 1, h: 1 },
        { id: "vehicles", x: 1, y: 0, w: 1, h: 4 },
        { id: "people", x: 0, y: 4, w: 2, h: 1 },
        { id: "equipment", x: 0, y: 5, w: 2, h: 4 },
      ],
    }
    expect(validateLayout(l, limitsMap())).toBeNull()
    expect(repairLayout(l, limitsMap())).toEqual(l)
  })

  it("a one-column Rooms card is still outside its limits (and repair widens it)", () => {
    const l = {
      format: LAYOUT_FORMAT,
      cards: [{ id: "r", type: "rooms", config: {} }],
      large: [{ id: "r", x: 0, y: 0, w: 1, h: 2 }],
      phone: null,
    }
    expect(validateLayout(l, limitsMap())).toMatch(/outside its card size limits/)
    expect(repairLayout(l, limitsMap()).large[0]).toMatchObject({ w: 2, h: 2 })
  })

  it("existing saved layouts (asset cards 2+ wide) load unchanged", () => {
    const saved = defaultLayout(ALL_ON)
    const withPhone = {
      ...saved,
      phone: saved.large.map((p, i) => ({ id: p.id, x: 0, y: i * 4, w: 2, h: 4 })),
    }
    for (const l of [saved, withPhone]) {
      expect(validateLayout(l, limitsMap())).toBeNull()
      expect(repairLayout(l, limitsMap())).toEqual(l)
    }
  })
})

describe("dated list looks", () => {
  const DATED = ["records", "active-warranties", "due-maintenance", "reminders", "expiring-warranties"]
  const name = (id: string, w: number, h: number, mode: "large" | "phone" = "large") => {
    const d = cardType(id)!
    return d.tiers[tierOf(d, { w, h }, mode)].name
  }
  /** Each card's tier before the looks, for the sizes that keep it (6+ wide, 3+ tall). */
  const OLD: Record<string, (w: number, h: number) => string> = {
    records: (w, h) => (w >= 6 && h >= 3 ? "list" : w >= 3 && h >= 2 ? "recent" : "count"),
    "active-warranties": (w, h) => (w >= 6 && h >= 3 ? "list" : w >= 3 && h >= 2 ? "breakdown" : "count"),
    "due-maintenance": (w, h) => (w >= 4 && h >= 3 ? "list" : h >= 2 ? "next" : "count"),
    reminders: (w, h) => (w >= 6 && h >= 4 ? "grouped" : w >= 3 && h >= 3 ? "list" : "next"),
    "expiring-warranties": (w, h) => (w >= 6 && h >= 4 ? "grouped" : w >= 3 && h >= 3 ? "list" : "next"),
  }

  it.each(DATED)("%s: each corner size shows its look", (id) => {
    const rich6x3 = "list"
    const rich6x4 = id === "reminders" || id === "expiring-warranties" ? "grouped" : "list"
    const cases: [number, number, string][] = [
      [2, 1, "carousel"],
      [4, 1, "carousel"],
      [12, 1, "carousel"],
      [2, 2, "headline"],
      [3, 2, "headline"],
      [12, 2, "headline"],
      [2, 3, "slim"],
      [3, 3, "condensed"],
      [4, 3, "full"],
      [5, 3, "full"],
      [6, 3, rich6x3],
      [6, 4, rich6x4],
      [12, 8, rich6x4],
    ]
    for (const [w, h, look] of cases) {
      expect(name(id, w, h), `${w}x${h}`).toBe(look)
      // datedLook names the look; "rich" sizes keep the sized tiers.
      const dl = datedLook({ w, h })
      expect(dl === "rich" ? look === rich6x3 || look === rich6x4 : dl === look, `${w}x${h} ${dl}`).toBe(true)
    }
  })

  it.each(DATED)("%s: every rich size (6+ wide, 3+ tall) picks exactly today's tier", (id) => {
    for (let w = 6; w <= 12; w++) {
      for (let h = 3; h <= 8; h++) expect(name(id, w, h), `${w}x${h}`).toBe(OLD[id](w, h))
    }
  })

  it.each(DATED)("%s: on the phone the width is scaled (a full-width card reads as 4 wide), never rich", (id) => {
    expect(name(id, 2, 1, "phone")).toBe("carousel")
    expect(name(id, 2, 2, "phone")).toBe("headline")
    for (let h = 3; h <= 8; h++) expect(name(id, 2, h, "phone"), `2x${h}`).toBe("full")
    expect(name(id, 1, 4, "phone")).toBe("slim")
  })

  it.each(DATED)("%s: one row is its minimum; its defaults are as before", (id) => {
    const d = cardType(id)!
    expect(d.min).toEqual({ w: 2, h: 1 })
    expect(d.tiers[0]).toMatchObject({ name: "carousel", minW: 2, minH: 1, look: "carousel" })
    const before: Record<string, [{ w: number; h: number }, { w: number; h: number }]> = {
      records: [{ w: 2, h: 1 }, { w: 2, h: 1 }],
      "active-warranties": [{ w: 2, h: 1 }, { w: 2, h: 1 }],
      "due-maintenance": [{ w: 2, h: 2 }, { w: 2, h: 2 }],
      reminders: [{ w: 3, h: 4 }, { w: 2, h: 4 }],
      "expiring-warranties": [{ w: 3, h: 4 }, { w: 2, h: 4 }],
    }
    expect([d.large, d.phone]).toEqual(before[id])
  })

  it.each(DATED)("%s: phone presets start with a one-row Small", (id) => {
    const presets = phoneSizePresets(cardType(id)!)
    expect(presets[0]).toEqual({ name: "Small", w: 2, h: 1 })
    expect(presets.map((p) => name(id, p.w, p.h, "phone"))[0]).toBe("carousel")
  })

  it("saved layouts with these cards at their old sizes load unchanged", () => {
    const l = {
      format: LAYOUT_FORMAT,
      cards: DATED.map((t) => ({ id: t, type: t, config: {} })),
      large: [
        { id: "records", x: 0, y: 0, w: 2, h: 1 },
        { id: "active-warranties", x: 2, y: 0, w: 3, h: 2 },
        { id: "due-maintenance", x: 5, y: 0, w: 4, h: 3 },
        { id: "reminders", x: 0, y: 3, w: 2, h: 2 },
        { id: "expiring-warranties", x: 2, y: 3, w: 6, h: 4 },
      ],
      phone: [
        { id: "records", x: 0, y: 0, w: 2, h: 1 },
        { id: "active-warranties", x: 0, y: 1, w: 2, h: 2 },
        { id: "due-maintenance", x: 0, y: 3, w: 2, h: 2 },
        { id: "reminders", x: 0, y: 5, w: 2, h: 4 },
        { id: "expiring-warranties", x: 0, y: 9, w: 2, h: 2 },
      ],
    }
    expect(validateLayout(l, limitsMap())).toBeNull()
    expect(repairLayout(l, limitsMap())).toEqual(l)
    const saved = defaultLayout(ALL_ON)
    expect(repairLayout(saved, limitsMap())).toEqual(saved)
  })

  it("one-row Reminders and Expiring Warranties are now valid", () => {
    const l = {
      format: LAYOUT_FORMAT,
      cards: [
        { id: "r", type: "reminders", config: {} },
        { id: "e", type: "expiring-warranties", config: {} },
      ],
      large: [
        { id: "r", x: 0, y: 0, w: 2, h: 1 },
        { id: "e", x: 2, y: 0, w: 12 - 2, h: 1 },
      ],
      phone: null,
    }
    expect(validateLayout(l, limitsMap())).toBeNull()
  })
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

  it("contains the greeting and the clock, then the default cards, in order, and no Rooms", () => {
    const l = defaultLayout(ALL_ON)
    expect(l.cards.map((c) => c.type)).toEqual([
      "text",
      "clock",
      "properties",
      "vehicles",
      "people",
      "equipment",
      "records",
      "intake",
      "reminders",
      "expiring-warranties",
      "spending-trend",
      "activity",
      "spending-breakdown",
      "planned-spend",
    ])
  })

  it("omits People when health is off", () => {
    const l = defaultLayout({ ...ALL_ON, health: false })
    expect(l.cards.map((c) => c.type)).not.toContain("people")
    expect(l.cards.map((c) => c.type)).toContain("equipment")
  })

  it("places every default card where the dashboard has it", () => {
    const l = defaultLayout(ALL_ON)
    const at = (id: string) => l.large.find((p) => p.id === id)
    const expected: Record<string, [number, number, number, number]> = {
      greeting: [0, 0, 10, 1],
      clock: [10, 0, 2, 1],
      properties: [0, 1, 3, 4],
      vehicles: [3, 1, 3, 4],
      people: [6, 1, 4, 2],
      equipment: [6, 3, 4, 2],
      activity: [10, 1, 2, 1],
      records: [10, 2, 2, 1],
      "spending-breakdown": [10, 3, 2, 2],
      intake: [0, 5, 3, 4],
      reminders: [3, 5, 3, 4],
      "planned-spend": [6, 5, 3, 2],
      "expiring-warranties": [6, 7, 3, 2],
      "spending-trend": [9, 5, 3, 4],
    }
    for (const [id, [x, y, w, h]] of Object.entries(expected)) expect(at(id)).toEqual({ id, x, y, w, h })
    // The top block (below the greeting row) has no holes: its cards tile 12 columns by 4 rows exactly.
    const top = l.large.filter((p) => p.y >= 1 && p.y < 5)
    expect(top.reduce((sum, p) => sum + p.w * p.h, 0)).toBe(LARGE_COLS * 4)
    // The lower block does too: 12 columns by 4 rows.
    const bottom = l.large.filter((p) => p.y >= 5)
    expect(bottom.reduce((sum, p) => sum + p.w * p.h, 0)).toBe(LARGE_COLS * 4)
  })

  it("keeps the Service Activity calendar flat and the breakdown on the last 12 months", () => {
    const l = defaultLayout(ALL_ON)
    expect(l.cards.find((c) => c.id === "activity")?.config).toEqual({ months: 12 })
    expect(l.cards.find((c) => c.id === "spending-breakdown")?.config).toEqual({ range: "months", months: 12 })
    expect(l.cards.find((c) => c.id === "planned-spend")?.config).toEqual({ months: 12 })
  })

  it("gives Equipment the whole column when People is gone", () => {
    const l = defaultLayout({ ...ALL_ON, health: false })
    const eq = l.large.find((p) => l.cards.find((c) => c.id === p.id)!.type === "equipment")!
    const prop = l.large.find((p) => l.cards.find((c) => c.id === p.id)!.type === "properties")!
    expect(eq.y).toBe(prop.y)
    expect(eq.h).toBe(prop.h)
    const area = l.large.filter((p) => p.y >= prop.y && p.y < prop.y + prop.h).reduce((sum, p) => sum + p.w * p.h, 0)
    expect(area).toBe(LARGE_COLS * prop.h)
  })

  it("is deterministic with unique, stable card ids and default configs", () => {
    const a = defaultLayout(ALL_ON)
    expect(defaultLayout(ALL_ON)).toEqual(a)
    expect(new Set(a.cards.map((c) => c.id)).size).toBe(a.cards.length)
    // The greeting is a Text card with its own text, and the breakdown has its own period; every other card has its type's defaults.
    for (const c of a.cards.filter((c) => c.id !== "greeting" && c.id !== "spending-breakdown")) expect(c.config).toEqual(cardType(c.type)!.defaultConfig)
    // Mutating one result does not leak into the next.
    a.cards[2].config.limit = 99
    expect(defaultLayout(ALL_ON).cards[2].config.limit).not.toBe(99)
    a.cards[0].config.text = "changed"
    expect(defaultLayout(ALL_ON).cards[0].config.text).toBe("Welcome back, {user}")
  })
})

describe("configFieldsFor", () => {
  const shapeOf = (d: CardTypeDef): Record<string, z.ZodTypeAny> => {
    expect(d.configSchema).toBeInstanceOf(z.ZodObject)
    return (d.configSchema as unknown as z.ZodObject<z.ZodRawShape>).shape
  }
  /** The schema under ZodOptional/ZodDefault wrappers. */
  const inner = (s: z.ZodTypeAny): z.ZodTypeAny =>
    s instanceof z.ZodOptional ? inner(s.unwrap()) : s instanceof z.ZodDefault ? inner(s.removeDefault()) : s

  const LEGACY_KEYS: Record<string, string[]> = {
    "planned-spend": ["horizon"],
    activity: ["range"],
    "visits-heatmap": ["range"],
    "observations-heatmap": ["range"],
  }

  it.each(CARD_TYPES.map((d) => [d.id, d] as const))("%s describes every config key exactly once", (_id, d) => {
    const keys = configFieldsFor(d.id).map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    // An older config's key stays valid in the schema without a field of its own.
    const legacy = LEGACY_KEYS[d.id] ?? []
    expect([...keys].sort()).toEqual(Object.keys(shapeOf(d)).filter((k) => !legacy.includes(k)).sort())
  })

  it("returns [] for types without config and for unknown types", () => {
    for (const id of ["records", "active-warranties", "due-maintenance", "intake"]) expect(configFieldsFor(id)).toEqual([])
    expect(configFieldsFor("nope")).toEqual([])
  })

  it.each(CARD_TYPES.map((d) => [d.id, d] as const))("%s field kinds match the schema", (_id, d) => {
    const shape = shapeOf(d)
    for (const f of configFieldsFor(d.id)) {
      const s = inner(shape[f.key])
      expect(f.label.length).toBeGreaterThan(0)
      if (f.kind === "item") {
        expect(s).toBeInstanceOf(z.ZodString)
        expect(d.configSchema.safeParse({ [f.key]: "abc" }).success).toBe(true)
      } else if (f.kind === "asset") {
        expect(s).toBeInstanceOf(z.ZodString)
        expect(d.configSchema.safeParse({ [f.key]: "EQUIPMENT:abc" }).success).toBe(true)
        expect(d.configSchema.safeParse({ [f.key]: "abc" }).success).toBe(false)
      } else if (f.kind === "number") {
        expect(s).toBeInstanceOf(z.ZodNumber)
        // The field's bounds are exactly the schema's.
        expect(d.configSchema.safeParse({ [f.key]: f.min }).success).toBe(true)
        expect(d.configSchema.safeParse({ [f.key]: f.max }).success).toBe(true)
        expect(d.configSchema.safeParse({ [f.key]: f.min - 1 }).success).toBe(false)
        expect(d.configSchema.safeParse({ [f.key]: f.max + 1 }).success).toBe(false)
        expect(f.default >= f.min && f.default <= f.max).toBe(true)
      } else if (f.kind === "text") {
        expect(s).toBeInstanceOf(z.ZodString)
        // The field's cap is exactly the schema's; its default is valid.
        expect(d.configSchema.safeParse({ [f.key]: "x".repeat(f.maxLength) }).success).toBe(true)
        expect(d.configSchema.safeParse({ [f.key]: "x".repeat(f.maxLength + 1) }).success).toBe(false)
        expect(d.configSchema.safeParse({ [f.key]: f.default }).success).toBe(true)
      } else if (f.kind === "toggle") {
        expect(s).toBeInstanceOf(z.ZodBoolean)
        expect(d.configSchema.safeParse({ [f.key]: f.default }).success).toBe(true)
      } else {
        expect(s).toBeInstanceOf(z.ZodEnum)
        // Every option is a schema value, and every schema value is offered.
        expect(f.options.map((o) => o.value).sort()).toEqual([...(s as z.ZodEnum<[string, ...string[]]>).options].sort())
      }
    }
  })

  it("rooms picks a property; the asset cards pick their own type", () => {
    const item = (id: string) => configFieldsFor(id).find((f) => f.kind === "item")
    expect(item("rooms")).toMatchObject({ key: "itemId", itemType: "PROPERTY" })
    expect(item("properties")).toMatchObject({ itemType: "PROPERTY" })
    expect(item("vehicles")).toMatchObject({ itemType: "VEHICLE" })
    expect(item("people")).toMatchObject({ itemType: "PERSON" })
    expect(item("equipment")).toMatchObject({ itemType: "EQUIPMENT" })
  })

  it("offers People in an assetType choice only with Health (requires)", () => {
    const at = configFieldsFor("reminders").find((f) => f.key === "assetType")
    expect(at?.kind).toBe("choice")
    if (at?.kind !== "choice") return
    expect(at.options.find((o) => o.value === "PERSON")?.requires).toBe("health")
    expect(at.allLabel).toBeTruthy()
  })

  it("is frozen", () => {
    for (const d of CARD_TYPES) {
      const fields = configFieldsFor(d.id)
      expect(Object.isFrozen(fields)).toBe(true)
      for (const f of fields) expect(Object.isFrozen(f)).toBe(true)
    }
  })
})

describe("groupCardTypes", () => {
  it("puts every catalog type in exactly one named group, in group then catalog order", () => {
    const groups = groupCardTypes(CARD_TYPES)
    const ids = groups.flatMap((g) => g.types.map((t) => t.id))
    expect([...ids].sort()).toEqual(CARD_TYPES.map((d) => d.id).sort())
    expect(groups.map((g) => g.label)).toEqual(CARD_GROUPS.map((g) => g.label))
    for (const g of groups) {
      const order = g.types.map((t) => CARD_TYPES.indexOf(t))
      expect(order).toEqual([...order].sort((a, b) => a - b))
    }
  })

  it("lists the Text & time group first", () => {
    expect(groupCardTypes(CARD_TYPES)[0].label).toBe("Text & time")
  })

  it("leaves out empty groups", () => {
    const groups = groupCardTypes(CARD_TYPES.filter((d) => d.id === "intake"))
    expect(groups).toHaveLength(1)
    expect(groups[0].types.map((t) => t.id)).toEqual(["intake"])
  })

  it("follows availableCardTypes: People and Rooms gone with their features off", () => {
    const off: Features = { ...ALL_ON, health: false, rooms: false }
    const ids = groupCardTypes(availableCardTypes(off)).flatMap((g) => g.types.map((t) => t.id))
    expect(ids).not.toContain("people")
    expect(ids).not.toContain("rooms")
    expect(ids).toHaveLength(16)
  })

  it("puts a type with no group in a trailing Other group", () => {
    const stray = { ...CARD_TYPES[0], id: "stray" }
    const groups = groupCardTypes([stray, CARD_TYPES[0]])
    expect(groups.map((g) => g.label)).toEqual(["Assets", "Other"])
    expect(groups[1].types[0].id).toBe("stray")
  })
})

describe("invalidCardConfig", () => {
  const base = defaultLayout(ALL_ON)

  it("accepts the default layout and valid configs", () => {
    expect(invalidCardConfig(base)).toBeNull()
    const ok = { ...base, cards: base.cards.map((c) => (c.type === "reminders" ? { ...c, config: { windowDays: 14, assetType: "VEHICLE" } } : c)) }
    expect(invalidCardConfig(ok)).toBeNull()
  })

  it("names the card whose config its type's schema rejects", () => {
    const bad = { ...base, cards: base.cards.map((c) => (c.type === "reminders" ? { ...c, config: { windowDays: 0 } } : c)) }
    expect(invalidCardConfig(bad)).toMatch(/Reminders/)
    const badRange = { ...base, cards: base.cards.map((c) => (c.type === "spending-trend" ? { ...c, config: { range: "5y" } } : c)) }
    expect(invalidCardConfig(badRange)).toMatch(/Spending Trend/)
    const badItem = { ...base, cards: base.cards.map((c) => (c.type === "properties" ? { ...c, config: { itemId: 42 } } : c)) }
    expect(invalidCardConfig(badItem)).not.toBeNull()
  })

  it("leaves unknown types to validateLayout", () => {
    const unknown = { ...base, cards: [...base.cards, { id: "x", type: "nope", config: { anything: true } }] }
    expect(invalidCardConfig(unknown)).toBeNull()
  })
})

describe("normalizeCardConfigs", () => {
  const base = defaultLayout(ALL_ON)

  it("drops unknown keys from each card's config", () => {
    const dirty = {
      ...base,
      cards: base.cards.map((c) => (c.type === "reminders" ? { ...c, config: { windowDays: 14, junk: "x", nested: { a: 1 } } } : c)),
    }
    const out = normalizeCardConfigs(dirty)
    expect(out.cards.find((c) => c.type === "reminders")!.config).toEqual({ windowDays: 14 })
  })

  it("leaves valid configs and everything else unchanged", () => {
    expect(normalizeCardConfigs(base)).toEqual(base)
    const unknown = { ...base, cards: [...base.cards, { id: "x", type: "nope", config: { anything: true } }] }
    expect(normalizeCardConfigs(unknown)).toEqual(unknown)
  })

  it("does not mutate its input, and invalid configs are still rejected by invalidCardConfig", () => {
    const dirty = { ...base, cards: base.cards.map((c) => (c.type === "reminders" ? { ...c, config: { windowDays: 14, junk: 1 } } : c)) }
    normalizeCardConfigs(dirty)
    expect(dirty.cards.find((c) => c.type === "reminders")!.config).toEqual({ windowDays: 14, junk: 1 })
    const bad = { ...base, cards: base.cards.map((c) => (c.type === "reminders" ? { ...c, config: { windowDays: 0 } } : c)) }
    expect(invalidCardConfig(bad)).not.toBeNull()
  })
})

describe("phoneSizePresets", () => {
  const area = (s: { w: number; h: number }) => s.w * s.h
  /** A catalog type with other limits (tests the rules, not the catalog). */
  const withLimits = (min: { w: number; h: number }, max: { w: number; h: number }, phone: { w: number; h: number }): CardTypeDef => ({
    ...cardType("records")!,
    min,
    max,
    phone,
  })

  it.each(IDS)("%s: within its limits and PHONE_COLS, ascending area, no duplicates", (id) => {
    const d = cardType(id)!
    const presets = phoneSizePresets(d)
    expect(presets.length).toBeGreaterThanOrEqual(1)
    for (const p of presets) {
      expect(p.w).toBeLessThanOrEqual(PHONE_COLS)
      expect(p.w).toBeGreaterThanOrEqual(Math.min(d.min.w, PHONE_COLS))
      expect(p.w).toBeLessThanOrEqual(Math.max(Math.min(d.min.w, PHONE_COLS), Math.min(d.max.w, PHONE_COLS)))
      expect(p.h).toBeGreaterThanOrEqual(d.min.h)
      expect(p.h).toBeLessThanOrEqual(d.max.h)
    }
    for (let i = 1; i < presets.length; i++) expect(area(presets[i])).toBeGreaterThan(area(presets[i - 1]))
    const names = presets.map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
    // Names keep their order: Small before Medium before Large.
    const rank = { Small: 0, Medium: 1, Large: 2 }
    for (let i = 1; i < names.length; i++) expect(rank[names[i]]).toBeGreaterThan(rank[names[i - 1]])
  })

  it.each(IDS)("%s: three presets; Small is its smallest readable size, Medium shows more", (id) => {
    const d = cardType(id)!
    const presets = phoneSizePresets(d)
    expect(presets.map((p) => p.name)).toEqual(["Small", "Medium", "Large"])
    expect(presets[0].h).toBe(d.min.h)
    // Each step up shows at least as rich a tier.
    const tiers = presets.map((p) => tierOf(d, p, "phone"))
    expect(tiers[1]).toBeGreaterThanOrEqual(tiers[0])
    expect(tiers[2]).toBeGreaterThanOrEqual(tiers[1])
  })

  it("Medium is the phone default size when that is larger than Small", () => {
    for (const id of ["properties", "intake", "reminders", "spending-trend", "spending-breakdown", "people", "due-maintenance"]) {
      const d = cardType(id)!
      expect(phoneSizePresets(d)[1]).toMatchObject({ name: "Medium", w: d.phone.w, h: d.phone.h })
    }
  })

  it("records: default is the smallest size, so Medium and Large are taller", () => {
    expect(phoneSizePresets(cardType("records")!)).toEqual([
      { name: "Small", w: 2, h: 1 },
      { name: "Medium", w: 2, h: 2 },
      { name: "Large", w: 2, h: 4 },
    ])
  })

  it("properties: Small 1 row, Medium its default 4, Large 6", () => {
    expect(phoneSizePresets(cardType("properties")!).map((p) => p.h)).toEqual([1, 4, 6])
  })

  it("Large never exceeds the type's max height", () => {
    const presets = phoneSizePresets(withLimits({ w: 2, h: 2 }, { w: 12, h: 5 }, { w: 2, h: 4 }))
    expect(presets).toEqual([
      { name: "Small", w: 2, h: 2 },
      { name: "Medium", w: 2, h: 4 },
      { name: "Large", w: 2, h: 5 },
    ])
  })

  it("a fixed-size type has exactly one preset", () => {
    expect(phoneSizePresets(withLimits({ w: 2, h: 3 }, { w: 2, h: 3 }, { w: 2, h: 3 }))).toEqual([{ name: "Medium", w: 2, h: 3 }])
  })

  it("duplicates collapse when the limits leave little room", () => {
    const presets = phoneSizePresets(withLimits({ w: 2, h: 1 }, { w: 12, h: 2 }, { w: 2, h: 1 }))
    expect(presets).toEqual([
      { name: "Small", w: 2, h: 1 },
      { name: "Medium", w: 2, h: 2 },
    ])
  })

  it("a type that may be one column wide gets a half-width Small; the others are full width", () => {
    const presets = phoneSizePresets(withLimits({ w: 1, h: 1 }, { w: 12, h: 8 }, { w: 2, h: 2 }))
    expect(presets[0]).toEqual({ name: "Small", w: 1, h: 1 })
    expect(presets.slice(1).every((p) => p.w === PHONE_COLS)).toBe(true)
  })

  it("a type narrower than the phone grid stays within its max width", () => {
    const presets = phoneSizePresets(withLimits({ w: 1, h: 1 }, { w: 1, h: 6 }, { w: 1, h: 2 }))
    expect(presets.every((p) => p.w === 1)).toBe(true)
    expect(presets.map((p) => p.h)).toEqual([1, 2, 4])
  })

  it("a type whose large minimum is wider than the phone grid is full width", () => {
    const presets = phoneSizePresets(withLimits({ w: 4, h: 2 }, { w: 12, h: 8 }, { w: 2, h: 3 }))
    expect(presets.every((p) => p.w === PHONE_COLS)).toBe(true)
    expect(presets[0]).toMatchObject({ name: "Small", h: 2 })
  })
})

describe("text card", () => {
  const def = cardType("text")!

  it("is an ungated, non-data card with one look", () => {
    expect(def).toMatchObject({ label: "Text", icon: "Type" })
    expect(def.requires).toBeUndefined()
    expect(def.description).toMatch(/name|date/)
    expect(def.tiers).toEqual([{ name: "text", minW: 1, minH: 1 }])
  })

  it("is 1x1 to 12x4, added at 4x1 (2x1 on phones)", () => {
    expect(def.min).toEqual({ w: 1, h: 1 })
    expect(def.max).toEqual({ w: 12, h: 4 })
    expect(def.large).toEqual({ w: 4, h: 1 })
    expect(def.phone).toEqual({ w: 2, h: 1 })
    expect(limitsMap().get("text")).toEqual({ min: { w: 1, h: 1 }, max: { w: 12, h: 4 }, default: { w: 4, h: 1 } })
  })

  it("shows its one tier at every size, in either layout", () => {
    for (let w = 1; w <= 12; w++) {
      for (let h = 1; h <= 4; h++) {
        expect(tierOf(def, { w, h })).toBe(0)
        if (w <= PHONE_COLS) expect(tierOf(def, { w, h }, "phone")).toBe(0)
      }
    }
  })

  it("defaults to body text greeting the user, with the card's border", () => {
    expect(def.defaultConfig).toEqual({ text: "Hello, {user}", style: "body", align: "left", border: true })
  })

  it("has a text field, a style select, an alignment and a border switch", () => {
    const fields = configFieldsFor("text")
    expect(fields.map((f) => [f.key, f.kind])).toEqual([
      ["text", "text"],
      ["style", "choice"],
      ["align", "choice"],
      ["border", "toggle"],
    ])
    const text = fields[0]
    expect(text.kind === "text" && text.maxLength).toBe(500)
    expect(text.kind === "text" && text.tokens).toBe(true)
    const style = fields[1]
    expect(style.kind === "choice" && style.options.map((o) => o.value)).toEqual(["h1", "h2", "h3", "h4", "body", "small", "muted"])
    expect(style.kind === "choice" && style.allLabel).toBeFalsy()
  })

  it("is in the picker's Text group", () => {
    const groups = groupCardTypes(CARD_TYPES)
    expect(groups.find((g) => g.types.some((t) => t.id === "text"))?.label).toBe("Text & time")
  })

  it("phone presets: half-width Small, then full width", () => {
    expect(phoneSizePresets(def)).toEqual([
      { name: "Small", w: 1, h: 1 },
      { name: "Medium", w: 2, h: 1 },
      { name: "Large", w: 2, h: 3 },
    ])
  })

  it("validates its config on save: text length, enums, border; unknown keys dropped", () => {
    const base = defaultLayout(ALL_ON)
    const withText = (config: Record<string, unknown>) => ({
      ...base,
      cards: base.cards.map((c) => (c.id === "greeting" ? { ...c, config } : c)),
    })
    expect(invalidCardConfig(withText({ text: "Hi", style: "h3", align: "right", border: true }))).toBeNull()
    expect(invalidCardConfig(withText({ text: "x".repeat(501) }))).toMatch(/Text/)
    expect(invalidCardConfig(withText({ text: "   " }))).toMatch(/Text/)
    expect(invalidCardConfig(withText({ style: "h7" }))).toMatch(/Text/)
    expect(invalidCardConfig(withText({ align: "middle" }))).toMatch(/Text/)
    expect(invalidCardConfig(withText({ border: 0 }))).toMatch(/Text/)
    const out = normalizeCardConfigs(withText({ text: "Hi", junk: "<script>" }))
    expect(out.cards.find((c) => c.id === "greeting")!.config).toEqual({ text: "Hi", style: "body", align: "left", border: true })
  })

  it("a layout with Text cards at its limits is valid; beyond them it is not (and repair clamps)", () => {
    const l = {
      format: LAYOUT_FORMAT,
      cards: [
        { id: "a", type: "text", config: {} },
        { id: "b", type: "text", config: {} },
      ],
      large: [
        { id: "a", x: 0, y: 0, w: 1, h: 1 },
        { id: "b", x: 0, y: 1, w: 12, h: 4 },
      ],
      phone: [
        { id: "a", x: 0, y: 0, w: 1, h: 1 },
        { id: "b", x: 0, y: 1, w: 2, h: 4 },
      ],
    }
    expect(validateLayout(l, limitsMap())).toBeNull()
    const tall = { ...l, large: [l.large[0], { id: "b", x: 0, y: 1, w: 12, h: 5 }] }
    expect(validateLayout(tall, limitsMap())).toMatch(/outside its card size limits/)
    expect(repairLayout(tall, limitsMap()).large[1]).toMatchObject({ w: 12, h: 4 })
  })
})

describe("defaultLayout: the greeting", () => {
  it.each([
    ["all on", ALL_ON],
    ["Health off", { ...ALL_ON, health: false }],
    ["Rooms off", { ...ALL_ON, rooms: false }],
  ])("starts with a one-row, borderless H1 greeting beside the clock (%s)", (_name, f) => {
    const l = defaultLayout(f)
    expect(l.cards[0]).toEqual({
      id: "greeting",
      type: "text",
      config: { text: "Welcome back, {user}", style: "h1", align: "left", border: false },
    })
    expect(l.large.find((p) => p.id === "greeting")).toEqual({ id: "greeting", x: 0, y: 0, w: 10, h: 1 })
    // The clock takes the top-right two cells; nothing else shares the greeting's row.
    expect(l.large.find((p) => p.id === "clock")).toEqual({ id: "clock", x: 10, y: 0, w: 2, h: 1 })
    expect(l.large.filter((p) => p.id !== "greeting" && p.id !== "clock").every((p) => p.y >= 1)).toBe(true)
    expect(validateLayout(l, limitsMap())).toBeNull()
    expect(invalidCardConfig(l)).toBeNull()
    expect(normalizeCardConfigs(l)).toEqual(l)
    expect(repairLayout(l, limitsMap())).toEqual(l)
  })

  it("moves every other default card down one row, as it was before", () => {
    const at = (f: Features, id: string) => defaultLayout(f).large.find((p) => p.id === id)
    expect(at(ALL_ON, "properties")).toEqual({ id: "properties", x: 0, y: 1, w: 3, h: 4 })
    expect(at(ALL_ON, "people")).toEqual({ id: "people", x: 6, y: 1, w: 4, h: 2 })
    expect(at(ALL_ON, "equipment")).toEqual({ id: "equipment", x: 6, y: 3, w: 4, h: 2 })
    expect(at(ALL_ON, "records")).toEqual({ id: "records", x: 10, y: 2, w: 2, h: 1 })
    expect(at(ALL_ON, "intake")).toEqual({ id: "intake", x: 0, y: 5, w: 3, h: 4 })
    expect(at(ALL_ON, "spending-trend")).toEqual({ id: "spending-trend", x: 9, y: 5, w: 3, h: 4 })
    // Health off: Equipment takes People's freed slot too.
    expect(at({ ...ALL_ON, health: false }, "equipment")).toEqual({ id: "equipment", x: 6, y: 1, w: 4, h: 4 })
  })
})

describe("the Clock card", () => {
  const def = cardType("clock")!

  it("is 1x1 to 4x4, two cells wide by default on both grids", () => {
    expect(def).toMatchObject({ label: "Clock", icon: "CalendarClock" })
    expect(def.requires).toBeUndefined()
    expect(def.min).toEqual({ w: 1, h: 1 })
    expect(def.max).toEqual({ w: 4, h: 4 })
    expect(def.large).toEqual({ w: 2, h: 1 })
    expect(def.phone).toEqual({ w: 2, h: 1 })
  })

  it("shows the time, then the date with it, then the face", () => {
    expect(def.tiers.map((t) => t.name)).toEqual(["time", "standard", "face"])
    expect(tierOf(def, { w: 1, h: 1 })).toBe(0)
    expect(tierOf(def, { w: 2, h: 1 })).toBe(1)
    expect(tierOf(def, { w: 4, h: 1 })).toBe(1)
    expect(tierOf(def, { w: 2, h: 2 })).toBe(2)
    expect(tierOf(def, { w: 4, h: 4 })).toBe(2)
    // A half-width phone card counts as two large columns.
    expect(tierOf(def, { w: 1, h: 1 }, "phone")).toBe(1)
  })

  it("offers seconds, the date and the face, and no 12/24 hour setting (Settings > Regional has it)", () => {
    const fields = configFieldsFor("clock")
    expect(fields.map((f) => [f.key, f.kind])).toEqual([
      ["showSeconds", "toggle"],
      ["showDate", "toggle"],
      ["face", "choice"],
    ])
    expect(fields.some((f) => /hour|12|24/i.test(f.key))).toBe(false)
    expect(fields[0].help).toContain("Settings > Regional")
    expect(def.defaultConfig).toEqual({ showSeconds: false, showDate: true, face: "auto" })
  })

  it("validates its config on the server like every card", () => {
    const l = defaultLayout(ALL_ON)
    const withClock = (config: Record<string, unknown>) => ({
      ...l,
      cards: l.cards.map((c) => (c.type === "clock" ? { ...c, config } : c)),
    })
    expect(invalidCardConfig(withClock({ face: "sometimes" }))).toBe("The Clock card's settings are not valid.")
    expect(invalidCardConfig(withClock({ hour12: true }))).toBeNull()
    const clock = normalizeCardConfigs(withClock({ hour12: true, showSeconds: true })).cards.find((c) => c.type === "clock")!
    expect(clock.config).toEqual({ showSeconds: true, showDate: true, face: "auto" })
  })

  it("is in the picker's first group, after Text", () => {
    expect(groupCardTypes(CARD_TYPES)[0].types.map((t) => t.id)).toEqual(["text", "clock"])
  })

  it.each([
    ["all on", ALL_ON],
    ["Health off", { ...ALL_ON, health: false }],
    ["Rooms off", { ...ALL_ON, rooms: false }],
  ])("comes right after the greeting on phones, full width (%s)", (_name, f) => {
    const phone = resolvePhoneLayout(defaultLayout(f), f)
    const sorted = [...phone].sort((a, b) => a.y - b.y || a.x - b.x)
    expect(sorted[0].id).toBe("greeting")
    expect(sorted[1]).toEqual({ id: "clock", x: 0, y: sorted[0].h, w: PHONE_COLS, h: 1 })
  })

  it("phone presets: half-width small, full width, then a face", () => {
    expect(phoneSizePresets(def)).toEqual([
      { name: "Small", w: 1, h: 1 },
      { name: "Medium", w: 2, h: 1 },
      { name: "Large", w: 2, h: 3 },
    ])
  })
})

describe("calendar cards' column look", () => {
  const names = (id: string, w: number, h: number, mode: "large" | "phone" = "large") => {
    const def = cardType(id)!
    return def.tiers[tierOf(def, { w, h }, mode)].name
  }
  it.each(["activity", "visits-heatmap", "observations-heatmap"])("%s: one column wide and two or more rows tall is the column look", (id) => {
    for (const h of [2, 3, 4, 6]) expect(names(id, 1, h)).toBe("column")
    expect(names(id, 1, 1)).toBe("number")
    expect(names(id, 2, 1)).toBe("flat")
    expect(names(id, 3, 1)).toBe("flat")
    expect(names(id, 12, 1)).toBe("flat")
    expect(names(id, 2, 2)).toBe("calendar")
    expect(names(id, 4, 3)).toBe("labeled")
    expect(names(id, 6, 3)).toBe("insights")
  })
  it("a one-column phone card is two columns wide to the tiers, so it gets the calendar", () => {
    expect(names("activity", 1, 3, "phone")).toBe("calendar")
  })
})
