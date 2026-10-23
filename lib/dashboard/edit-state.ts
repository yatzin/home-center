// Edit-mode state machine for the customizable dashboard. Pure TS: the edit UI
// drives it with useReducer, and use-autosave.ts uses the save helpers at the
// bottom. Every state it returns passes validateLayout(layout, limitsMap()),
// given a valid starting layout. Unknown ids and card types are no-ops (the
// same state object is returned), never errors.
//
// Edits apply to the layout of the current mode only. The phone layout is
// derived (stored as null) until first edited: the first phone-mode edit
// stores the derived one, then edits it. Adding a card adds it to both layouts
// (storing the phone layout first if needed); removing one removes it from
// both; config is shared.
import type { Features } from "@/lib/features"
import { cardType, limitsMap } from "./card-types"
import {
  appendCard,
  LARGE_COLS,
  moveCard,
  moveInOrder,
  PHONE_COLS,
  removeCard,
  resizeCard,
  type Placement,
  type Size,
} from "./grid"
import type { CardInstance, DashboardLayout } from "./layout"
import { resolvePhoneLayout } from "./resolve-phone"

export type Mode = "large" | "phone"

export type EditState = {
  layout: DashboardLayout
  /** The revision the next save is based on. */
  revision: number
  mode: Mode
  /** The layout has changes not yet saved. */
  dirty: boolean
  /** A save was rejected because the dashboard changed elsewhere; autosave stops until `replace`. */
  conflict: boolean
  /**
   * Site features: the phone layout is derived the same way the page renders
   * it (cards of disabled features go last), and phone "move up/down" steps
   * over cards that are hidden because their feature is off.
   */
  features: Features
}

/** What `restore` needs to put a removed card back where it was. */
export type CardSnapshot = {
  card: CardInstance
  large: Placement
  phone: Placement
}

export type EditAction =
  | { type: "move"; id: string; to: { x: number; y: number } }
  | { type: "resize"; id: string; size: Size }
  | { type: "moveOrder"; id: string; delta: -1 | 1 }
  /** `id` comes from newCardId so the reducer stays pure. */
  | { type: "add"; cardType: string; id: string }
  | { type: "remove"; id: string }
  | { type: "restore"; snapshot: CardSnapshot }
  | { type: "config"; id: string; config: Record<string, unknown> }
  | { type: "mode"; mode: Mode }
  /** `layout` is the layout that was saved; when the state has moved on since, it stays dirty. */
  | { type: "saved"; revision: number; layout?: DashboardLayout }
  | { type: "conflict" }
  | { type: "replace"; layout: DashboardLayout; revision: number }

export function initialEditState(layout: DashboardLayout, revision: number, features: Features): EditState {
  return {
    layout,
    revision,
    mode: "large",
    dirty: false,
    conflict: false,
    features,
  }
}

/** True for cards not shown on the dashboard: unknown type, or its feature is off. */
function hiddenPredicate(state: EditState): (id: string) => boolean {
  const hidden = new Set(
    state.layout.cards
      .filter((c) => {
        const def = cardType(c.type)
        return !def || (def.requires !== undefined && !state.features[def.requires])
      })
      .map((c) => c.id),
  )
  return (id) => hidden.has(id)
}

/** A fresh card id `${type}-${suffix}` not in `existing`. `rand` is injectable for tests. */
export function newCardId(type: string, existing: Iterable<string>, rand: () => number = Math.random): string {
  const taken = new Set(existing)
  for (let i = 0; i < 8; i++) {
    const suffix = Math.floor(rand() * 36 ** 4)
      .toString(36)
      .padStart(4, "0")
    const id = `${type}-${suffix}`
    if (!taken.has(id)) return id
  }
  for (let n = 1; ; n++) {
    const id = `${type}-${n}`
    if (!taken.has(id)) return id
  }
}

/** The phone placements as shown: stored, or derived from the large layout. */
function phoneOf(state: EditState): Placement[] {
  return state.layout.phone ?? resolvePhoneLayout(state.layout, state.features)
}

