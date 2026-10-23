// Per-card data loaders (server only). Each placed card instance runs its own
// loader, so card types that are not on the dashboard cost nothing. A loader
// returns plain, serializable data for its client view; a throw is caught by
// the caller and shown as that one card's error state.
import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { ownedWhere, type Features } from "@/lib/features"
import type { Formatter } from "@/lib/regional"
import { loadActivityIndex, mostRecentlyActive } from "@/lib/asset-activity"
import { loadAssetIndex } from "@/lib/assets-server"
import { assetHref } from "@/lib/assets"
import { dueCandidateFilter } from "@/lib/maintenance-due"
import { loadVehicleMileage } from "@/lib/maintenance-due-server"
import type { AssetType } from "@/app/generated/prisma/client"
import { listInboxItems } from "@/lib/inbox-server"
import { inboxReadiness, type InboxReadiness } from "@/lib/inbox-form"
import { intakeSummary } from "@/lib/intake-ui"
import { headlineOf } from "@/components/dashboard/intake-card"
import { loadCostRecords } from "@/lib/costs-server"
import { categoryColor, categoryLabel, cents, type BucketPoint, type CategoryKey } from "@/lib/costs"
import {
  categoryCounts,
  monthlyAverage,
  spendingByCategory,
  spendingSummary,
  spendRangeOf,
  spendTrend,
  type SpendRange,
} from "./spending"
import type { MaintenanceSchedule, MeterUnit } from "@/app/generated/prisma/client"
import {
  dueLabel,
  dueMaintenance,
  expiringWarranties,
  monthKeyOf,
  roomGroups,
  urgencyOf,
  urgentMaintenance,
  type PropertyRooms,
  type Urgency,
} from "./shaping"

export type LoaderContext = { now: Date; features: Features; fmt: Formatter }
export type CardLoader = (config: Record<string, unknown>, ctx: LoaderContext) => Promise<unknown>

export type CardResult =
  | { id: string; type: string; config: Record<string, unknown>; status: "ok"; data: unknown }
  | { id: string; type: string; config: Record<string, unknown>; status: "error" }

// Several cards (and several instances of one) share these per request.
const activityIndex = cache(loadActivityIndex)
const assetIndex = cache(loadAssetIndex)
// Every Spending card (any number of either type) reads the same rows once.
const costRecords = cache(() => loadCostRecords())

const DEFAULT_LIMIT = 7
const LIST_LENGTH = 8

function configLimit(config: Record<string, unknown>): number {
  const n = config.limit
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? Math.min(n, 50) : DEFAULT_LIMIT
}

function configItemId(config: Record<string, unknown>): string | null {
  return typeof config.itemId === "string" && config.itemId.length > 0 ? config.itemId : null
}

// ---- Asset cards ----------------------------------------------------------------

/** One asset on an asset card (Properties, Vehicles, Equipment, People). */
export type AssetCardItem = {
  id: string
  name: string
  /** One line under the name (a property's address). */
  detail: string
  /** Short facts for the list tier, already formatted: "House · Built 1998 · 2,100 ft²". */
  facts: string
  imageFilename: string | null
}

/**
 * `missing`: the configured item (config.itemId) was deleted. Otherwise up to
 * config.limit items, most recently active first, out of `total`; `single`
 * when the card is filtered to one item.
 */
export type AssetCardData =
  | { missing: true }
  | { missing: false; total: number; single: boolean; items: AssetCardItem[] }

type AssetRow = { id: string; name: string; imageFilename: string | null; updatedAt: Date }

/**
 * Builds the loader for one asset type. `fetch` returns every row (or just the
 * one for config.itemId); `describe` gives the lines under each name.
 */
function assetLoader<R extends AssetRow>(
  assetType: AssetType,
  fetch: (itemId: string | null) => Promise<R[]>,
  describe: (row: R, fmt: Formatter) => { detail: string; facts: string },
): CardLoader {
  return async (config, { fmt }): Promise<AssetCardData> => {
    const itemId = configItemId(config)
    const [rows, activity] = await Promise.all([fetch(itemId), activityIndex()])
    if (itemId && rows.length === 0) return { missing: true }

    const byId = new Map(rows.map((r) => [r.id, r]))
    const items = mostRecentlyActive(rows, assetType, activity, configLimit(config)).map(({ assetId }) => {
      const r = byId.get(assetId)!
      return { id: r.id, name: r.name, imageFilename: r.imageFilename, ...describe(r, fmt) }
    })
    return { missing: false, total: rows.length, single: itemId !== null, items }
  }
}

