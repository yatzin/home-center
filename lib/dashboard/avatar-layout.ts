// The "avatar" looks of an asset card (Properties, Vehicles, Equipment, People)
// at long, thin sizes: a row of round avatars on a one-row card, a column of
// them on a one-column card, a column of name pills on a two-column card.
// Pure, so the shape rules and the fitting arithmetic are testable without a
// browser; the view (components/dashboard/cards/avatar-strip.tsx) measures its
// box and asks avatarFit what to draw.

import type { Size } from "./grid"

/**
 * - `single`: one cell (1x1): one avatar.
 * - `row`: one row tall, 2+ columns wide: a row of avatars (pills with room).
 * - `column-circles`: one column wide, 2+ rows tall: a column of avatars.
 * - `column-pills`: two columns wide, 2+ rows tall: a column of name pills.
 * - `rich`: 3+ columns and 2+ rows: the card's sized tiers (photos, list).
 */
export type AssetLook = "single" | "row" | "column-circles" | "column-pills" | "rich"

/** Avatar diameter on a fine pointer (mouse), in px. */
export const AVATAR_SIZE = 40
/** On a coarse pointer (touch): a 44px target. */
export const AVATAR_SIZE_COARSE = 44
/** Space between avatars, in px. */
export const AVATAR_GAP = 8
/** The smallest an avatar shrinks to in a very narrow column, in px. */
export const AVATAR_MIN_SIZE = 20

const cells = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)
const px = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)
const count = (n: number) => Math.max(0, Math.floor(px(n)))

/**
 * The look for a card of `size` grid cells, as placed in the layout being
 * displayed: raw columns and rows, never scaled for the phone grid (a
 * full-width phone card is 2 wide). A size below one cell counts as one.
 */
export function assetLook(size: Size): AssetLook {
  const w = cells(size.w)
  const h = cells(size.h)
  if (h === 1) return w === 1 ? "single" : "row"
  if (w === 1) return "column-circles"
  if (w === 2) return "column-pills"
  return "rich"
}

/**
 * The avatar diameter for a strip whose box measures `cross` px across (a
 * column's width, a row's height): `target`, or less when the box is
 * narrower, but not below AVATAR_MIN_SIZE. Unmeasured (0/NaN): `target`.
 */
export function avatarSize(target: number, cross: number): number {
  const t = px(target) || AVATAR_SIZE
  const c = px(cross)
  if (c === 0) return t
  return Math.max(AVATAR_MIN_SIZE, Math.min(t, Math.floor(c)))
}

export type AvatarFit = {
  /** Slots of avatar + gap that fit the box's length (at least 1). */
  slots: number
  /** Items to draw, in order (at most the loaded items). */
  shown: number
  /** Items not drawn, including those beyond the loaded limit: total - shown. */
  more: number
  /** Draw a final "+N" chip (`more` > 0 and it has a slot of its own). */
  showMore: boolean
  /** Draw pills (avatar + name) rather than bare avatars. */
  pills: boolean
  /** Width of one pill in a row of pills (the row split evenly), in px. */
  pillWidth: number
}

/**
 * What an avatar strip draws along a box `length` px long (a row's width, a
 * column's height). `itemCount` items are loaded (the card's "Show up to N"
 * already applied) out of `total`. Each slot is `circle` + `gap`; the last one
 * needs no gap. When not everything fits, a final "+N" chip takes the last
 * slot and counts every item not drawn. With one slot only, one avatar and no
 * chip.
 *
 * `pills`: "always" (a two-column card's column), "never" (circles), or
 * "auto" (a row): with n slots in use (items + chip), pills when
 * length / n >= 2 * (circle + gap), i.e. the avatars use half the room or less.
 */
export function avatarFit(args: {
  length: number
  itemCount: number
  total: number
  circle?: number
  gap?: number
  pills: "auto" | "always" | "never"
}): AvatarFit {
  const circle = px(args.circle ?? AVATAR_SIZE) || AVATAR_SIZE
  const gap = px(args.gap ?? AVATAR_GAP)
  const length = px(args.length)
  const itemCount = count(args.itemCount)
  const total = Math.max(itemCount, count(args.total))
  const slot = circle + gap

  const slots = Math.max(1, Math.floor((length + gap) / slot))
  const needed = itemCount + (total > itemCount ? 1 : 0)
  const shown = itemCount === 0 ? 0 : needed <= slots ? itemCount : slots >= 2 ? Math.min(itemCount, slots - 1) : 1
  const more = total - shown
  const showMore = more > 0 && shown + 1 <= slots
  const used = Math.max(1, shown + (showMore ? 1 : 0))

  const pills = args.pills === "always" || (args.pills === "auto" && length > 0 && length / used >= 2 * slot)
  const pillWidth = pills ? Math.max(0, (length - gap * (used - 1)) / used) : circle
  return { slots, shown, more, showMore, pills, pillWidth }
}

// Graphemes, so an emoji (even a ZWJ family) or an accented letter stays whole.
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null
const graphemes = (s: string): string[] => (segmenter ? Array.from(segmenter.segment(s), (g) => g.segment) : [...s])
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

/** Uppercased, unless that changes its length (ß -> SS). */
function upper(g: string): string {
  const u = g.toUpperCase()
  return [...u].length === [...g].length ? u : g
}

/**
 * An avatar's initials: the first letter (or digit) of each of the first two
 * words that have one, uppercased ("Mary Ann Smith" -> "MA", "2019 Honda
 * Civic" -> "2H", "🏠 Lake House" -> "LH"). A name with no letters keeps its
 * first character ("🏠"); an empty name is "?".
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const firsts: string[] = []
  for (const w of words) {
    const g = graphemes(w).find((c) => LETTER_OR_DIGIT.test(c))
    if (g) firsts.push(upper(g))
    if (firsts.length === 2) break
  }
  return firsts.length > 0 ? firsts.join("") : graphemes(words[0])[0]
}