function samePlacements(a: readonly Placement[], b: readonly Placement[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => {
      const q = b[i]
      return p.id === q.id && p.x === q.x && p.y === q.y && p.w === q.w && p.h === q.h
    })
  )
}

/** Card at its size on the phone grid: its type's phone size, no wider than PHONE_COLS. */
function phoneSize(type: string): Size | null {
  const def = cardType(type)
  return def ? { w: Math.min(def.phone.w, PHONE_COLS), h: def.phone.h } : null
}

/** Applies a placement edit to the current mode's layout; same state when nothing changed. */
function editPlacements(
  state: EditState,
  id: string,
  op: (ps: readonly Placement[], cols: number) => Placement[],
): EditState {
  if (!state.layout.cards.some((c) => c.id === id)) return state
  if (state.mode === "large") {
    const large = op(state.layout.large, LARGE_COLS)
    if (samePlacements(large, state.layout.large)) return state
    return { ...state, layout: { ...state.layout, large }, dirty: true }
  }
  const before = phoneOf(state)
  const phone = op(before, PHONE_COLS)
  if (samePlacements(phone, before)) return state
  return { ...state, layout: { ...state.layout, phone }, dirty: true }
}

/** The card, its large placement and its phone placement (stored or derived), or null. */
export function snapshotCard(state: EditState, id: string): CardSnapshot | null {
  const card = state.layout.cards.find((c) => c.id === id)
  const large = state.layout.large.find((p) => p.id === id)
  const phone = phoneOf(state).find((p) => p.id === id)
  if (!card || !large || !phone) return null
  return {
    card: { ...card, config: { ...card.config } },
    large: { ...large },
    phone: { ...phone },
  }
}

/** Appends the card, then moves it to `at`: it wins that spot and the others make room. */
function placeAt(ps: readonly Placement[], at: Placement, cols: number): Placement[] {
  return moveCard(appendCard(ps, at.id, { w: at.w, h: at.h }, cols), at.id, { x: at.x, y: at.y }, cols)
}

export function editReducer(state: EditState, action: EditAction): EditState {
  const { layout } = state
  switch (action.type) {
    case "move":
      return editPlacements(state, action.id, (ps, cols) => moveCard(ps, action.id, action.to, cols))

    case "resize": {
      const card = layout.cards.find((c) => c.id === action.id)
      const limits = card && limitsMap().get(card.type)
      if (!limits) return state
      return editPlacements(state, action.id, (ps, cols) => resizeCard(ps, action.id, action.size, limits, cols))
    }

    case "moveOrder": {
      const skip = hiddenPredicate(state)
      return editPlacements(state, action.id, (ps, cols) => moveInOrder(ps, action.id, action.delta, cols, skip))
    }

    case "add": {
      const def = cardType(action.cardType)
      if (!def || !action.id || layout.cards.some((c) => c.id === action.id)) return state
      const card: CardInstance = {
        id: action.id,
        type: def.id,
        config: { ...def.defaultConfig },
      }
      return {
        ...state,
        layout: {
          ...layout,
          cards: [...layout.cards, card],
          large: appendCard(layout.large, card.id, { ...def.large }, LARGE_COLS),
          phone: appendCard(phoneOf(state), card.id, phoneSize(def.id)!, PHONE_COLS),
        },
        dirty: true,
      }
    }

    case "remove": {
      if (!layout.cards.some((c) => c.id === action.id)) return state
      // In large mode a derived phone layout stays derived; in phone mode the edit stores it.
      const phone =
        layout.phone === null && state.mode === "large" ? null : removeCard(phoneOf(state), action.id, PHONE_COLS)
      return {
        ...state,
        layout: {
          ...layout,
          cards: layout.cards.filter((c) => c.id !== action.id),
          large: removeCard(layout.large, action.id, LARGE_COLS),
          phone,
        },
        dirty: true,
      }
    }

    case "restore": {
      const { card, large, phone } = action.snapshot
      if (!cardType(card.type) || layout.cards.some((c) => c.id === card.id)) return state
      const limits = limitsMap().get(card.type)!
      // Clamp to the type's current limits, in case the snapshot predates a change.
      const fit = (p: Placement, cols: number): Placement => {
        const minW = Math.min(limits.min.w, cols)
        const w = Math.max(minW, Math.min(p.w, limits.max.w, cols))
        const h = Math.max(limits.min.h, Math.min(p.h, limits.max.h))
        return { ...p, w, h }
      }
      return {
        ...state,
        layout: {
          ...layout,
          cards: [...layout.cards, { ...card, config: { ...card.config } }],
          large: placeAt(layout.large, fit(large, LARGE_COLS), LARGE_COLS),
          phone: layout.phone === null ? null : placeAt(layout.phone, fit(phone, PHONE_COLS), PHONE_COLS),
        },
        dirty: true,
      }
    }

    case "config": {
      const i = layout.cards.findIndex((c) => c.id === action.id)
      const def = i < 0 ? undefined : cardType(layout.cards[i].type)
      const parsed = def?.configSchema.safeParse(action.config)
      if (!parsed?.success) return state
      const cards = layout.cards.map((c, j) => (j === i ? { ...c, config: parsed.data } : c))
      return { ...state, layout: { ...layout, cards }, dirty: true }
    }

    case "mode":
      return state.mode === action.mode ? state : { ...state, mode: action.mode }

    case "saved": {
      const stale = action.layout !== undefined && action.layout !== layout
      return {
        ...state,
        revision: Math.max(state.revision, action.revision),
        dirty: stale ? state.dirty : false,
      }
    }

    case "conflict":
      return { ...state, conflict: true }

    case "replace":
      return {
        ...state,
        layout: action.layout,
        revision: action.revision,
        dirty: false,
        conflict: false,
      }

    default:
      return state
  }
}

