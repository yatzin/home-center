// Pure grid engine for the customizable dashboard. Gravity-based like
// react-grid-layout: cards sit on an integer grid `cols` wide, never overlap,
// and float up (vertical compaction) until something stops them.
//
// Every function is pure: inputs are never mutated and fresh arrays/objects are
// returned. Ties are broken by y, then x, then id, so results are deterministic.
// This module has no imports so layout.ts can re-export from it without a cycle.

export const LARGE_COLS = 12
export const PHONE_COLS = 2

/** A card's position and size in grid units; `id` is the card id. */
export type Placement = { id: string; x: number; y: number; w: number; h: number }

export type Size = { w: number; h: number }
export type Limits = { min: Size; max: Size }

const int = (n: number, fallback: number): number => (Number.isFinite(n) ? Math.round(n) : fallback)
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi)

function collides(a: Placement, b: Placement): boolean {
  return a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function byPosition(a: Placement, b: Placement): number {
  return a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Integer coordinates, at least 1x1, no wider than the grid, inside it. */
function normalize(p: Placement, cols: number): Placement {
  const w = clamp(int(p.w, 1), 1, cols)
  return {
    id: p.id,
    x: clamp(int(p.x, 0), 0, cols - w),
    y: Math.max(0, int(p.y, 0)),
    w,
    h: Math.max(1, int(p.h, 1)),
  }
}

/** Normalized copies with duplicate ids dropped (first occurrence wins). */
function prepare(ps: readonly Placement[], cols: number): Placement[] {
  const seen = new Set<string>()
  const out: Placement[] = []
  for (const p of ps) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push(normalize(p, cols))
  }
  return out
}

/** Re-emit `placed` in the order of `order` (ids missing from `placed` are skipped). */
function inOrder(order: readonly Placement[], placed: readonly Placement[]): Placement[] {
  const map = new Map(placed.map((p) => [p.id, p]))
  return order.flatMap((p) => {
    const q = map.get(p.id)
    return q ? [q] : []
  })
}

/**
 * Settle `rest` around the `fixed` cards (which never move). Each card, in
 * position order, keeps its y unless it hits an already-settled card, in which
 * case it drops just below that card until it is clear.
 */
function settle(fixed: readonly Placement[], rest: readonly Placement[]): Placement[] {
  const placed: Placement[] = fixed.map((p) => ({ ...p }))
  for (const p of [...rest].sort(byPosition)) {
    const q = { ...p }
    for (let hit = placed.find((o) => collides(q, o)); hit; hit = placed.find((o) => collides(q, o))) {
      q.y = hit.y + hit.h
    }
    placed.push(q)
  }
  return placed
}

/** Keeps earlier (top-left-most) cards in place and pushes colliding cards down. */
export function resolveOverlaps(ps: readonly Placement[], cols: number): Placement[] {
  const clean = prepare(ps, cols)
  return inOrder(clean, settle([], clean))
}

/** Lifts every card as far up as it can go, so no holes remain above any card. */
export function compact(ps: readonly Placement[], cols: number): Placement[] {
  const clean = resolveOverlaps(ps, cols)
  const placed: Placement[] = []
  for (const p of [...clean].sort(byPosition)) {
    const q = { ...p }
    while (q.y > 0 && !placed.some((o) => collides({ ...q, y: q.y - 1 }, o))) q.y--
    placed.push(q)
  }
  return inOrder(clean, placed)
}

/**
 * Moves a card to `to` (clamped into the grid). The moved card wins its target
 * slot: the others first close the gap it left, then anything under its new
 * spot is pushed down, then everything compacts. So dragging a card onto the
 * one below or above it swaps them.
 */
export function moveCard(ps: readonly Placement[], id: string, to: { x: number; y: number }, cols: number): Placement[] {
  const clean = prepare(ps, cols)
  const card = clean.find((p) => p.id === id)
  if (!card) return clean
  const moved = normalize({ ...card, x: to.x, y: to.y }, cols)
  const others = compact(
    clean.filter((p) => p.id !== id),
    cols,
  )
  return inOrder(clean, compact(settle([moved], others), cols))
}

/** Resizes a card within its limits and the grid; neighbours are pushed down, then all compacts. */
export function resizeCard(ps: readonly Placement[], id: string, size: Size, limits: Limits, cols: number): Placement[] {
  const clean = prepare(ps, cols)
  const card = clean.find((p) => p.id === id)
  if (!card) return clean
  // Limits first (min wins if a malformed limit has max < min), then the grid:
  // a card grows rightward only as far as the edge, and shifts left only when
  // its minimum width cannot fit at its column.
  const minW = clamp(int(limits.min.w, 1), 1, cols)
  const maxW = Math.max(minW, int(limits.max.w, cols))
  const room = cols - card.x
  const w = Math.max(minW, Math.min(clamp(int(size.w, card.w), minW, maxW), room))
  const minH = Math.max(1, int(limits.min.h, 1))
  const maxH = Math.max(minH, int(limits.max.h, Infinity))
  const h = clamp(int(size.h, card.h), minH, maxH)
  const resized = normalize({ ...card, w, h }, cols)
  const others = clean.filter((p) => p.id !== id)
  return inOrder(clean, compact(settle([resized], others), cols))
}

/** Adds a card at the bottom-left (then compacted). An id already present is a no-op. */
export function appendCard(ps: readonly Placement[], id: string, size: Size, cols: number): Placement[] {
  const clean = prepare(ps, cols)
  if (clean.some((p) => p.id === id)) return clean
  const bottom = clean.reduce((max, p) => Math.max(max, p.y + p.h), 0)
  return compact([...clean, { id, x: 0, y: bottom, w: size.w, h: size.h }], cols)
}

/** Removes a card and closes the gap it leaves. */
export function removeCard(ps: readonly Placement[], id: string, cols: number): Placement[] {
  return compact(
    ps.filter((p) => p.id !== id),
    cols,
  )
}

/**
 * Lays cards out left to right, top to bottom, in the given order, wrapping to
 * a new row when a card does not fit. Narrow cards can share a row.
 */
function flow(order: readonly Placement[], cols: number): Placement[] {
  let x = 0
  let y = 0
  let rowH = 0
  return order.map((p) => {
    const w = clamp(int(p.w, cols), 1, cols)
    const h = Math.max(1, int(p.h, 1))
    if (x + w > cols) {
      x = 0
      y += rowH
      rowH = 0
    }
    const placed = { id: p.id, x, y, w, h }
    x += w
    rowH = Math.max(rowH, h)
    return placed
  })
}

/**
 * Phone layout derived from the large one: cards in reading order (y, then x),
 * full width unless the card's phone default is narrower.
 */
export function deriveRowMajor(
  large: readonly Placement[],
  phoneDefaults: Map<string, Size>,
  cols: number = PHONE_COLS,
): Placement[] {
  const order = prepare(large, LARGE_COLS).sort(byPosition)
  return flow(
    order.map((p) => {
      const d = phoneDefaults.get(p.id)
      return { ...p, w: d ? d.w : cols, h: d ? d.h : p.h }
    }),
    cols,
  )
}

/**
 * Swaps a card with its neighbour in reading order (the phone "move up/down"
 * button) and re-flows the cards. Moving the first card up or the last card
 * down is a no-op.
 */
export function moveInOrder(ps: readonly Placement[], id: string, delta: -1 | 1, cols: number): Placement[] {
  const clean = prepare(ps, cols)
  const order = [...clean].sort(byPosition)
  const i = order.findIndex((p) => p.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= order.length) return clean
  ;[order[i], order[j]] = [order[j], order[i]]
  return inOrder(clean, flow(order, cols))
}