const idFilter = (itemId: string | null) => (itemId ? { id: itemId } : undefined)

const humanize = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ")

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  HOUSE: "House",
  CONDO: "Condo",
  TOWNHOUSE: "Townhouse",
  LOT: "Lot",
  OTHER: "Other",
}

const loadProperties = assetLoader(
  "PROPERTY",
  (itemId) =>
    prisma.property.findMany({
      where: idFilter(itemId),
      select: { id: true, name: true, address: true, type: true, yearBuilt: true, sqFt: true, imageFilename: true, updatedAt: true },
    }),
  (r, fmt) => ({
    detail: r.address,
    facts: [PROPERTY_TYPE_LABELS[r.type] ?? "Other", r.yearBuilt ? `Built ${r.yearBuilt}` : null, r.sqFt ? fmt.area(r.sqFt) : null]
      .filter(Boolean)
      .join(" · "),
  }),
)

const loadVehicles = assetLoader(
  "VEHICLE",
  (itemId) =>
    prisma.vehicle.findMany({
      where: idFilter(itemId),
      select: { id: true, name: true, year: true, make: true, model: true, currentMileage: true, meterUnit: true, imageFilename: true, updatedAt: true },
    }),
  (r, fmt) => ({
    detail: [r.year, r.make, r.model].filter(Boolean).join(" "),
    facts: r.currentMileage != null ? `${r.currentMileage.toLocaleString("en-US")} ${fmt.meterShort(r.meterUnit)}` : "",
  }),
)

const loadEquipment = assetLoader(
  "EQUIPMENT",
  (itemId) =>
    prisma.equipment.findMany({
      where: idFilter(itemId),
      select: { id: true, name: true, category: true, manufacturer: true, modelNumber: true, location: true, imageFilename: true, updatedAt: true },
    }),
  (r) => ({
    detail: [r.manufacturer, r.modelNumber].filter(Boolean).join(" "),
    facts: [humanize(r.category), r.location].filter(Boolean).join(" · "),
  }),
)

const RELATIONSHIP_LABELS: Record<string, string> = {
  SELF: "Me",
  SPOUSE: "Spouse",
  CHILD: "Child",
  PARENT: "Parent",
  PET: "Pet",
  OTHER: "Other",
}

// People exist only with Health on: with it off the loader returns nothing,
// whatever the caller does.
const loadPeopleRows = assetLoader(
  "PERSON",
  (itemId) =>
    prisma.person.findMany({
      where: idFilter(itemId),
      select: { id: true, name: true, relationship: true, imageFilename: true, updatedAt: true },
    }),
  (r) => ({ detail: RELATIONSHIP_LABELS[r.relationship] ?? "", facts: "" }),
)

const loadPeople: CardLoader = async (config, ctx): Promise<AssetCardData> =>
  ctx.features.health ? ((await loadPeopleRows(config, ctx)) as AssetCardData) : { missing: false, total: 0, single: false, items: [] }

// ---- Rooms --------------------------------------------------------------------

/**
 * Rooms across properties (config.itemId: one property's rooms). `missing`
 * when that property was deleted. At most config.limit rooms are listed,
 * out of `total`.
 */
export type RoomsCardData =
  | { missing: true }
  | { missing: false; total: number; single: boolean; propertyCount: number; properties: PropertyRooms[] }

