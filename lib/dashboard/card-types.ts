// The dashboard's card catalog: what each card type is, how big it may be, and
// what it shows at each size. Pure TS (no React/Prisma), so the server, the
// editor and the tests share one source of truth.
//
// Sizes are grid units: the large grid is LARGE_COLS (12) wide with ~88px rows;
// the phone grid is PHONE_COLS (2) wide, and phones use one full-width column.
// Tiers say what a card reveals as it grows ("size is a lens"); each tier's
// minimums are in large-grid units, and the first tier is the card's minimum.
import { z } from "zod"
import type { Features } from "@/lib/features"
import { LAYOUT_FORMAT, type CardInstance, type CardLimits, type DashboardLayout, type Placement } from "./layout"
import type { Size } from "./grid"

export type CardTier = { name: string; minW: number; minH: number }

export type CardTypeDef = {
  id: string
  label: string
  description: string
  /** A lucide-react icon name. */
  icon: string
  /** The site feature this card belongs to; hidden everywhere when it is off. */
  requires?: "health" | "rooms"
  min: Size
  max: Size
  /** Size when added on the large grid (also its repair default). */
  large: Size
  /** Size when added on the phone grid. */
  phone: Size
  /** Ascending: each tier needs at least the previous one's width and height. */
  tiers: CardTier[]
  configSchema: z.ZodType<Record<string, unknown>>
  defaultConfig: Record<string, unknown>
}

// ---- Config schemas ---------------------------------------------------------

const limit = z.number().int().min(1).max(50)

/** One asset type's card: all of them, or (with itemId) just one. */
const assetConfig = z.object({ itemId: z.string().min(1).optional(), limit: limit.optional() })

const upcomingConfig = z.object({
  windowDays: z.number().int().min(1).max(365).optional(),
  assetType: z.enum(["PROPERTY", "VEHICLE", "EQUIPMENT", "PERSON"]).optional(),
  limit: limit.optional(),
})

const spendingConfig = z.object({ range: z.enum(["ytd", "12m"]).optional() })

const noConfig = z.object({})

// ---- Shared size/tier shapes ------------------------------------------------

// Count alone fits a short tile; a photo strip needs ~a quarter of the page and
// two rows; a per-item list needs half the page and enough rows for 3+ items.
const ASSET_TIERS: CardTier[] = [
  { name: "count", minW: 2, minH: 1 },
  { name: "thumbnails", minW: 3, minH: 2 },
  { name: "list", minW: 6, minH: 4 },
]
const ASSET_LIMITS = { min: { w: 2, h: 1 }, max: { w: 12, h: 8 } }

// Reminder-like lists: one headline item, a dated list, then (wide) grouped by
// urgency into overdue / soon / later columns.
const UPCOMING_TIERS: CardTier[] = [
  { name: "next", minW: 2, minH: 2 },
  { name: "list", minW: 3, minH: 3 },
  { name: "grouped", minW: 6, minH: 4 },
]
const UPCOMING_LIMITS = { min: { w: 2, h: 2 }, max: { w: 12, h: 8 }, large: { w: 3, h: 4 }, phone: { w: 2, h: 4 } }

function asset(
  id: string,
  label: string,
  description: string,
  icon: string,
  large: Size,
  phone: Size,
  thumbnails: number,
  requires?: CardTypeDef["requires"],
): CardTypeDef {
  return {
    id,
    label,
    description,
    icon,
    ...(requires ? { requires } : {}),
    ...ASSET_LIMITS,
    large,
    phone,
    tiers: ASSET_TIERS,
    configSchema: assetConfig,
    defaultConfig: { limit: thumbnails },
  }
}

// ---- The catalog ------------------------------------------------------------