// ---- Autosave decisions (used by components/dashboard/canvas/use-autosave.ts) ----

/** What the autosave loop knows that React state may not have caught up with yet. */
export type SaveTracker = {
  /** Revision returned by the last successful save. */
  revision: number
  /** The layout object last saved successfully. */
  savedLayout: DashboardLayout | null
  /** The layout object whose save last failed (not retried until it changes). */
  failedLayout: DashboardLayout | null
}

export type SaveResult = { success: true; revision: number } | { error: string; conflict?: true }

export function initialTracker(state: EditState): SaveTracker {
  return { revision: state.revision, savedLayout: null, failedLayout: null }
}

/**
 * The save to run now, or null when there is nothing (new) to save. A layout
 * whose save failed is retried only with `retryFailed` (an explicit flush, e.g.
 * Done); a layout that hit a conflict is never re-sent (`conflict` is set).
 */
export function nextSave(
  state: EditState,
  t: SaveTracker,
  retryFailed = false,
): { layout: DashboardLayout; baseRevision: number } | null {
  if (!state.dirty || state.conflict) return null
  if (state.layout === t.savedLayout || (!retryFailed && state.layout === t.failedLayout)) return null
  return {
    layout: state.layout,
    baseRevision: Math.max(t.revision, state.revision),
  }
}

/** Folds a save's result into the tracker; `action` is what to dispatch, `error` what to show. */
export function applySaveResult(
  t: SaveTracker,
  layout: DashboardLayout,
  result: SaveResult,
): { tracker: SaveTracker; action: EditAction | null; error: string | null } {
  if ("success" in result) {
    return {
      tracker: {
        revision: result.revision,
        savedLayout: layout,
        failedLayout: null,
      },
      action: { type: "saved", revision: result.revision, layout },
      error: null,
    }
  }
  // Marked failed so the loop does not re-send it before React sees `conflict`.
  // Both `error` and `conflict` are set: the UI should show only the conflict banner.
  if (result.conflict)
    return {
      tracker: { ...t, failedLayout: layout },
      action: { type: "conflict" },
      error: result.error,
    }
  return {
    tracker: { ...t, failedLayout: layout },
    action: null,
    error: result.error,
  }
}
