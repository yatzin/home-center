// The dashboard's card catalog: what each card type is, how big it may be, and
// what it shows at each size. Pure TS (no React/Prisma), so the server, the
// editor and the tests share one source of truth.
//
// Sizes are grid units: the large grid is LARGE_COLS (12) wide with ~88px rows;
// the phone grid is PHONE_COLS (2) wide, and phones use one full-width column.
// Tiers say what a card reveals as it grows ("size is a lens"); each tier's
// minimums are in large-grid units, and the first tier is the card's minimum.
// Asset cards also have avatar looks for long, thin sizes (lib/dashboard/
// avatar-layout.ts), picked by shape rather than by size order; the dated-item
// lists have looks for their smaller sizes (lib/dashboard/dated-list-layout.ts).
import { z } from "zod"
import type { Features } from "@/lib/features"
import { assetLook, type AssetLook } from "./avatar-layout"
import { datedLook, type DatedLook } from "./dated-list-layout"
import { LAYOUT_FORMAT, type CardInstance, type CardLimits, type DashboardLayout, type Placement } from "./layout"
import { PHONE_COLS, type Size } from "./grid"
import { plannedConfigSchema } from "./planned-spend"
import { lifeConfigSchema } from "./equipment-life-card"
import { heatConfigSchema, observationHeatConfigSchema } from "./activity-heatmap"
import { TEXT_DEFAULTS, TEXT_MAX, textConfigSchema } from "./text-card"
import { CLOCK_DEFAULTS, clockConfigSchema } from "./clock"

export type CardTier = Readonly<{
  name: string
  minW: number
  minH: number
  /**
   * A look picked by shape rather than by size order: an avatar look (asset
   * cards: assetLook of the raw size) or a dated-list look (datedLook of the
   * size, phone width scaled). This tier is picked when the card's look
   * function gives this look, whatever its minimums; minW/minH are then just
   * the smallest size that has the look. Look tiers come first, and a type's
   * looks all come from one of the two functions.
   */
  look?: TierLook
}>
export type TierLook = Exclude<AssetLook, "rich"> | Exclude<DatedLook, "rich">

const DATED_LOOKS: ReadonlySet<string> = new Set<Exclude<DatedLook, "rich">>(["carousel", "headline", "slim", "condensed", "full"])
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
  "Type",
  "CalendarClock",
  "CalendarRange",
  "Hourglass",
  "CalendarDays",
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
 * be unset ("all"). `text`: multi-line plain text, at most `maxLength`
 * characters, kept as typed (with `tokens`, the dialog adds the Text card's
 * token help). `toggle`: on or off.
 */
export type ConfigField = Readonly<
  | { key: string; kind: "item"; label: string; help?: string; itemType: ConfigItemType; allLabel: string; noun: string }
  // One asset of any of these types, stored as "TYPE:id" (lib/dashboard/asset-pick.ts); unset is everything.
  | { key: string; kind: "asset"; label: string; help?: string; itemTypes: readonly ConfigItemType[]; allLabel: string; noun: string }
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
      /** Shown only while the choice at `key` has this value ("Last X months" on a period choice). */
      showWhen?: { key: string; value: string }
    }
  | { key: string; kind: "choice"; label: string; help?: string; options: readonly ChoiceOption[]; allLabel?: string }
  | {
      key: string
      kind: "text"
      label: string
      help?: string
      maxLength: number
      /** Visible lines of the textarea. */
      rows: number
      default: string
      /** Offer the {token} help, chips and preview (lib/dashboard/text-template.ts). */
      tokens?: boolean
    }
  | { key: string; kind: "toggle"; label: string; help?: string; default: boolean }
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

/** `range` sets the period: this year, or the last `months` (1 to 60) calendar months. The trend chart shows those months (12 for this year). "12m" is an older config's last 12 months. */
const spendingConfig = z.object({
  range: z.enum(["ytd", "12m", "months"]).optional(),
  months: z.number().int().min(1).max(60).optional(),
})

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
    { value: "months", label: "Last X months" },
  ],
}

