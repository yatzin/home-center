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

/** An asset as the name matcher sees it; aka carries extra words people use (a vehicle's year, make and model). */
export type AssetEntry = { type: AssetType; id: string; name: string; aka?: string }
export type AssetMatch =
  | { kind: "found"; asset: AssetEntry }
  | { kind: "ambiguous"; matches: AssetEntry[] }
  | { kind: "none" }

const FILLER = new Set(["the", "our", "my", "a", "an", "we", "of"])
const nameWords = (s: string) =>
  s.toLowerCase().replace(/'s\b/g, "").replace(/[^a-z0-9&]+/g, " ").split(" ").filter((w) => w && !FILLER.has(w))

function matchIn(assets: AssetEntry[], raw: string): AssetMatch {
  const value = String(raw).trim().replace(/^[a-z_]+:\s*/i, "")
  const byId = assets.find((a) => a.id === value)
  if (byId) return { kind: "found", asset: byId }
  const exact = assets.filter((a) => a.name.toLowerCase() === value.toLowerCase())
  if (exact.length === 1) return { kind: "found", asset: exact[0] }
  const wanted = nameWords(value)
  if (!wanted.length) return { kind: "none" }
  const hits = assets.filter((a) => {
    const have = nameWords(`${a.name} ${a.aka ?? ""}`)
    return wanted.every((w) => have.some((h) => h.startsWith(w)))
  })
  if (hits.length === 1) return { kind: "found", asset: hits[0] }
  return hits.length ? { kind: "ambiguous", matches: hits } : { kind: "none" }
}

/**
 * Lets shortcut tools take a name as the user said it ("the Civic", "Lake Cabin")
 * instead of an id from search: an id, an exact name, or every word matching
 * the start of a word in the name (or a vehicle's year, make and model).
 * The type hint is tried first; small models often guess it wrong, so the
 * rest are tried when it finds nothing.
 */
export function matchAsset(catalog: AssetEntry[], raw: string, types: readonly AssetType[] = ASSET_TYPES): AssetMatch {
  const hinted = matchIn(catalog.filter((a) => types.includes(a.type)), raw)
  return hinted.kind === "none" && types.length < ASSET_TYPES.length ? matchIn(catalog, raw) : hinted
}
