import type { AssetType } from "@/app/generated/prisma/enums"
import { ASSET_TYPES } from "@/lib/assets"
import { ToolInputError } from "./query"

// Shortcut tools take asset ids from search. Models sometimes pass a name
// ("Civic") or a typed id ("vehicle:abc") instead, and an unknown id would
// silently produce an empty answer — so ids are checked, and an exact name
// match (ignoring case) is accepted when it is unambiguous.

export type AssetNames = Record<AssetType, Record<string, string>>

export function resolveAssetId(names: AssetNames, raw: string, types: readonly AssetType[] = ASSET_TYPES): string {
  const value = String(raw).trim()
  const candidates = [...new Set([value, value.replace(/^[a-z_]+:\s*/i, "")])].filter(Boolean)

  for (const v of candidates) {
    if (types.some((t) => Object.hasOwn(names[t], v))) return v
  }
  for (const v of candidates) {
    const wanted = v.toLowerCase()
    const hits = types.flatMap((t) =>
      Object.entries(names[t]).filter(([, name]) => name.toLowerCase() === wanted).map(([id]) => id)
    )
    if (hits.length === 1) return hits[0]
  }
  throw new ToolInputError(`Unknown asset id "${raw}". Use search to get ids.`)
}
