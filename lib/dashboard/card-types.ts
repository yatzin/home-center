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

export type CardTier = Readonly<{ name: string; minW: number; minH: number }>
type FrozenSize = Readonly<Size>

/** The lucide-react icons card types may use (the client maps each name to its component). */
export const CARD_ICON_NAMES = [
  "Building2",
  "Car",
  "HeartPulse",
  "Refrigerator",
  "DoorOpen",
  "Wrench",
  "ShieldCheck",
  "Calendar",
  "Inbox",
  "Clock",
  "ShieldAlert",
  "TrendingUp",
  "ChartPie",
] as const
export type CardIconName = (typeof CARD_ICON_NAMES)[number]

/** What an item picker picks from: one asset type's items (ids and names come from the server). */
export type ConfigItemType = "PROPERTY" | "VEHICLE" | "EQUIPMENT" | "PERSON"

export type ChoiceOption = Readonly<{
  value: string
  label: string
  /** Offered only while this feature is on. */
  requires?: "health" | "rooms"
}>

/**
 * One control in a card's settings dialog, for one key of its configSchema.
 * `item`: pick one item of `itemType`, or all (unset). `number`: a whole
 * number in [min, max]. `choice`: one of `options`; with `allLabel` it may also
 * be unset ("all").
 */
export type ConfigField = Readonly<
  | { key: string; kind: "item"; label: string; help?: string; itemType: ConfigItemType; allLabel: string; noun: string }
  | {
      key: string
      kind: "number"
      label: string
      help?: string
      min: number
      max: number
      /** Used when the card's config has no value. */
      default: number
      /** Shown after the input: "days". */
      unit: string
      /** Not shown while this key is set (a limit means nothing for one item). */
      hiddenWhenSet?: string
    }
  | { key: string; kind: "choice"; label: string; help?: string; options: readonly ChoiceOption[]; allLabel?: string }
>

export type CardTypeDef = {
  id: string
  label: string
  description: string
  /** A lucide-react icon name. */
  icon: CardIconName
  /** The site feature this card belongs to; hidden everywhere when it is off. */
  requires?: "health" | "rooms"
  min: FrozenSize
  max: FrozenSize
  /** Size when added on the large grid (also its repair default). */
  large: FrozenSize
  /** Size when added on the phone grid. */
  phone: FrozenSize
  /** Ascending: each tier needs at least the previous one's width and height. */
  tiers: readonly CardTier[]
  configSchema: z.ZodType<Record<string, unknown>>
  defaultConfig: Readonly<Record<string, unknown>>
  /** The settings dialog's controls: one per configSchema key, in order ([] for none). */
  configFields: readonly ConfigField[]
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

/** `range` sets the period of the headline and totals only; the trend chart always spans 12 months. */
const spendingConfig = z.object({ range: z.enum(["ytd", "12m"]).optional() })

const noConfig = z.object({})

// ---- Config fields (the settings dialog) --------------------------------------

const LIMIT_RANGE = { min: 1, max: 50 } as const

const ASSET_TYPE_OPTIONS: readonly ChoiceOption[] = [
  { value: "PROPERTY", label: "Properties" },
  { value: "VEHICLE", label: "Vehicles" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "PERSON", label: "People", requires: "health" },
]

const RANGE_FIELD: ConfigField = {
  key: "range",
  kind: "choice",
  label: "Period",
  options: [
    { value: "ytd", label: "This year" },
    { value: "12m", label: "Last 12 months" },
  ],
}

function upcomingFields(windowLabel: string, windowDefault: number): ConfigField[] {
  return [
    { key: "windowDays", kind: "number", label: windowLabel, min: 1, max: 365, default: windowDefault, unit: "days" },
    { key: "assetType", kind: "choice", label: "Show", allLabel: "Everything", options: ASSET_TYPE_OPTIONS },
    { key: "limit", kind: "number", label: "List up to", ...LIMIT_RANGE, default: 6, unit: "items" },
  ]
}

type ItemSpec = { itemType: ConfigItemType; label: string; allLabel: string; noun: string; plural: string }

function assetFields(item: ItemSpec, limitDefault: number): ConfigField[] {
  return [
    { key: "itemId", kind: "item", label: item.label, itemType: item.itemType, allLabel: item.allLabel, noun: item.noun },
    {
      key: "limit",
      kind: "number",
      label: "Show up to",
      help: "Most recently active first.",
      ...LIMIT_RANGE,
      default: limitDefault,
      unit: item.plural,
      hiddenWhenSet: "itemId",
    },
  ]
}

function freezeFields(fields: readonly ConfigField[]): readonly ConfigField[] {
  return Object.freeze(
    fields.map((f) =>
      Object.freeze(
        f.kind === "choice" ? { ...f, options: Object.freeze(f.options.map((o) => Object.freeze({ ...o }))) } : { ...f },
      ),
    ),
  )
}

// ---- Shared size/tier shapes ------------------------------------------------

function size(w: number, h: number): FrozenSize {
  return Object.freeze({ w, h })
}

function freezeTiers(tiers: CardTier[]): readonly CardTier[] {
  return Object.freeze(tiers.map((t) => Object.freeze({ ...t })))
}

/** Deep-freezes a def's data (not its zod schema) so callers cannot mutate the catalog. */
function freezeDef(d: CardTypeDef): CardTypeDef {
  return Object.freeze({
    ...d,
    min: size(d.min.w, d.min.h),
    max: size(d.max.w, d.max.h),
    large: size(d.large.w, d.large.h),
    phone: size(d.phone.w, d.phone.h),
    tiers: Object.isFrozen(d.tiers) ? d.tiers : freezeTiers([...d.tiers]),
    defaultConfig: Object.freeze({ ...d.defaultConfig }),
    configFields: freezeFields(d.configFields),
  })
}

// Count alone fits a short tile; a photo strip needs ~a quarter of the page and
// two rows; a per-item list needs half the page and enough rows for 3+ items.
// Shared between card types, so frozen: an in-place clamp must not corrupt the catalog.
const ASSET_TIERS = freezeTiers([
  { name: "count", minW: 2, minH: 1 },
  { name: "thumbnails", minW: 3, minH: 2 },
  { name: "list", minW: 6, minH: 4 },
])
const ASSET_LIMITS = Object.freeze({ min: size(2, 1), max: size(12, 8) })

// Reminder-like lists: one headline item, a dated list, then (wide) grouped by
// urgency into overdue / soon / later columns.
const UPCOMING_TIERS = freezeTiers([
  { name: "next", minW: 2, minH: 2 },
  { name: "list", minW: 3, minH: 3 },
  { name: "grouped", minW: 6, minH: 4 },
])
const UPCOMING_LIMITS = Object.freeze({ min: size(2, 2), max: size(12, 8), large: size(3, 4), phone: size(2, 4) })

function asset(
  id: string,
  label: string,
  description: string,
  icon: CardIconName,
  large: Size,
  phone: Size,
  thumbnails: number,
  item: ItemSpec,
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
    configFields: assetFields(item, thumbnails),
  }
}

