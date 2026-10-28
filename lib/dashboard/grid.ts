// Pure grid engine for the customizable dashboard. Cards sit on an integer
// grid `cols` wide and never overlap. There is no gravity: a card keeps the
// row it is given, so an admin can leave empty rows between cards. Two rules
// keep the layout tidy:
//
//  - Collisions push down. A card that is moved, resized or added wins its
//    spot; only the cards it lands on are pushed down (and the cards those
//    land on, and so on). Nothing is ever pushed up.
//  - Gaps are capped (clampGaps). No card sits more than MAX_GAP_ROWS empty
//    rows below the lowest card above it in its columns (or below the top of
//    the page). A card past the cap is pulled up to it, never further.
//
// Every function is pure: inputs are never mutated and fresh arrays/objects are
// returned. Ties are broken by y, then x, then id, so results are deterministic.
// This module has no imports so layout.ts can re-export from it without a cycle.

export const LARGE_COLS = 12
export const PHONE_COLS = 2

/** The most empty rows allowed between a card and the card above it in its columns (or the top). */
export const MAX_GAP_ROWS = 5

/** A card's position and size in grid units; `id` is the card id. */
export type Placement = { id: string; x: number; y: number; w: number; h: number }

export type Size = { w: number; h: number }
export type Limits = { min: Size; max: Size }

const int = (n: number, fallback: number): number => (Number.isFinite(n) ? Math.round(n) : fallback)
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi)

const sharesColumns = (a: Placement, b: Placement): boolean => a.x < b.x + b.w && b.x < a.x + a.w

function collides(a: Placement, b: Placement): boolean {
  return a.id !== b.id && sharesColumns(a, b) && a.y < b.y + b.h && b.y < a.y + a.h
}

function byPosition(a: Placement, b: Placement): number {
  return a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

// Upper bound for a stored y or h. Far beyond any real dashboard, but it keeps
// arithmetic exact and loops short when a corrupt layout carries 1e300.
export const MAX_ROW = 10_000

/** Integer coordinates, at least 1x1, no wider than the grid, inside it. */
function normalize(p: Placement, cols: number): Placement {
  const w = clamp(int(p.w, 1), 1, cols)
  return {
    id: p.id,
    x: clamp(int(p.x, 0), 0, cols - w),
    y: clamp(int(p.y, 0), 0, MAX_ROW),
    w,
    h: clamp(int(p.h, 1), 1, MAX_ROW),
  }
}

const bottomOf = (ps: readonly Placement[]): number => ps.reduce((max, p) => Math.max(max, p.y + p.h), 0)

/** The lowest bottom edge among `ps` that share a column with `p` (0, the top, when none do). */
const floorUnder = (ps: readonly Placement[], p: Placement): number =>
  ps.reduce((max, o) => (sharesColumns(o, p) ? Math.max(max, o.y + o.h) : max), 0)

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
 * case it drops just below that card until it is clear. So only cards that
 * collide move, only down, and a push cascades to the cards below.
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

/**
 * The gap cap on a layout without overlaps. Cards are taken top to bottom (y,
 * then x, then id); each may sit at most MAX_GAP_ROWS below the lowest bottom
 * edge of the cards already taken that share a column with it (those are all
 * above it), or below row 0 when there are none. A card past that is pulled up
 * to exactly the cap. Cards taken earlier only ever rise, so a card's new row
 * is still clear of them and of the cards after it: no overlap can appear.
 */
function capGaps(ps: readonly Placement[]): Placement[] {
  const placed: Placement[] = []
  for (const p of [...ps].sort(byPosition)) {
    placed.push({ ...p, y: Math.min(p.y, floorUnder(placed, p) + MAX_GAP_ROWS) })
  }
  return placed
}

/** Keeps earlier (top-left-most) cards in place and pushes colliding cards down. */
export function resolveOverlaps(ps: readonly Placement[], cols: number): Placement[] {
  const clean = prepare(ps, cols)
  return inOrder(clean, settle([], clean))
}

/**
 * Enforces the gap cap (see capGaps): no card more than MAX_GAP_ROWS empty
 * rows below the card above it in its columns, or below the top. Overlaps are
 * resolved first (push down). Cards within the cap never move.
 */
export function clampGaps(ps: readonly Placement[], cols: number): Placement[] {
  const clean = resolveOverlaps(ps, cols)
  return inOrder(clean, capGaps(clean))
}

/**
 * Vertical compaction: lifts every card as far up as it can go. The editor no
 * longer uses it (layouts keep their gaps); it remains for callers that want a
 * gap-free layout.
 */
export function compact(ps: readonly Placement[], cols: number): Placement[] {
  const clean = resolveOverlaps(ps, cols)
  const placed: Placement[] = []
  for (const p of [...clean].sort(byPosition)) {
    // Settled cards sharing a column all sit above this one, so landing on
    // their lowest bottom edge equals lifting it row by row, in O(n).
    placed.push({ ...p, y: floorUnder(placed, p) })
  }
  return inOrder(clean, placed)
}

/**
 * Moves a card to `to` (clamped into the grid). The moved card wins its target
 * slot; only the cards it lands on are pushed down (cascading); the slot it
 * left stays empty. Then the gap cap applies, so a drop far below the others
 * lands MAX_GAP_ROWS below the card above it.
 */
export function moveCard(ps: readonly Placement[], id: string, to: { x: number; y: number }, cols: number): Placement[] {
  const clean = prepare(ps, cols)
  const card = clean.find((p) => p.id === id)
  if (!card) return clean
  const others = clean.filter((p) => p.id !== id)
  // A NaN target keeps that axis. Past the cap below the others the gap cap
  // would pull the card back anyway, so a 1e300 target stays cheap.
  const x = Number.isNaN(to.x) ? card.x : clamp(to.x, 0, cols - card.w)
  const y = Number.isNaN(to.y) ? card.y : clamp(to.y, 0, bottomOf(others) + MAX_GAP_ROWS)
  const moved = normalize({ ...card, x, y }, cols)
  return inOrder(clean, capGaps(settle([moved], others)))
}

/** Resizes a card within its limits and the grid; only the cards it now covers are pushed down. */
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
  return inOrder(clean, capGaps(settle([resized], others)))
}

