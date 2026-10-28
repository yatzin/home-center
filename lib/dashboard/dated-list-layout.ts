// The looks of the dated-item list cards (Records, Active Warranties, Due
// Maintenance, Reminders, Expiring Warranties) below their rich sizes, and the
// arithmetic of the one-row carousel. Pure, so the size rules and the carousel
// math are testable without a browser; the views (components/dashboard/cards/
// dated-list.tsx) measure their box and ask these what to draw.

import type { Size } from "./grid"

/**
 * By height first, then (3+ rows) by width, in large-grid columns:
 * - `carousel`: one row, any width: one item at a time, rotating.
 * - `headline`: two rows, any width: the most important item, then compact rows.
 * - `slim`: 3+ rows, 2 columns or fewer: short name, date under it.
 * - `condensed`: 3+ rows, 3 columns: one line per item, name and a short date chip.
 * - `full`: 3+ rows, 4-5 columns: full rows (name, asset, date, cost).
 * - `rich`: 3+ rows, 6+ columns: the card's sized tiers, as before (its list,
 *   or Reminders' and Expiring Warranties' grouped columns).
 */
export type DatedLook = "carousel" | "headline" | "slim" | "condensed" | "full" | "rich"

/** Auto-advance interval of the carousel, in ms. */
export const CAROUSEL_INTERVAL_MS = 6000
/** Horizontal travel, in px, that turns a touch drag into a swipe. */
export const SWIPE_THRESHOLD = 40
/** Page dots shown at most; with more items the dots are a window around the active one. */
export const MAX_DOTS = 7
/** Below this measured width (px) the carousel's arrows shrink to small overlay buttons. */
export const CAROUSEL_NARROW_PX = 200
/** Slides at most on a card without a `limit` setting (its loader's list length). */
export const CAROUSEL_MAX_ITEMS = 8

const cells = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)

/**
 * The look for a card `size` grid cells big, in large-grid columns (tierOf
 * scales a phone card's width first, as for any sized tier: a full-width phone
 * card is ~360px, about four large columns). A size below one cell counts as one.
 */
export function datedLook(size: Size): DatedLook {
  const w = cells(size.w)
  const h = cells(size.h)
  if (h === 1) return "carousel"
  if (h === 2) return "headline"
  if (w <= 2) return "slim"
  if (w === 3) return "condensed"
  if (w <= 5) return "full"
  return "rich"
}

// ---- Carousel ---------------------------------------------------------------------

/** `i` brought into [0, count) with wrap-around; 0 when there are no items (or `i` is not a number). */
export function wrapIndex(i: number, count: number): number {
  const c = Math.floor(count)
  if (!(c > 0) || !Number.isFinite(i)) return 0
  return ((Math.trunc(i) % c) + c) % c
}

export const nextIndex = (i: number, count: number): number => wrapIndex(i + 1, count)
export const prevIndex = (i: number, count: number): number => wrapIndex(i - 1, count)

export type Dot = {
  index: number
  active: boolean
  /** At the window's edge with more items beyond it on that side: drawn smaller. */
  edge: boolean
}

/**
 * The page dots to draw for `count` items with `active` the current one: all
 * of them up to `max`, otherwise a window of `max` around the active one
 * (centred where it can be, pinned at the ends). An out-of-range `active` is
 * clamped.
 */
export function dotWindow(count: number, active: number, max: number = MAX_DOTS): Dot[] {
  const n = Math.max(0, Math.floor(count))
  if (n === 0) return []
  const a = Math.min(n - 1, Math.max(0, Math.floor(Number.isFinite(active) ? active : 0)))
  const size = Math.min(n, Math.max(1, Math.floor(max)))
  const start = Math.min(n - size, Math.max(0, a - Math.floor(size / 2)))
  const end = start + size - 1
  const dots: Dot[] = []
  for (let index = start; index <= end; index++) {
    const isActive = index === a
    const edge = !isActive && ((index === start && start > 0) || (index === end && end < n - 1))
    dots.push({ index, active: isActive, edge })
  }
  return dots
}

/**
 * A touch drag's effect: 1 (next) for a swipe left, -1 (previous) for a swipe
 * right, 0 when it travelled less than `threshold` px sideways or more
 * vertically than sideways (a page scroll, which is left alone).
 */
export function swipeStep({ dx, dy, threshold = SWIPE_THRESHOLD }: { dx: number; dy: number; threshold?: number }): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0
  if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy)) return 0
  return dx < 0 ? 1 : -1
}

/**
 * Whether the carousel moves on by itself: not while something holds it
 * (`paused`: hovered, focused within, pressed), the tab is hidden, the OS asks
 * for reduced motion or the dashboard is being edited, and only with 2+ items.
 */
export function shouldAutoAdvance(s: { paused: boolean; hidden: boolean; reducedMotion: boolean; editing: boolean; count: number }): boolean {
  return !s.paused && !s.hidden && !s.reducedMotion && !s.editing && s.count > 1
}

/** Whole rows of `rowHeight` px that fit in `available` px, at most `max` (0 when unmeasured). */
export function rowsThatFit(available: number, rowHeight: number, max: number): number {
  if (!Number.isFinite(available) || !(available > 0) || !(rowHeight > 0)) return 0
  return Math.max(0, Math.min(Math.floor(max), Math.floor(available / rowHeight)))
}