// ---- The catalog ------------------------------------------------------------

// Hero tiles (Properties, Vehicles) are 3x4 by default: tall enough for today's
// photo mosaic. People/Equipment/Rooms default to a 4x2 strip of thumbnails.
const DEFS: CardTypeDef[] = [
  asset("properties", "Properties", "Your homes and land, with recent photos.", "Building2", { w: 3, h: 4 }, { w: 2, h: 4 }, 7, {
    itemType: "PROPERTY",
    label: "Property",
    allLabel: "All properties",
    noun: "property",
    plural: "properties",
  }),
  asset("vehicles", "Vehicles", "Cars and other vehicles, with recent photos.", "Car", { w: 3, h: 4 }, { w: 2, h: 4 }, 7, {
    itemType: "VEHICLE",
    label: "Vehicle",
    allLabel: "All vehicles",
    noun: "vehicle",
    plural: "vehicles",
  }),
  asset(
    "people",
    "People",
    "Household members and their health records.",
    "HeartPulse",
    { w: 4, h: 2 },
    { w: 2, h: 2 },
    18,
    { itemType: "PERSON", label: "Person", allLabel: "Everyone", noun: "person", plural: "people" },
    "health",
  ),
  asset("equipment", "Equipment", "Appliances, tools and other equipment.", "Refrigerator", { w: 4, h: 2 }, { w: 2, h: 2 }, 18, {
    itemType: "EQUIPMENT",
    label: "Equipment",
    allLabel: "All equipment",
    noun: "item",
    plural: "items",
  }),
  {
    // Rooms belong to a property: its picker picks a property (all by
    // default), and the limit bounds the room names listed, for one property too.
    ...asset(
      "rooms",
      "Rooms",
      "Rooms across your properties.",
      "DoorOpen",
      { w: 4, h: 2 },
      { w: 2, h: 2 },
      18,
      { itemType: "PROPERTY", label: "Property", allLabel: "All properties", noun: "property", plural: "rooms" },
      "rooms",
    ),
    configFields: [
      {
        key: "itemId",
        kind: "item",
        label: "Property",
        help: "Show the rooms of one property.",
        itemType: "PROPERTY",
        allLabel: "All properties",
        noun: "property",
      },
      { key: "limit", kind: "number", label: "List up to", help: "Room names, at the largest size.", ...LIMIT_RANGE, default: 18, unit: "rooms" },
    ],
  },
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
    configFields: [],
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
    configFields: [],
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
    configFields: [],
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
    configFields: [],
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
    configFields: upcomingFields("Look ahead", 30),
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
    configFields: upcomingFields("Expiring within", 60),
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
    configFields: [{ ...RANGE_FIELD, help: "Sets the total and the comparison. The chart always shows the last 12 months." }],
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
    configFields: [RANGE_FIELD],
  },
]

