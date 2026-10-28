// Pairing the editor's cards with the data the page has loaded for them. Pure
// TS, shared by the dashboard canvas and its tests.
//
// The editor's layout runs ahead of the server: a card added in edit mode has
// no data until its save lands and its data is loaded, and a card whose config
// changed still shows data loaded for the old config until then. The client
// keeps every card result it has seen (keyed by card id), each with the layout
// revision it was loaded from, and merges in fresh ones (page props, or the
// editor's own loads); a result counts as current only when it was loaded for
// the card's current config. Results can arrive out of order (a late page
// refresh carries older props), so a merge never goes back in revision and
// never swaps current data for data of another config.
import type { CardInstance } from "./layout"
import type { CardResult } from "./loaders"

/**
 * A card to draw: its loader result (with `updating` when that result was
 * loaded for an older config, `loadFailed` when the editor's load of it
 * failed), or "loading" for a card the page has no data for yet.
 */
export type CanvasCardData =
  | (CardResult & { updating?: boolean; loadFailed?: boolean })
  | { id: string; type: string; config: Record<string, unknown>; status: "loading" }

/** A result as the client keeps it: with the layout revision it was loaded from. */
export type LoadedEntry = {
  result: CardResult
  revision: number
  /** A stand-in error result for a load that failed in transit (markLoadFailed). */
  loadFailed?: boolean
}

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

/** Entries for a page's props: every result, at the page's revision. */
export function entriesOf(results: readonly CardResult[], revision: number): Map<string, LoadedEntry> {
  return new Map(results.map((r) => [r.id, { result: r, revision }]))
}

/** Each card's current config, by id (for mergeLoaded). */
export function configsOf(cards: readonly CardInstance[]): Map<string, Record<string, unknown>> {
  return new Map(cards.map((c) => [c.id, c.config]))
}

/**
 * `prev` with `fresh` (loaded from layout revision `revision`) merged in by
 * card id. A fresh result is skipped when the kept one comes from a newer
 * revision, or when the kept one matches the card's current config
 * (`current`) and the fresh one does not. A failed load is always replaced.
 */
export function mergeLoaded(
  prev: ReadonlyMap<string, LoadedEntry>,
  fresh: readonly CardResult[],
  revision: number,
  current: ReadonlyMap<string, Record<string, unknown>> = new Map(),
): Map<string, LoadedEntry> {
  const next = new Map(prev)
  for (const r of fresh) {
    const kept = prev.get(r.id)
    if (kept && !kept.loadFailed) {
      if (revision < kept.revision) continue
      const config = current.get(r.id)
      if (config && sameConfig(kept.result.config, config) && !sameConfig(r.config, config)) continue
    }
    next.set(r.id, { result: r, revision })
  }
  return next
}

/**
 * `prev` with the editor's failed load of `cards` (attempted at `revision`)
 * recorded: each shows its error state and asks for data again
 * (cardsNeedingData). Data already current for a card's config is kept.
 */
export function markLoadFailed(
  prev: ReadonlyMap<string, LoadedEntry>,
  cards: readonly CardInstance[],
  revision: number,
): Map<string, LoadedEntry> {
  const next = new Map(prev)
  for (const c of cards) {
    const kept = prev.get(c.id)
    if (kept && !kept.loadFailed && kept.result.type === c.type && sameConfig(kept.result.config, c.config)) continue
    next.set(c.id, {
      result: { id: c.id, type: c.type, config: c.config, status: "error" },
      revision: Math.max(revision, kept?.revision ?? revision),
      loadFailed: true,
    })
  }
  return next
}

/** The cards, in order, each with the data loaded for it (see CanvasCardData). */
export function withData(cards: readonly CardInstance[], loaded: ReadonlyMap<string, LoadedEntry>): CanvasCardData[] {
  return cards.map((c) => {
    const entry = loaded.get(c.id)
    if (!entry || entry.result.type !== c.type) return { id: c.id, type: c.type, config: c.config, status: "loading" as const }
    if (entry.loadFailed) return { ...entry.result, updating: false, loadFailed: true }
    return { ...entry.result, updating: !sameConfig(entry.result.config, c.config) }
  })
}

/** Ids of the cards with no data yet, data for an older config, or a failed load, in order. */
export function cardsNeedingData(cards: readonly CanvasCardData[]): string[] {
  return cards.filter((c) => c.status === "loading" || c.updating === true || c.loadFailed === true).map((c) => c.id)
}

/** A loader's "the configured item no longer exists" result. */
export function isMissingData(data: unknown): boolean {
  return typeof data === "object" && data !== null && (data as { missing?: unknown }).missing === true
}