const loadRooms: CardLoader = async (config, { features }): Promise<RoomsCardData> => {
  const none: RoomsCardData = { missing: false, total: 0, single: false, propertyCount: 0, properties: [] }
  if (!features.rooms) return none
  const itemId = configItemId(config)
  const where = itemId ? { propertyId: itemId } : undefined
  // Counts per property (every property keeps its true count); only the chips
  // shown at the large tier are bounded by config.limit.
  const [grouped, chips] = await Promise.all([
    prisma.room.groupBy({ by: ["propertyId"], where, _count: { _all: true } }),
    prisma.room.findMany({
      where,
      orderBy: [{ property: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
      take: configLimit(config),
      select: { id: true, name: true, propertyId: true },
    }),
  ])
  if (itemId && grouped.length === 0) {
    if ((await prisma.property.count({ where: { id: itemId } })) === 0) return { missing: true }
    return { ...none, single: true }
  }
  const names = new Map(
    (await prisma.property.findMany({ where: { id: { in: grouped.map((g) => g.propertyId) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]),
  )
  const properties = roomGroups(
    grouped.map((g) => ({ propertyId: g.propertyId, propertyName: names.get(g.propertyId) ?? "", count: g._count._all })),
    chips,
  )
  return {
    missing: false,
    total: properties.reduce((n, p) => n + p.roomCount, 0),
    single: itemId !== null,
    propertyCount: properties.length,
    properties,
  }
}

// ---- Records, warranties, due maintenance ---------------------------------------

export type CardLine = {
  id: string
  title: string
  /** The asset it belongs to, when known. */
  assetName: string | null
  href: string
  /** Right-hand text, already formatted ("Mar 4", "12d left", "3d late"). */
  meta: string
}

export type RecordsCardData = { total: number; recent: CardLine[] }

const loadRecords: CardLoader = async (_config, { features, fmt }): Promise<RecordsCardData> => {
  const owned = ownedWhere(features)
  const [total, rows, index] = await Promise.all([
    prisma.serviceRecord.count({ where: owned }),
    prisma.serviceRecord.findMany({
      where: owned,
      orderBy: [{ date: "desc" }, { id: "asc" }],
      take: LIST_LENGTH,
      select: { id: true, title: true, date: true, assetType: true, assetId: true },
    }),
    assetIndex(),
  ])
  return {
    total,
    recent: rows.map((r) => ({
      id: r.id,
      title: r.title,
      assetName: index.assetName(r.assetType, r.assetId) ?? null,
      href: `${assetHref(r.assetType, r.assetId)}?tab=service&open=${r.id}`,
      meta: fmt.date(r.date),
    })),
  }
}

/** [one, many] */
const WARRANTY_TYPE_LABELS: Record<AssetType, [string, string]> = {
  PROPERTY: ["Property", "Properties"],
  VEHICLE: ["Vehicle", "Vehicles"],
  EQUIPMENT: ["Equipment", "Equipment"],
  PERSON: ["Person", "People"],
}

export type WarrantiesCardData = {
  total: number
  /** Active warranties per asset type, largest first. */
  breakdown: { label: string; count: number }[]
  /** Soonest to expire first. */
  soonest: CardLine[]
}

const loadWarranties: CardLoader = async (_config, { now, features }): Promise<WarrantiesCardData> => {
  const where = { ...ownedWhere(features), expirationDate: { gt: now } }
  const [groups, rows, index] = await Promise.all([
    prisma.warranty.groupBy({ by: ["assetType"], where, _count: { _all: true } }),
    prisma.warranty.findMany({
      where,
      orderBy: [{ expirationDate: "asc" }, { id: "asc" }],
      take: LIST_LENGTH,
      select: { id: true, productName: true, expirationDate: true, assetType: true, assetId: true },
    }),
    assetIndex(),
  ])
  return {
    total: groups.reduce((n, g) => n + g._count._all, 0),
    breakdown: groups
      .map((g) => ({ label: WARRANTY_TYPE_LABELS[g.assetType][g._count._all === 1 ? 0 : 1], count: g._count._all }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    soonest: rows.map((w) => {
      const daysLeft = Math.ceil((w.expirationDate!.getTime() - now.getTime()) / 86400000)
      return {
        id: w.id,
        title: w.productName,
        assetName: index.assetName(w.assetType, w.assetId) ?? null,
        href: assetHref(w.assetType, w.assetId),
        meta: `${daysLeft}d left`,
      }
    }),
  }
}

export type DueCardData = { count: number; items: (CardLine & { overdue: boolean })[] }

const loadDueMaintenance: CardLoader = async (_config, { now, features, fmt }): Promise<DueCardData> => {
  const [candidates, mileage, index] = await Promise.all([
    prisma.maintenanceSchedule.findMany({
      where: { AND: [dueCandidateFilter(30, now), ownedWhere(features)] },
      orderBy: { nextDueDate: "asc" },
    }),
    loadVehicleMileage(),
    assetIndex(),
  ])
  const due = dueMaintenance(candidates, mileage, now)
  return {
    count: due.length,
    items: due.slice(0, LIST_LENGTH).map(({ s, due: d }) => ({
      id: s.id,
      title: s.title,
      assetName: index.assetName(s.assetType, s.assetId) ?? null,
      href: assetHref(s.assetType, s.assetId),
      meta: dueLabel(d, fmt),
      overdue: d.overdue,
    })),
  }
}

// ---- Reminders, expiring warranties, intake -------------------------------------

const ASSET_TYPES: readonly AssetType[] = ["PROPERTY", "VEHICLE", "EQUIPMENT", "PERSON"]

/** The window, assetType and limit shared by the two "upcoming" cards. */
function upcomingConfig(config: Record<string, unknown>, defaults: { windowDays: number; limit: number }) {
  const w = config.windowDays
  const l = config.limit
  return {
    windowDays: typeof w === "number" && Number.isInteger(w) && w >= 1 ? Math.min(w, 365) : defaults.windowDays,
    limit: typeof l === "number" && Number.isInteger(l) && l >= 1 ? Math.min(l, 50) : defaults.limit,
    assetType: ASSET_TYPES.find((t) => t === config.assetType) ?? null,
  }
}

/** Person-owned rows never leave the server with Health off, whatever the config asks for. */
const hiddenByHealth = (assetType: AssetType | null, features: Features) => assetType === "PERSON" && !features.health

export type ReminderItem = {
  schedule: MaintenanceSchedule
  assetName: string | null
  href: string
  urgency: Urgency
  overdue: boolean
  dueLabel: string
  currentMileage: number | null
  meterUnit: MeterUnit
}

/** Most urgent first. `total` counts everything due in the window, not just `items`. */
export type RemindersCardData = {
  windowDays: number
  total: number
  /** The card is filtered to people and Health is off. */
  hidden: boolean
  items: ReminderItem[]
}

const loadReminders: CardLoader = async (config, { now, features, fmt }): Promise<RemindersCardData> => {
  const { windowDays, limit, assetType } = upcomingConfig(config, { windowDays: 30, limit: 6 })
  if (hiddenByHealth(assetType, features)) return { windowDays, total: 0, hidden: true, items: [] }
  const [candidates, mileage, index] = await Promise.all([
    prisma.maintenanceSchedule.findMany({
      where: { AND: [dueCandidateFilter(windowDays, now), { ...ownedWhere(features), ...(assetType ? { assetType } : {}) }] },
      orderBy: { nextDueDate: "asc" },
    }),
    loadVehicleMileage(),
    assetIndex(),
  ])
  const { total, items } = urgentMaintenance(candidates, mileage, now, limit, windowDays)
  return {
    windowDays,
    total,
    hidden: false,
    items: items.map(({ s, due }) => {
      const reading = s.assetType === "VEHICLE" ? mileage.get(s.assetId) : undefined
      return {
        schedule: s,
        assetName: index.assetName(s.assetType, s.assetId) ?? null,
        href: assetHref(s.assetType, s.assetId),
        urgency: urgencyOf(due),
        overdue: due.overdue,
        dueLabel: dueLabel(due, fmt),
        currentMileage: reading?.value ?? null,
        meterUnit: reading?.unit ?? "MILES",
      }
    }),
  }
}

export type ExpiringItem = {
  id: string
  productName: string
  assetName: string | null
  href: string
  daysLeft: number
  /** The expiry date, formatted. */
  expires: string
  monthKey: string
  monthLabel: string
}

/** Soonest first. `total` counts everything expiring in the window, not just `items`. */
export type ExpiringWarrantiesCardData = {
  windowDays: number
  total: number
  hidden: boolean
  items: ExpiringItem[]
}

const loadExpiringWarranties: CardLoader = async (config, { now, features, fmt }): Promise<ExpiringWarrantiesCardData> => {
  const { windowDays, limit, assetType } = upcomingConfig(config, { windowDays: 60, limit: 6 })
  if (hiddenByHealth(assetType, features)) return { windowDays, total: 0, hidden: true, items: [] }
  const [rows, index] = await Promise.all([
    prisma.warranty.findMany({
      where: {
        ...ownedWhere(features),
        ...(assetType ? { assetType } : {}),
        expirationDate: { gte: now, lte: new Date(now.getTime() + windowDays * 86400000) },
      },
      orderBy: [{ expirationDate: "asc" }, { id: "asc" }],
      select: { id: true, productName: true, expirationDate: true, assetType: true, assetId: true },
    }),
    assetIndex(),
  ])
  const { total, items } = expiringWarranties(rows, now, windowDays, limit)
  return {
    windowDays,
    total,
    hidden: false,
    items: items.map((w) => ({
      id: w.id,
      productName: w.productName,
      assetName: index.assetName(w.assetType, w.assetId) ?? null,
      href: assetHref(w.assetType, w.assetId),
      daysLeft: w.daysLeft,
      expires: fmt.date(w.expirationDate),
      monthKey: monthKeyOf(w.expirationDate),
      monthLabel: fmt.monthYear(w.expirationDate),
    })),
  }
}

export type IntakeCardData = {
  /** Items waiting for review. */
  count: number
  /** Newest first. */
  items: { id: string; headline: string; readiness: InboxReadiness }[]
}

const loadIntake: CardLoader = async (_config, { now, fmt }): Promise<IntakeCardData> => {
  const { items, householdNames } = await listInboxItems(now)
  const { count, newest } = intakeSummary(items, LIST_LENGTH)
  return {
    count,
    items: newest.map((item) => ({
      id: item.id,
      headline: headlineOf(item, householdNames, fmt),
      readiness: inboxReadiness(item, householdNames),
    })),
  }
}

// ---- Spending -------------------------------------------------------------------

/** "in 2026" / "in the last 12 months": what the headline total covers. */
function periodText(range: SpendRange, now: Date): string {
  return range === "ytd" ? `in ${now.getFullYear()}` : "in the last 12 months"
}

export type SpendingTrendData = {
  /** Any costed record at all; false shows the empty state. */
  hasCosts: boolean
  range: SpendRange
  /** Already formatted. */
  totalText: string
  periodText: string
  /** Relative change against the same window a year earlier; null when nothing was spent then. */
  delta: number | null
  /** The sentence under the headline, already formatted. */
  comparison: string
  /** Twelve months ending now (always, whatever the range) and the same months a year earlier. */
  points: BucketPoint[]
  prior: number[]
  priorLabel: string
  /** Mean monthly spend over the twelve months (only months since the first record). */
  average: number
}

const loadSpendingTrend: CardLoader = async (config, { now, fmt }): Promise<SpendingTrendData> => {
  const range = spendRangeOf(config)
  const rows = await costRecords()
  const { total, priorTotal, delta } = spendingSummary(rows, range, now)
  const { points, prior } = spendTrend(rows, now)
  const lastYear = now.getFullYear() - 1
  return {
    hasCosts: rows.length > 0,
    range,
    totalText: fmt.money(total),
    periodText: periodText(range, now),
    delta,
    comparison:
      delta === null
        ? range === "ytd"
          ? `Nothing recorded by this point in ${lastYear}.`
          : "Nothing recorded in the 12 months before."
        : range === "ytd"
          ? `vs the same point last year (${fmt.money(priorTotal)}).`
          : `vs the 12 months before (${fmt.money(priorTotal)}).`,
    points,
    prior,
    priorLabel: String(lastYear),
    average: monthlyAverage(points, rows, now),
  }
}

export type SpendingCategory = {
  key: string
  label: string
  /** A CSS colour (a --cost-* variable): fixed per category, never by rank. */
  color: string
  total: number
  count: number
  /** Total as a fraction of the largest category's (bar length). */
  share: number
}

export type SpendingBreakdownData = {
  hasCosts: boolean
  range: SpendRange
  periodText: string
  /** Sum of the categories (positive spending only), and formatted. */
  total: number
  totalText: string
  /** Largest first. */
  categories: SpendingCategory[]
}

const loadSpendingBreakdown: CardLoader = async (config, { now, fmt }): Promise<SpendingBreakdownData> => {
  const range = spendRangeOf(config)
  const rows = await costRecords()
  const totals = spendingByCategory(rows, range, now)
  const counts = categoryCounts(rows, range, now)
  const max = totals[0]?.total ?? 0
  const total = cents(totals.reduce((s, c) => s + c.total, 0))
  return {
    hasCosts: rows.length > 0,
    range,
    periodText: periodText(range, now),
    total,
    totalText: fmt.money(total),
    categories: totals.map(({ category, total: t }) => {
      const key = category as CategoryKey
      return {
        key,
        label: categoryLabel(key),
        color: categoryColor(key),
        total: t,
        count: counts.get(key) ?? 0,
        share: max > 0 ? t / max : 0,
      }
    }),
  }
}

// ---- Registry -----------------------------------------------------------------

/** Card types with a loader. A placed card without one is not rendered yet. */
export const LOADERS: Record<string, CardLoader> = {
  properties: loadProperties,
  vehicles: loadVehicles,
  people: loadPeople,
  equipment: loadEquipment,
  rooms: loadRooms,
  records: loadRecords,
  "active-warranties": loadWarranties,
  "due-maintenance": loadDueMaintenance,
  reminders: loadReminders,
  "expiring-warranties": loadExpiringWarranties,
  intake: loadIntake,
  "spending-trend": loadSpendingTrend,
  "spending-breakdown": loadSpendingBreakdown,
}