export const CARD_TYPES: readonly CardTypeDef[] = Object.freeze(DEFS.map(freezeDef))

const BY_ID = new Map(CARD_TYPES.map((d) => [d.id, d]))

export function cardType(id: string): CardTypeDef | undefined {
  return BY_ID.get(id)
}

const enabled = (d: CardTypeDef, f: Features): boolean => !d.requires || f[d.requires]

/** Card types the "+ Add card" picker offers. */
export function availableCardTypes(features: Features): CardTypeDef[] {
  return CARD_TYPES.filter((d) => enabled(d, features))
}

const NO_FIELDS: readonly ConfigField[] = Object.freeze([])

/** The settings dialog's controls for a card type; [] when it has no settings (or is unknown). */
export function configFieldsFor(typeId: string): readonly ConfigField[] {
  return cardType(typeId)?.configFields ?? NO_FIELDS
}

// ---- Picker groups ------------------------------------------------------------

/** How the "+ Add card" picker groups the catalog, in order. */
export const CARD_GROUPS: readonly Readonly<{ label: string; types: readonly string[] }>[] = Object.freeze([
  Object.freeze({ label: "Assets", types: Object.freeze(["properties", "vehicles", "people", "equipment", "rooms"]) }),
  Object.freeze({
    label: "Maintenance & warranties",
    types: Object.freeze(["reminders", "due-maintenance", "records", "expiring-warranties", "active-warranties"]),
  }),
  Object.freeze({ label: "Money", types: Object.freeze(["spending-trend", "spending-breakdown"]) }),
  Object.freeze({ label: "Inbox", types: Object.freeze(["intake"]) }),
])

export type CardGroup = { label: string; types: CardTypeDef[] }

/**
 * `types` grouped for the picker: CARD_GROUPS order, catalog order within a
 * group (the order of `types`), empty groups left out, and any type no group
 * names in a final "Other".
 */
export function groupCardTypes(types: readonly CardTypeDef[]): CardGroup[] {
  const grouped = new Set(CARD_GROUPS.flatMap((g) => g.types))
  const groups: CardGroup[] = CARD_GROUPS.map((g) => ({ label: g.label, types: types.filter((t) => g.types.includes(t.id)) }))
  groups.push({ label: "Other", types: types.filter((t) => !grouped.has(t.id)) })
  return groups.filter((g) => g.types.length > 0)
}

/**
 * An error message for the first card whose config its type's configSchema
 * rejects, or null. Cards of unknown types are left to validateLayout.
 */
export function invalidCardConfig(layout: DashboardLayout): string | null {
  for (const c of layout.cards) {
    const def = cardType(c.type)
    if (def && !def.configSchema.safeParse(c.config).success) return `The ${def.label} card's settings are not valid.`
  }
  return null
}

/** Size limits per card type, for validateLayout/repairLayout. */
export function limitsMap(): ReadonlyMap<string, CardLimits> {
  return new Map(CARD_TYPES.map((d) => [d.id, { min: d.min, max: d.max, default: d.large }]))
}

/**
 * Large-grid columns one phone column counts as for tier selection. A
 * full-width (2-column) phone card is ~360px, comparable to ~4 large columns.
 */
export const PHONE_WIDTH_SCALE = 2

/**
 * Index of the richest tier the size allows (0 when below the first). Tier
 * minimums are in large-grid units; in phone mode the width is scaled by
 * PHONE_WIDTH_SCALE first (height is unchanged: rows are the same height).
 */
export function tierOf(def: CardTypeDef, size: Size, mode: "large" | "phone" = "large"): number {
  const w = mode === "phone" ? size.w * PHONE_WIDTH_SCALE : size.w
  let tier = 0
  def.tiers.forEach((t, i) => {
    if (t.minW <= w && t.minH <= size.h) tier = i
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
  const people = slots.find((s) => s.type === "people")
  // People's slot, when People is off, so Equipment can take the whole column.
  const freed = DEFAULT_SLOTS.find((s) => s.type === "people")!
  const cards: CardInstance[] = []
  const large: Placement[] = []
  for (const s of slots) {
    const def = cardType(s.type)!
    cards.push({ id: s.type, type: s.type, config: { ...def.defaultConfig } })
    // With Health off, Equipment has the column to itself, as it does today.
    const p = s.type === "equipment" && !people ? { ...s, y: freed.y, h: freed.h + s.h } : s
    large.push({ id: s.type, x: p.x, y: p.y, w: p.w, h: p.h })
  }
  return { format: LAYOUT_FORMAT, cards, large, phone: null }
}
