// Pointer and keyboard geometry for dashboard edit mode: turns pixels and
// arrow keys into grid cells. Pure TS. It only proposes positions and sizes;
// the reducer (edit-state.ts) and grid.ts decide what actually happens
// (limits, collisions, gravity), so a proposal can never break the layout.
import { moveCard, type Placement, type Size } from "./grid"

/** Pixels from one column (row) to the next, gap included. */
export type Pitch = { x: number; y: number }
export type Point = { x: number; y: number }
/** Which resize handle: the right edge, the bottom edge, or the bottom-right corner. */
export type ResizeEdge = "right" | "bottom" | "corner"

const finite = (n: number): number => (Number.isFinite(n) ? n : 0)

/** Grid pitch for a canvas `width` px wide; 0 across while the width is unknown. */
export function gridPitch(width: number, cols: number, rowHeight: number, gap: number): Pitch {
  return { x: width > 0 && cols > 0 ? (width + gap) / cols : 0, y: rowHeight + gap }
}

/** Cells moved by `px` pixels at `pitch`, to the nearest cell (0 when the pitch is unknown). */
function cells(px: number, pitch: number): number {
  return pitch > 0 ? Math.round(finite(px) / pitch) : 0
}

/**
 * The cell a dragged card's top-left corner is nearest to, after the pointer
 * moved `delta` px from where the drag began, kept inside the grid.
 */
export function snapMove(origin: { x: number; y: number; w: number }, delta: Point, pitch: Pitch, cols: number): Point {
  const x = origin.x + cells(delta.x, pitch.x)
  const y = origin.y + cells(delta.y, pitch.y)
  return { x: Math.min(Math.max(x, 0), Math.max(cols - origin.w, 0)), y: Math.max(y, 0) }
}

/** The size a resize handle proposes after moving `delta` px; at least 1x1. */
export function snapResize(origin: Size, delta: Point, edge: ResizeEdge, pitch: Pitch): Size {
  return {
    w: edge === "bottom" ? origin.w : Math.max(1, origin.w + cells(delta.x, pitch.x)),
    h: edge === "right" ? origin.h : Math.max(1, origin.h + cells(delta.y, pitch.y)),
  }
}

/** One-cell move for an arrow key, or null for any other key. */
export function moveKeyStep(key: string): Point | null {
  switch (key) {
    case "ArrowLeft":
      return { x: -1, y: 0 }
    case "ArrowRight":
      return { x: 1, y: 0 }
    case "ArrowUp":
      return { x: 0, y: -1 }
    case "ArrowDown":
      return { x: 0, y: 1 }
    default:
      return null
  }
}

/** One-unit size change for an arrow key on a resize handle; null when that handle does not use the key. */
export function resizeKeyStep(edge: ResizeEdge, key: string): Size | null {
  const step = moveKeyStep(key)
  if (!step) return null
  const horizontal = step.x !== 0
  if (horizontal && edge === "bottom") return null
  if (!horizontal && edge === "right") return null
  return { w: step.x, h: step.y }
}

/**
 * Where to move a card for one keyboard step in `dir`: the nearest target that
 * actually changes its position under the grid's rules (gravity can float a
 * one-row step down straight back up, so the step grows until the card really
 * moves, e.g. past the card below it). Null when it cannot move that way.
 */
export function stepMove(ps: readonly Placement[], id: string, dir: Point, cols: number): Point | null {
  const card = ps.find((q) => q.id === id)
  if (!card || (dir.x === 0 && dir.y === 0)) return null
  const bottom = ps.reduce((max, q) => Math.max(max, q.y + q.h), 0)
  const limit = Math.max(cols, bottom) + 1
  for (let k = 1; k <= limit; k++) {
    const to = { x: card.x + dir.x * k, y: card.y + dir.y * k }
    if (to.x < 0 || to.x + card.w > cols || to.y < 0 || to.y > bottom) return null
    const moved = moveCard(ps, id, to, cols).find((q) => q.id === id)
    if (moved && (moved.x !== card.x || moved.y !== card.y)) return to
  }
  return null
}

/**
 * The page draws a compacted copy of the layout without hidden cards (feature
 * off), so a card's drawn cell can differ from its stored one. A target picked
 * in drawn cells is applied as the same offset from the stored origin.
 */
export function drawnToStored(target: Point, drawnOrigin: Point, storedOrigin: Point): Point {
  return {
    x: Math.max(0, storedOrigin.x + target.x - drawnOrigin.x),
    y: Math.max(0, storedOrigin.y + target.y - drawnOrigin.y),
  }
}
