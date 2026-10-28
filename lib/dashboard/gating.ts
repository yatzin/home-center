// Pure config and Health gating shared by the card loaders (no Prisma or Next
// imports, so it is unit-testable).
import type { Features } from "@/lib/features"
import type { AssetType } from "@/app/generated/prisma/client"

export const DEFAULT_LIMIT = 7

export function configLimit(config: Record<string, unknown>): number {
  const n = config.limit
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? Math.min(n, 50) : DEFAULT_LIMIT
}

export function configItemId(config: Record<string, unknown>): string | null {
  return typeof config.itemId === "string" && config.itemId.length > 0 ? config.itemId : null
}

const ASSET_TYPES: readonly AssetType[] = ["PROPERTY", "VEHICLE", "EQUIPMENT", "PERSON"]

/** The window, assetType and limit shared by the two "upcoming" cards. */
export function upcomingConfig(config: Record<string, unknown>, defaults: { windowDays: number; limit: number }) {
  const w = config.windowDays
  const l = config.limit
  return {
    windowDays: typeof w === "number" && Number.isInteger(w) && w >= 1 ? Math.min(w, 365) : defaults.windowDays,
    limit: typeof l === "number" && Number.isInteger(l) && l >= 1 ? Math.min(l, 50) : defaults.limit,
    assetType: ASSET_TYPES.find((t) => t === config.assetType) ?? null,
  }
}

/** Person-owned rows never leave the server with Health off, whatever the config asks for. */
export const hiddenByHealth = (assetType: AssetType | null, features: Features) => assetType === "PERSON" && !features.health
