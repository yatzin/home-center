// A card setting that points at one asset of any type: "TYPE:id", or unset
// for everything. Used by cards whose data spans asset types (Activity).
import { z } from "zod"
import type { AssetType } from "@/app/generated/prisma/client"

const PATTERN = /^(PROPERTY|VEHICLE|EQUIPMENT|PERSON):([A-Za-z0-9_-]{1,64})$/

export type AssetPick = { type: AssetType; id: string }

export const assetPickSchema = z.string().regex(PATTERN)

export const assetPickValue = (type: AssetType, id: string): string => `${type}:${id}`

/** Null for unset, or anything that is not "TYPE:id". */
export function parseAssetPick(value: unknown): AssetPick | null {
  if (typeof value !== "string") return null
  const m = PATTERN.exec(value)
  return m ? { type: m[1] as AssetType, id: m[2] } : null
}