/** Adds a card at the left, below the lowest bottom edge. An id already present is a no-op. */
export function appendCard(ps: readonly Placement[], id: string, size: Size, cols: number): Placement[] {
  const clean = prepare(ps, cols)
  if (clean.some((p) => p.id === id)) return clean
  return clampGaps([...clean, { id, x: 0, y: bottomOf(clean), w: size.w, h: size.h }], cols)
}

/** Removes a card. Its space stays empty, except that the gap cap still applies to the cards below. */
export function removeCard(ps: readonly Placement[], id: string, cols: number): Placement[] {
  return clampGaps(
    ps.filter((p) => p.id !== id),
    cols,
  )
}

/**
 * Display only: the layout without the cards that are not shown (feature off,
 * no view), closing exactly the rows those cards took and keeping the gaps the
 * admin left. Taken top to bottom, a shown card's empty run above it (from the
 * lowest shown card above it in its columns, or the top) is split into rows a
 * hidden card in its columns occupied and intentional rows; it lands that many
 * intentional rows below where the shown cards above it now end. A card beside
 * a hidden card (sharing no column with it) keeps its gap. The result has no
 * overlaps and is capped (clampGaps). The stored layout is never changed.
 */
export function collapseHidden(ps: readonly Placement[], shown: ReadonlySet<string>, cols: number): Placement[] {
  const clean = resolveOverlaps(ps, cols)
  const hidden = clean.filter((p) => !shown.has(p.id))
  const visible = clean.filter((p) => shown.has(p.id))
  if (hidden.length === 0) return clampGaps(visible, cols)
  const before: Placement[] = []
  const after: Placement[] = []
  for (const p of [...visible].sort(byPosition)) {
    const top = floorUnder(before, p)
    // The rows in [top, p.y) a hidden card in these columns covered, merged.
    const spans = hidden
      .filter((o) => sharesColumns(o, p) && o.y < p.y && o.y + o.h > top)
      .map((o) => [Math.max(o.y, top), Math.min(o.y + o.h, p.y)] as const)
      .sort((a, b) => a[0] - b[0])
    let hiddenRows = 0
    let reach = top
    for (const [lo, hi] of spans) {
      const from = Math.max(lo, reach)
      if (hi > from) hiddenRows += hi - from
      reach = Math.max(reach, hi)
    }
    before.push(p)
    after.push({ ...p, y: floorUnder(after, p) + (p.y - top - hiddenRows) })
  }
  return inOrder(visible, capGaps(after))
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
 * full width unless the card's phone default is narrower. Compact (no gaps):
 * the large layout's gaps are not carried over to the phone.
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
 * button). The later of the two takes the earlier one's slot, which pushes the
 * earlier one (and whatever it lands on) down, as a drag there would: gaps
 * elsewhere are kept. Moving the first card up or the last card down is a
 * no-op. Cards for which `skip` returns true (hidden ones) are stepped over,
 * so the card swaps with its nearest visible neighbour; with no visible
 * neighbour in that direction it is a no-op.
 */
export function moveInOrder(
  ps: readonly Placement[],
  id: string,
  delta: -1 | 1,
  cols: number,
  skip?: (id: string) => boolean,
): Placement[] {
  const clean = prepare(ps, cols)
  const order = [...clean].sort(byPosition)
  const i = order.findIndex((p) => p.id === id)
  if (i < 0) return clean
  let j = i + delta
  while (skip && j >= 0 && j < order.length && skip(order[j].id)) j += delta
  if (j < 0 || j >= order.length) return clean
  const [mover, anchor] = delta < 0 ? [order[i], order[j]] : [order[j], order[i]]
  return moveCard(clean, mover.id, { x: anchor.x, y: anchor.y }, cols)
}