// Hero tiles (Properties, Vehicles) are 3x4 by default: tall enough for today's
// photo mosaic. People/Equipment/Rooms default to a 4x2 strip of thumbnails.
export const CARD_TYPES: readonly CardTypeDef[] = [
  asset("properties", "Properties", "Your homes and land, with recent photos.", "Building2", { w: 3, h: 4 }, { w: 2, h: 4 }, 7),
  asset("vehicles", "Vehicles", "Cars and other vehicles, with recent photos.", "Car", { w: 3, h: 4 }, { w: 2, h: 4 }, 7),
  asset("people", "People", "Household members and their health records.", "HeartPulse", { w: 4, h: 2 }, { w: 2, h: 2 }, 18, "health"),
  asset("equipment", "Equipment", "Appliances, tools and other equipment.", "Refrigerator", { w: 4, h: 2 }, { w: 2, h: 2 }, 18),
  asset("rooms", "Rooms", "Rooms across your properties.", "DoorOpen", { w: 4, h: 2 }, { w: 2, h: 2 }, 18, "rooms"),
  {
    id: "records",
    label: "Records",
    description: "Service records logged so far.",
    icon: "Wrench",
    min: { w: 2, h: 1 },
    max: { w: 12, h: 6 },
    large: { w: 2, h: 1 },
    phone: { w: 2, h: 1 },
    tiers: [
      { name: "count", minW: 2, minH: 1 },
      { name: "recent", minW: 3, minH: 2 },
      { name: "list", minW: 6, minH: 3 },
    ],
    configSchema: noConfig,
    defaultConfig: {},
  },
  {
    id: "active-warranties",
    label: "Active Warranties",
    description: "Warranties still in force.",
    icon: "ShieldCheck",
    min: { w: 2, h: 1 },
    max: { w: 12, h: 6 },
    large: { w: 2, h: 1 },
    phone: { w: 2, h: 1 },
    tiers: [
      { name: "count", minW: 2, minH: 1 },
      { name: "breakdown", minW: 3, minH: 2 },
      { name: "list", minW: 6, minH: 3 },
    ],
    configSchema: noConfig,
    defaultConfig: {},
  },
  {
    id: "due-maintenance",
    label: "Due Maintenance",
    description: "Maintenance due within 30 days or by mileage.",
    icon: "Calendar",
    min: { w: 2, h: 1 },
    max: { w: 12, h: 8 },
    // Two rows by default: the count plus the most urgent item under it.
    large: { w: 2, h: 2 },
    phone: { w: 2, h: 2 },
    tiers: [
      { name: "count", minW: 2, minH: 1 },
      { name: "next", minW: 2, minH: 2 },
      { name: "list", minW: 4, minH: 3 },
    ],
    configSchema: noConfig,
    defaultConfig: {},
  },
  {
    id: "intake",
    label: "Intake",
    description: "Documents and photos waiting to be filed.",
    icon: "Inbox",
    min: { w: 2, h: 2 },
    max: { w: 12, h: 8 },
    large: { w: 3, h: 4 },
    phone: { w: 2, h: 4 },
    tiers: [
      { name: "count", minW: 2, minH: 2 },
      { name: "list", minW: 3, minH: 3 },
      { name: "detailed", minW: 6, minH: 4 },
    ],
    configSchema: noConfig,
    defaultConfig: {},
  },
  {
    id: "reminders",
    label: "Reminders",
    description: "Upcoming and overdue maintenance, most urgent first.",
    icon: "Clock",
    ...UPCOMING_LIMITS,
    tiers: UPCOMING_TIERS,
    configSchema: upcomingConfig,
    defaultConfig: { windowDays: 30, limit: 6 },
  },
  {
    id: "expiring-warranties",
    label: "Expiring Warranties",
    description: "Warranties running out soon.",
    icon: "ShieldAlert",
    ...UPCOMING_LIMITS,
    tiers: UPCOMING_TIERS,
    configSchema: upcomingConfig,
    defaultConfig: { windowDays: 60, limit: 6 },
  },
  {
    id: "spending-trend",
    label: "Spending Trend",
    description: "Spending this year against last, month by month.",
    icon: "TrendingUp",
    min: { w: 2, h: 2 },
    max: { w: 12, h: 6 },
    large: { w: 3, h: 4 },
    phone: { w: 2, h: 4 },
    // The chart needs three rows under the headline to read as a trend.
    tiers: [
      { name: "headline", minW: 2, minH: 2 },
      { name: "chart", minW: 3, minH: 3 },
      { name: "bars", minW: 6, minH: 4 },
    ],
    configSchema: spendingConfig,
    defaultConfig: { range: "ytd" },
  },
  {
    id: "spending-breakdown",
    label: "Spending Breakdown",
    description: "Where the money goes, by category.",
    icon: "ChartPie",
    min: { w: 2, h: 2 },
    max: { w: 12, h: 6 },
    large: { w: 4, h: 3 },
    phone: { w: 2, h: 3 },
    tiers: [
      { name: "top", minW: 2, minH: 2 },
      { name: "ranked", minW: 3, minH: 3 },
      { name: "composition", minW: 6, minH: 3 },
    ],
    configSchema: spendingConfig,
    defaultConfig: { range: "ytd" },
  },
]