/** The month count that goes with RANGE_FIELD's "Last X months". */
const SPEND_MONTHS_FIELD: ConfigField = {
  key: "months",
  kind: "number",
  label: "Months",
  help: "How many months back, ending with this one.",
  min: 1,
  max: 60,
  default: 12,
  unit: "months",
  showWhen: { key: "range", value: "months" },
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

/** Keeps the tiers' literal looks (ASSET_TIERS[i].look is an avatar look, not any look). */
function freezeTiers<T extends CardTier>(tiers: T[]): readonly T[] {
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

// Asset cards (Properties, Vehicles, Equipment, People). Long, thin sizes show
// avatars only (assetLook): one cell a single avatar, one row a row of them
// (pills with names when there is room), one column a column of them, two
// columns a column of name pills. From 3 columns and 2 rows: a photo mosaic,
// then (half the page, enough rows for 3+ items) a per-item list.
// Shared between card types, so frozen: an in-place clamp must not corrupt the catalog.
export const ASSET_TIERS = freezeTiers([
  { name: "single", minW: 1, minH: 1, look: "single" },
  { name: "column-circles", minW: 1, minH: 2, look: "column-circles" },
  { name: "row", minW: 2, minH: 1, look: "row" },
  { name: "column-pills", minW: 2, minH: 2, look: "column-pills" },
  { name: "thumbnails", minW: 3, minH: 2 },
  { name: "list", minW: 6, minH: 4 },
])
const ASSET_LIMITS = Object.freeze({ min: size(1, 1), max: size(12, 8) })

// Rooms: count alone fits a short tile; property thumbnails need ~a quarter of
// the page and two rows; the room names need half the page and 4 rows.
const ROOM_TIERS = freezeTiers([
  { name: "count", minW: 2, minH: 1 },
  { name: "thumbnails", minW: 3, minH: 2 },
  { name: "list", minW: 6, minH: 4 },
])

// Dated-item lists (Records, Active Warranties, Due Maintenance, Reminders,
// Expiring Warranties) below their rich sizes (datedLook): one row a rotating
// carousel of the items, two rows a headline item with compact rows under it,
// and from three rows a list whose density follows the width (slim at 2
// columns, condensed at 3, full rows at 4-5). From 6 columns and 3 rows, the
// card's own sized tiers, as before.
function datedTiers(sized: CardTier[]): readonly CardTier[] {
  return freezeTiers([
    { name: "carousel", minW: 2, minH: 1, look: "carousel" },
    { name: "headline", minW: 2, minH: 2, look: "headline" },
    { name: "slim", minW: 2, minH: 3, look: "slim" },
    { name: "condensed", minW: 3, minH: 3, look: "condensed" },
    { name: "full", minW: 4, minH: 3, look: "full" },
    ...sized,
  ])
}

// Reminder-like lists, at their rich sizes: the dated list, then (wide and
// tall) grouped (Reminders by urgency, Expiring Warranties by month). One row
// is their minimum: the carousel.
const UPCOMING_TIERS = datedTiers([
  { name: "list", minW: 3, minH: 3 },
  { name: "grouped", minW: 6, minH: 4 },
])
const UPCOMING_LIMITS = Object.freeze({ min: size(2, 1), max: size(12, 8), large: size(3, 4), phone: size(2, 4) })

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
    // Not an avatar card: a count is its smallest useful size.
    min: size(2, 1),
    tiers: ROOM_TIERS,
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
    tiers: datedTiers([{ name: "list", minW: 6, minH: 3 }]),
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
    tiers: datedTiers([{ name: "list", minW: 6, minH: 3 }]),
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
    // Two rows by default: the most urgent item, with compact rows under it.
    large: { w: 2, h: 2 },
    phone: { w: 2, h: 2 },
    // Its list showed from 4 columns before the looks; datedLook keeps full
    // rows up to 5, so the list tier itself is reached from 6.
    tiers: datedTiers([{ name: "list", minW: 4, minH: 3 }]),
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
    // The chart needs four rows (three under the headline) to read as a trend.
    tiers: [
      { name: "headline", minW: 2, minH: 2 },
      { name: "chart", minW: 3, minH: 4 },
      { name: "bars", minW: 6, minH: 4 },
    ],
    configSchema: spendingConfig,
    defaultConfig: { range: "ytd" },
    configFields: [{ ...RANGE_FIELD, help: "Sets the total, the comparison and the months the chart shows (12 for this year)." }, SPEND_MONTHS_FIELD],
  },
  {
    id: "spending-breakdown",
    label: "Spending Breakdown",
    description: "Where the money goes, by category.",
    icon: "ChartPie",
    min: { w: 1, h: 1 },
    max: { w: 12, h: 6 },
    large: { w: 4, h: 3 },
    phone: { w: 2, h: 3 },
    tiers: [
      // 1x1: the top category alone. Anything bigger shows every category, condensed:
      { name: "top", minW: 1, minH: 1 },
      // one row tall, two or more wide: one bar split by share, labelled inside;
      { name: "slices", minW: 2, minH: 1 },
      // narrower or shorter than the ranked look: a row per category with its bar behind its text.
      // (Beside "slices" rather than above it: one column wide, two rows tall.)
      { name: "rows", minW: 1, minH: 2 },
      // Four columns and three rows: the full ranked bars.
      { name: "ranked", minW: 4, minH: 3 },
      { name: "composition", minW: 6, minH: 3 },
    ],
    configSchema: spendingConfig,
    defaultConfig: { range: "ytd" },
    configFields: [RANGE_FIELD, SPEND_MONTHS_FIELD],
  },
  {
    // What is coming, forward-looking: the Costs page's planned spend (reminders
    // with an estimated cost) over the next 6 or 12 months. A number at the
    // smallest sizes, then bars by month, stacked by asset type, then the
    // biggest items (lib/dashboard/planned-spend.ts decides what the room earns).
    id: "planned-spend",
    label: "Planned Spend",
    description: "What is coming up and when, from your reminders' estimated costs.",
    icon: "CalendarRange",
    min: { w: 1, h: 1 },
    max: { w: 12, h: 6 },
    large: { w: 4, h: 3 },
    phone: { w: 2, h: 3 },
    tiers: [
      { name: "number", minW: 1, minH: 1 },
      { name: "strip", minW: 2, minH: 1 },
      { name: "bars", minW: 2, minH: 2 },
      { name: "stacked", minW: 3, minH: 3 },
      { name: "list", minW: 3, minH: 4 },
      { name: "split", minW: 6, minH: 4 },
    ],
    configSchema: plannedConfigSchema,
    defaultConfig: { months: 12 },
    configFields: [
      {
        key: "months",
        kind: "number",
        label: "Look ahead",
        help: "The Costs page shows 12 months.",
        min: 1,
        max: 24,
        default: 12,
        unit: "months",
      },
    ],
  },
  {
    // How worn out the equipment is: each item's age against its expected life
    // (lib/dashboard/equipment-life-card.ts). A count at the smallest sizes,
    // then a status bar, then one bullet bar per item (the end of life is the
    // marker; past it, the bar runs on), then the cost of replacing what is
    // nearing the end. Equipment without an expected life or a start date is
    // left out and counted.
    id: "equipment-life",
    label: "Equipment Life",
    description: "How old your equipment is against how long it should last.",
    icon: "Hourglass",
    min: { w: 1, h: 1 },
    max: { w: 12, h: 8 },
    large: { w: 4, h: 3 },
    phone: { w: 2, h: 3 },
    tiers: [
      { name: "number", minW: 1, minH: 1 },
      { name: "strip", minW: 2, minH: 1 },
      { name: "bullets", minW: 2, minH: 2 },
      { name: "detailed", minW: 3, minH: 3 },
      { name: "wide", minW: 6, minH: 3 },
    ],
    configSchema: lifeConfigSchema,
    defaultConfig: { show: "all" },
    configFields: [
      {
        key: "show",
        kind: "choice",
        label: "Show",
        help: "Equipment needs an install or purchase date and an expected life to appear.",
        options: [
          { value: "all", label: "All equipment" },
          { value: "attention", label: "Only what is nearing the end" },
        ],
      },
    ],
  },
  {
    // When service happened: a calendar of the last 6 or 12 months, a square a
    // day, darker the more records (lib/dashboard/activity-heatmap.ts). A count
    // at the smallest sizes, then a small recent calendar, then the whole
    // range with month and weekday labels, then the numbers behind it.
    id: "activity",
    label: "Service Activity",
    description: "A calendar of the days service was recorded, to see the rhythm of the year.",
    icon: "CalendarDays",
    min: { w: 1, h: 1 },
    max: { w: 12, h: 6 },
    large: { w: 6, h: 3 },
    phone: { w: 2, h: 3 },
    tiers: [
      { name: "number", minW: 1, minH: 1 },
      // One row tall, two or more columns wide: the calendar fills the whole card.
      { name: "flat", minW: 2, minH: 1 },
      // One column wide and at least two rows tall: the calendar turned to run down the card, filling it.
      { name: "column", minW: 1, minH: 2 },
      { name: "calendar", minW: 2, minH: 2 },
      { name: "labeled", minW: 4, minH: 3 },
      { name: "insights", minW: 6, minH: 3 },
    ],
    configSchema: heatConfigSchema,
    defaultConfig: { months: 12 },
    configFields: [
      {
        key: "asset",
        kind: "asset",
        label: "Asset",
        help: "Count the records of one property, vehicle or piece of equipment. People's visits have their own card.",
        itemTypes: ["PROPERTY", "VEHICLE", "EQUIPMENT"],
        allLabel: "Everything",
        noun: "asset",
      },
      {
        key: "months",
        kind: "number",
        label: "Period",
        help: "Counts service records by the day they are dated, for this many months back.",
        min: 1,
        max: 36,
        default: 12,
        unit: "months",
      },
    ],
  },
  {
    // The Activity calendar for people's visits and expenses (their service
    // records), for everyone or one person. Same looks as Activity.
    id: "visits-heatmap",
    label: "Health Visits & Expenses",
    description: "A calendar of the days health visits and expenses were recorded, for everyone or one person.",
    icon: "CalendarDays",
    requires: "health",
    min: { w: 1, h: 1 },
    max: { w: 12, h: 6 },
    large: { w: 6, h: 3 },
    phone: { w: 2, h: 3 },
    tiers: [
      { name: "number", minW: 1, minH: 1 },
      // One row tall, two or more columns wide: the calendar fills the whole card.
      { name: "flat", minW: 2, minH: 1 },
      // One column wide and at least two rows tall: the calendar turned to run down the card, filling it.
      { name: "column", minW: 1, minH: 2 },
      { name: "calendar", minW: 2, minH: 2 },
      { name: "labeled", minW: 4, minH: 3 },
      { name: "insights", minW: 6, minH: 3 },
    ],
    configSchema: observationHeatConfigSchema,
    defaultConfig: { months: 12 },
    configFields: [
      {
        key: "itemId",
        kind: "item",
        label: "Person",
        help: "Count the visits of one person.",
        itemType: "PERSON",
        allLabel: "All people",
        noun: "person",
      },
      {
        key: "months",
        kind: "number",
        label: "Period",
        help: "Counts visits by the day they are dated, for this many months back.",
        min: 1,
        max: 36,
        default: 12,
        unit: "months",
      },
    ],
  },
  {
    // The Activity calendar for health observations (what was noticed about a
    // person, and when), for everyone or one person. Same looks as Activity.
    id: "observations-heatmap",
    label: "Health Observations",
    description: "A calendar of the days health observations were logged, for everyone or one person.",
    icon: "CalendarDays",
    requires: "health",
    min: { w: 1, h: 1 },
    max: { w: 12, h: 6 },
    large: { w: 6, h: 3 },
    phone: { w: 2, h: 3 },
    tiers: [
      { name: "number", minW: 1, minH: 1 },
      // One row tall, two or more columns wide: the calendar fills the whole card.
      { name: "flat", minW: 2, minH: 1 },
      // One column wide and at least two rows tall: the calendar turned to run down the card, filling it.
      { name: "column", minW: 1, minH: 2 },
      { name: "calendar", minW: 2, minH: 2 },
      { name: "labeled", minW: 4, minH: 3 },
      { name: "insights", minW: 6, minH: 3 },
    ],
    configSchema: observationHeatConfigSchema,
    defaultConfig: { months: 12 },
    configFields: [
      {
        key: "itemId",
        kind: "item",
        label: "Person",
        help: "Count the observations of one person.",
        itemType: "PERSON",
        allLabel: "All people",
        noun: "person",
      },
      {
        key: "months",
        kind: "number",
        label: "Period",
        help: "Counts observations by the day they happened, for this many months back.",
        min: 1,
        max: 36,
        default: 12,
        unit: "months",
      },
    ],
  },
  {
    // Not backed by a list: its loader resolves only the {tokens} its text uses.
    // One look at every size; the view fits the text to the card.
    id: "text",
    label: "Text",
    description: "Free text with live values like your name or today's date.",
    icon: "Type",
    min: { w: 1, h: 1 },
    max: { w: 12, h: 4 },
    large: { w: 4, h: 1 },
    phone: { w: 2, h: 1 },
    tiers: [{ name: "text", minW: 1, minH: 1 }],
    configSchema: textConfigSchema,
    defaultConfig: { ...TEXT_DEFAULTS },
    configFields: [
      {
        key: "text",
        kind: "text",
        label: "Text",
        help: "Plain text. Line breaks are kept.",
        maxLength: TEXT_MAX,
        rows: 4,
        default: TEXT_DEFAULTS.text,
        tokens: true,
      },
      {
        key: "style",
        kind: "choice",
        label: "Style",
        options: [
          { value: "h1", label: "Heading 1" },
          { value: "h2", label: "Heading 2" },
          { value: "h3", label: "Heading 3" },
          { value: "h4", label: "Heading 4" },
          { value: "body", label: "Body" },
          { value: "small", label: "Small" },
          { value: "muted", label: "Muted" },
        ],
      },
      {
        key: "align",
        kind: "choice",
        label: "Align",
        options: [
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ],
      },
      {
        key: "border",
        kind: "toggle",
        label: "Border",
        help: "Off: no card around the text; it sits on the page.",
        default: TEXT_DEFAULTS.border,
      },
    ],
  },
  {
    // Not backed by data: the time is the viewer's device time, formatted by
    // Settings > Regional (12 or 24 hour, date format), so the card offers no
    // format of its own. It carries the "Edit dashboard" button for admins.
    // Its looks (lib/dashboard/clock-layout.ts): the time alone in one column,
    // the time over the date from two, an analog face from two rows.
    id: "clock",
    label: "Clock",
    description: "The time and date, with the Edit dashboard button.",
    icon: "CalendarClock",
    min: { w: 1, h: 1 },
    max: { w: 4, h: 4 },
    large: { w: 2, h: 1 },
    phone: { w: 2, h: 1 },
    tiers: [
      { name: "time", minW: 1, minH: 1 },
      { name: "standard", minW: 2, minH: 1 },
      { name: "face", minW: 2, minH: 2 },
    ],
    configSchema: clockConfigSchema,
    defaultConfig: { ...CLOCK_DEFAULTS },
    configFields: [
      {
        key: "showSeconds",
        kind: "toggle",
        label: "Show seconds",
        help: "Time format (12 or 24 hour) and date format follow Settings > Regional.",
        default: CLOCK_DEFAULTS.showSeconds,
      },
      { key: "showDate", kind: "toggle", label: "Show the date", help: "Under the time.", default: CLOCK_DEFAULTS.showDate },
      {
        key: "face",
        kind: "choice",
        label: "Clock face",
        help: "Automatic shows the analog face once the card is two rows tall.",
        options: [
          { value: "auto", label: "Automatic" },
          { value: "always", label: "Whenever it fits" },
          { value: "never", label: "Never (digital only)" },
        ],
      },
    ],
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
  // First: the cards people reach for to label or introduce the rest, and the clock beside them.
  Object.freeze({ label: "Text & time", types: Object.freeze(["text", "clock"]) }),
  Object.freeze({ label: "Assets", types: Object.freeze(["properties", "vehicles", "people", "equipment", "rooms", "equipment-life"]) }),
  Object.freeze({
    label: "Maintenance & warranties",
    types: Object.freeze(["reminders", "due-maintenance", "records", "expiring-warranties", "active-warranties", "activity"]),
  }),
  Object.freeze({ label: "Money", types: Object.freeze(["spending-trend", "spending-breakdown", "planned-spend"]) }),
  Object.freeze({ label: "Health", types: Object.freeze(["visits-heatmap", "observations-heatmap"]) }),
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

/**
 * The layout with each known card's config replaced by what its configSchema
 * parsed (unknown keys dropped). Call after invalidCardConfig returned null;
 * a config that does not parse is left as it is. Does not mutate the input.
 */
export function normalizeCardConfigs(layout: DashboardLayout): DashboardLayout {
  return {
    ...layout,
    cards: layout.cards.map((c) => {
      const parsed = cardType(c.type)?.configSchema.safeParse(c.config)
      return parsed?.success ? { ...c, config: parsed.data as Record<string, unknown> } : c
    }),
  }
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
 * Index of the tier a card shows at `size` in the given layout.
 *
 * A type with looks first asks its look function: assetLook (asset cards)
 * with the raw size (no phone scaling: a 2-wide phone card is 2 wide, and its
 * avatars are sized in cells), datedLook (the dated lists) with the width
 * scaled like any sized tier (their looks are text densities, which follow the
 * card's real width: a full-width phone card has room for full rows). A look
 * other than "rich" picks that look's tier.
 *
 * Otherwise, the richest sized tier the size allows (the first sized tier
 * when below it). Tier minimums are in large-grid units; in phone mode the
 * width is scaled by PHONE_WIDTH_SCALE first (height is unchanged: rows are
 * the same height).
 */
export function tierOf(def: CardTypeDef, size: Size, mode: "large" | "phone" = "large"): number {
  const w = mode === "phone" ? size.w * PHONE_WIDTH_SCALE : size.w
  const first = def.tiers.find((t) => t.look)?.look
  if (first) {
    const look = DATED_LOOKS.has(first) ? datedLook({ w, h: size.h }) : assetLook(size)
    const i = look === "rich" ? -1 : def.tiers.findIndex((t) => t.look === look)
    if (i >= 0) return i
  }
  let tier = -1
  def.tiers.forEach((t, i) => {
    if (!t.look && (tier < 0 || (t.minW <= w && t.minH <= size.h))) tier = i
  })
  return Math.max(0, tier)
}

export type PhoneSizePreset = { name: "Small" | "Medium" | "Large"; w: number; h: number }

/**
 * The size choices a card offers in phone editing, smallest first (at least
 * one, no two alike). Small is its smallest readable size (its minimum height,
 * and half width when the type may be one column wide); Medium is its phone
 * default at full width (a little taller than Small when the default is the
 * minimum); Large is half again taller. All within the type's limits and
 * PHONE_COLS: the reducer applies the type's limits to the phone grid as-is,
 * so a minimum wider than the phone grid means full width.
 */
export function phoneSizePresets(def: CardTypeDef): PhoneSizePreset[] {
  const minW = Math.min(def.min.w, PHONE_COLS)
  const maxW = Math.max(minW, Math.min(def.max.w, PHONE_COLS))
  const minH = def.min.h
  const maxH = Math.max(minH, def.max.h)
  const clampH = (h: number) => Math.min(Math.max(h, minH), maxH)

  const small: PhoneSizePreset = { name: "Small", w: minW, h: minH }
  let medium: PhoneSizePreset = { name: "Medium", w: maxW, h: clampH(def.phone.h) }
  if (medium.w === small.w && medium.h === small.h) medium = { ...medium, h: clampH(medium.h + 1) }
  const large: PhoneSizePreset = { name: "Large", w: maxW, h: clampH(Math.max(medium.h + 2, Math.ceil(medium.h * 1.5))) }

  // Small is never bigger than Medium in either direction, nor Large smaller:
  // a preset that matches Medium's size gives way to it.
  const area = (p: PhoneSizePreset) => p.w * p.h
  return [
    ...(area(small) < area(medium) ? [small] : []),
    medium,
    ...(area(large) > area(medium) ? [large] : []),
  ]
}

// ---- Default layout ---------------------------------------------------------

// The default dashboard on the 12-column grid. First row: the greeting, a
// borderless H1 Text card (it replaced the page's own header), and the Clock
// in the top-right two cells. Next four rows: Properties and Vehicles as hero
// tiles (3 wide each), People over Equipment (4 wide), and a narrow column on
// the right of Service Activity (a flat calendar), Records and the Spending
// Breakdown. Below: Intake and Reminders, Planned Spend over Expiring
// Warranties, and Spending Trend. Card ids are the type ids (one of each),
// except the greeting's. The phone layout is derived from this.
type Slot = { type: string; x: number; y: number; w: number; h: number; id?: string; config?: Record<string, unknown> }

/** The default greeting: what the page header used to say, now a card the admin can edit or remove. */
const GREETING_CONFIG = Object.freeze({ text: "Welcome back, {user}", style: "h1", align: "left", border: false })

const DEFAULT_SLOTS: readonly Slot[] = [
  { type: "text", id: "greeting", config: GREETING_CONFIG, x: 0, y: 0, w: 10, h: 1 },
  { type: "clock", x: 10, y: 0, w: 2, h: 1 },
  { type: "properties", x: 0, y: 1, w: 3, h: 4 },
  { type: "vehicles", x: 3, y: 1, w: 3, h: 4 },
  { type: "people", x: 6, y: 1, w: 4, h: 2 },
  { type: "equipment", x: 6, y: 3, w: 4, h: 2 },
  { type: "records", x: 10, y: 2, w: 2, h: 1 },
  { type: "intake", x: 0, y: 5, w: 3, h: 4 },
  { type: "reminders", x: 3, y: 5, w: 3, h: 4 },
  { type: "expiring-warranties", x: 6, y: 7, w: 3, h: 2 },
  { type: "spending-trend", x: 9, y: 5, w: 3, h: 4 },
  { type: "activity", x: 10, y: 1, w: 2, h: 1 },
  { type: "spending-breakdown", x: 10, y: 3, w: 2, h: 2, config: { range: "months", months: 12 } },
  { type: "planned-spend", x: 6, y: 5, w: 3, h: 2 },
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
    const id = s.id ?? s.type
    cards.push({ id, type: s.type, config: { ...(s.config ?? def.defaultConfig) } })
    // With Health off, Equipment has the column to itself, as it does today.
    const p = s.type === "equipment" && !people ? { ...s, y: freed.y, h: freed.h + s.h } : s
    large.push({ id, x: p.x, y: p.y, w: p.w, h: p.h })
  }
  return { format: LAYOUT_FORMAT, cards, large, phone: null }
}
