// Pairing the editor's cards with the data the page has loaded for them. Pure
// TS, shared by the dashboard canvas and its tests.
//
// The editor's layout runs ahead of the server: a card added in edit mode has
// no data until its save lands and the page refreshes, and a card whose config
// changed still shows data loaded for the old config until then. The client
// keeps every card result it has seen (keyed by card id) and merges in fresh
// ones from each refresh; a result counts as current only when it was loaded
// for the card's current config.
import type { CardInstance } from "./layout"
import type { CardResult } from "./loaders"

/**
 * A card to draw: its loader result (with `updating` when that result was
 * loaded for an older config), or "loading" for a card the page has no data
 * for yet.
 */
export type CanvasCardData =
  | (CardResult & { updating?: boolean })
  | { id: string; type: string; config: Record<string, unknown>; status: "loading" }

/** A plain JSON value with object keys sorted and undefined object values dropped. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v)
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .sort()
        .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
    )
  }
  return v
}

/** Same config, ignoring key order and keys set to undefined (JSON drops them on save). */
export function sameConfig(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

/** Every result seen so far, with `fresh` (a refresh's props) replacing older ones by card id. */
export function mergeLoaded(prev: ReadonlyMap<string, CardResult>, fresh: readonly CardResult[]): Map<string, CardResult> {
  const next = new Map(prev)
  for (const c of fresh) next.set(c.id, c)
  return next
}

/** The cards, in order, each with the data loaded for it (see CanvasCardData). */
export function withData(cards: readonly CardInstance[], loaded: ReadonlyMap<string, CardResult>): CanvasCardData[] {
  return cards.map((c) => {
    const result = loaded.get(c.id)
    if (!result || result.type !== c.type) return { id: c.id, type: c.type, config: c.config, status: "loading" as const }
    return { ...result, updating: !sameConfig(result.config, c.config) }
  })
}

/** Ids of the cards with no data yet, or data for an older config, in order. */
export function cardsNeedingData(cards: readonly CanvasCardData[]): string[] {
  return cards.filter((c) => c.status === "loading" || c.updating === true).map((c) => c.id)
}

/** Some card has no data yet, or data for an older config. */
export function needsData(cards: readonly CanvasCardData[]): boolean {
  return cardsNeedingData(cards).length > 0
}

/** A loader's "the configured item no longer exists" result. */
export function isMissingData(data: unknown): boolean {
  return typeof data === "object" && data !== null && (data as { missing?: unknown }).missing === true
}
