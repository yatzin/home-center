// Per-card data loaders (server only). Each placed card instance runs its own
// loader, so card types that are not on the dashboard cost nothing. A loader
// returns plain, serializable data for its client view; a throw is caught by
// the caller and shown as that one card's error state.
import { cache } from "react"
import { prisma } from "@/lib/prisma"
import type { Features } from "@/lib/features"
import type { Formatter } from "@/lib/regional"
import { loadActivityIndex, mostRecentlyActive } from "@/lib/asset-activity"

export type LoaderContext = { now: Date; features: Features; fmt: Formatter }
export type CardLoader = (config: Record<string, unknown>, ctx: LoaderContext) => Promise<unknown>

export type CardResult =
  | { id: string; type: string; config: Record<string, unknown>; status: "ok"; data: unknown }
  | { id: string; type: string; config: Record<string, unknown>; status: "error" }

// Several asset cards (and several instances of one) share these per request.
const activityIndex = cache(loadActivityIndex)

const DEFAULT_LIMIT = 7

function configLimit(config: Record<string, unknown>): number {
  const n = config.limit
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? Math.min(n, 50) : DEFAULT_LIMIT
}

function configItemId(config: Record<string, unknown>): string | null {
  return typeof config.itemId === "string" && config.itemId.length > 0 ? config.itemId : null
}

// ---- Asset cards ----------------------------------------------------------------

/** One asset on an asset card (Properties now; Vehicles, Equipment... later). */
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

// ---- Properties ---------------------------------------------------------------

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  HOUSE: "House",
  CONDO: "Condo",
  TOWNHOUSE: "Townhouse",
  LOT: "Lot",
  OTHER: "Other",
}

const loadProperties: CardLoader = async (config, { fmt }): Promise<AssetCardData> => {
  const itemId = configItemId(config)
  const [rows, activity] = await Promise.all([
    prisma.property.findMany({
      where: itemId ? { id: itemId } : undefined,
      select: { id: true, name: true, address: true, type: true, yearBuilt: true, sqFt: true, imageFilename: true, updatedAt: true },
    }),
    activityIndex(),
  ])
  if (itemId && rows.length === 0) return { missing: true }

  const byId = new Map(rows.map((r) => [r.id, r]))
  const items = mostRecentlyActive(rows, "PROPERTY", activity, configLimit(config)).map(({ assetId }) => {
    const r = byId.get(assetId)!
    const facts = [
      PROPERTY_TYPE_LABELS[r.type] ?? "Other",
      r.yearBuilt ? `Built ${r.yearBuilt}` : null,
      r.sqFt ? fmt.area(r.sqFt) : null,
    ]
      .filter(Boolean)
      .join(" · ")
    return { id: r.id, name: r.name, detail: r.address, facts, imageFilename: r.imageFilename }
  })
  return { missing: false, total: rows.length, single: itemId !== null, items }
}

// ---- Registry -----------------------------------------------------------------

/** Card types with a loader. A placed card without one is not rendered yet. */
export const LOADERS: Record<string, CardLoader> = {
  properties: loadProperties,
}