const BY_ID = new Map(CARD_TYPES.map((d) => [d.id, d]))

export function cardType(id: string): CardTypeDef | undefined {
  return BY_ID.get(id)
}

const enabled = (d: CardTypeDef, f: Features): boolean => !d.requires || f[d.requires]

/** Card types the "+ Add card" picker offers. */
export function availableCardTypes(features: Features): CardTypeDef[] {
  return CARD_TYPES.filter((d) => enabled(d, features))
}

/** Size limits per card type, for validateLayout/repairLayout. */
export function limitsMap(): ReadonlyMap<string, CardLimits> {
  return new Map(CARD_TYPES.map((d) => [d.id, { min: d.min, max: d.max, default: d.large }]))
}

/** Index of the richest tier the size allows (0 when below the first). */
export function tierOf(def: CardTypeDef, size: Size): number {
  let tier = 0
  def.tiers.forEach((t, i) => {
    if (t.minW <= size.w && t.minH <= size.h) tier = i
  })
  return tier
}

// ---- Default layout ---------------------------------------------------------

// Today's dashboard on the 12-column grid. Top four rows: Properties and
// Vehicles as hero tiles (3 wide each), People over Equipment (4 wide), and a
// narrow column of Records, Active Warranties and Due (2 wide). Below, the four
// list cards side by side, 3 wide each. Card ids are the type ids: one of each.
type Slot = { type: string; x: number; y: number; w: number; h: number }

const DEFAULT_SLOTS: readonly Slot[] = [
  { type: "properties", x: 0, y: 0, w: 3, h: 4 },
  { type: "vehicles", x: 3, y: 0, w: 3, h: 4 },
  { type: "people", x: 6, y: 0, w: 4, h: 2 },
  { type: "equipment", x: 6, y: 2, w: 4, h: 2 },
  { type: "records", x: 10, y: 0, w: 2, h: 1 },
  { type: "active-warranties", x: 10, y: 1, w: 2, h: 1 },
  { type: "due-maintenance", x: 10, y: 2, w: 2, h: 2 },
  { type: "intake", x: 0, y: 4, w: 3, h: 4 },
  { type: "reminders", x: 3, y: 4, w: 3, h: 4 },
  { type: "expiring-warranties", x: 6, y: 4, w: 3, h: 4 },
  { type: "spending-trend", x: 9, y: 4, w: 3, h: 4 },
]

export function defaultLayout(features: Features): DashboardLayout {
  const slots = DEFAULT_SLOTS.filter((s) => {
    const d = cardType(s.type)
    return d !== undefined && enabled(d, features)
  })
  const hasPeople = slots.some((s) => s.type === "people")
  const cards: CardInstance[] = []
  const large: Placement[] = []
  for (const s of slots) {
    const def = cardType(s.type)!
    cards.push({ id: s.type, type: s.type, config: { ...def.defaultConfig } })
    // With Health off, Equipment has the column to itself, as it does today.
    const p = s.type === "equipment" && !hasPeople ? { ...s, y: 0, h: 4 } : s
    large.push({ id: s.type, x: p.x, y: p.y, w: p.w, h: p.h })
  }
  return { format: LAYOUT_FORMAT, cards, large, phone: null }
}
