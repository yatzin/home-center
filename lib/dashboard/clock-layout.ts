// The Clock card's looks and how it fills its box. Size is a lens: one column
// shows the time alone (the date too when tall), two columns the time over the
// date, and from two rows an analog face with the time. clockLook picks the
// look from grid cells (like datedLook); fitClock then sizes it to the card's
// measured content box: the biggest time that fits, the longest date form that
// fits under it, and a face that never runs under the Edit button. The view
// places everything at the boxes layoutBoxes gives, so what the tests check is
// what renders. Text widths are estimates on the generous side (12 themes, 12
// fonts); the view clips as a backstop.
import type { ClockFace } from "./clock"
import type { Size } from "./grid"

export type ClockLook = "time" | "standard" | "face"

/** Large-grid columns one phone column counts as (card-types' PHONE_WIDTH_SCALE; not imported, to keep this module free of the catalog). */
const PHONE_SCALE = 2

/**
 * The look at a size. One column: the time. Two or more: the time over the
 * date, and from two rows (face auto or always) the analog face. With face
 * always, a one-row card 3+ columns wide shows a small face beside the time;
 * never keeps it digital. A phone column counts as two large ones.
 */
export function clockLook(size: Size, mode: "large" | "phone", face: ClockFace): ClockLook {
  const w = mode === "phone" ? size.w * PHONE_SCALE : size.w
  if (w < 2) return "time"
  if (face === "never") return "standard"
  if (size.h >= 2) return "face"
  if (face === "always" && w >= 3) return "face"
  return "standard"
}

export type ClockFitInput = {
  look: ClockLook
  /** The content box, px (inside the card's padding). */
  width: number
  height: number
  showDate: boolean
  /** The seconds show (Show seconds). */
  seconds: boolean
  /** 12-hour time: an AM/PM after the time. */
  period: boolean
  /** The Edit dashboard button sits in the top-right corner. */
  edit: boolean
  /** The date forms to choose from, longest (preferred) first. */
  dates: readonly string[]
}

export type ClockFit = {
  /** May differ from the input's: a face with no room falls back to "standard", anything cramped to "time". */
  look: ClockLook
  /** face: beside the time (row) or above it (column). */
  direction: "row" | "column"
  /** The face's diameter, px; 0 for none. */
  face: number
  /** The time's font size, px (0 when the box is not measured yet). */
  timePx: number
  datePx: number
  /** The date form shown, or null. */
  date: string | null
  /** Where the seconds and AM/PM go: after the time (stacked when both), under it, or nowhere. */
  suffix: "inline" | "stacked" | "none"
  /** The button says "Edit" (else icon only). */
  editLabel: boolean
  /** The button's height (and width when icon only), px. */
  editSize: number
}

export type Box = { x: number; y: number; w: number; h: number }
export type ClockBoxes = { time: Box; date: Box | null; face: Box | null; edit: Box | null }

// Em widths, generous: tabular digits, the colon, an average date character.
const DIGIT = 0.66
const COLON = 0.34
/** "10:42", the widest hours and minutes, so the size never changes as the time does. */
const HM_EM = 4 * DIGIT + COLON
/** The seconds and AM/PM, at SUFFIX_SCALE of the time. */
export const SUFFIX_SCALE = 0.4
const SUFFIX_W = 1.7
const SUFFIX_GAP = 0.14
const CHAR_EM = 0.62
const DATE_LINE = 1.4

const LABELLED_EDIT_W = 76
/** Between the button and anything beside it. */
const EDIT_GAP = 8
const FACE_MIN = 56
const FACE_MAX = 280
const FACE_GAP = 14
const TIME_MIN = 10

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const datePxOf = (t: number) => clamp(Math.round(t * 0.34), 11, 18)
export const dateGapOf = (t: number) => Math.max(3, Math.round(t * 0.12))

function timeBoxSize(t: number, suffix: ClockFit["suffix"]): { w: number; h: number } {
  if (suffix === "inline") return { w: (HM_EM + SUFFIX_GAP + SUFFIX_SCALE * SUFFIX_W) * t, h: t }
  if (suffix === "stacked") return { w: HM_EM * t, h: t * (1.06 + SUFFIX_SCALE * 1.2) }
  return { w: HM_EM * t, h: t }
}

const dateWidth = (text: string, px: number) => text.length * CHAR_EM * px

function editBox(fit: Pick<ClockFit, "editLabel" | "editSize">, width: number): Box {
  const w = fit.editLabel ? LABELLED_EDIT_W : fit.editSize
  return { x: width - w, y: 0, w, h: fit.editSize }
}

/** Where each part goes in the content box, for a fit. */
export function layoutBoxes(fit: ClockFit, i: Pick<ClockFitInput, "width" | "height" | "edit">): ClockBoxes {
  const W = i.width
  const H = i.height
  const edit = i.edit ? editBox(fit, W) : null
  const t = timeBoxSize(fit.timePx, fit.suffix)
  const dateH = fit.date ? fit.datePx * DATE_LINE : 0
  const dateW = fit.date ? dateWidth(fit.date, fit.datePx) : 0
  const gap = fit.date ? dateGapOf(fit.timePx) : 0
  const blockH = t.h + gap + dateH
  const blockW = Math.max(t.w, dateW)

  // Lines of a block at (x, y): left-aligned, or centred on x + w/2.
  const lines = (x: number, y: number, centred: boolean): Pick<ClockBoxes, "time" | "date"> => ({
    time: { x: centred ? x + (blockW - t.w) / 2 : x, y, w: t.w, h: t.h },
    date: fit.date ? { x: centred ? x + (blockW - dateW) / 2 : x, y: y + t.h + gap, w: dateW, h: dateH } : null,
  })

  if (fit.look === "face" && fit.face > 0) {
    const D = fit.face
    if (fit.direction === "row") {
      const face = { x: 0, y: (H - D) / 2, w: D, h: D }
      return { ...lines(D + FACE_GAP, (H - blockH) / 2, false), face, edit }
    }
    const top = (H - (D + FACE_GAP + blockH)) / 2
    const face = { x: (W - D) / 2, y: top, w: D, h: D }
    return { ...lines((W - blockW) / 2, top + D + FACE_GAP, true), face, edit }
  }
  if (fit.look === "standard") return { ...lines(0, (H - blockH) / 2, false), face: null, edit }
  // time: centred in what is left under the button.
  const top = edit ? edit.h + 4 : 0
  return { ...lines((W - blockW) / 2, top + (H - top - blockH) / 2, true), face: null, edit }
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function circleClear(face: Box, r: Box): boolean {
  const radius = face.w / 2
  const cx = face.x + radius
  const cy = face.y + radius
  const nx = clamp(cx, r.x, r.x + r.w)
  const ny = clamp(cy, r.y, r.y + r.h)
  return Math.hypot(cx - nx, cy - ny) >= radius
}

const EPS = 0.01

function fits(fit: ClockFit, i: ClockFitInput): boolean {
  const b = layoutBoxes(fit, i)
  const inside = (r: Box) => r.x >= -EPS && r.y >= -EPS && r.x + r.w <= i.width + EPS && r.y + r.h <= i.height + EPS
  for (const r of [b.time, b.date, b.face, b.edit]) if (r && !inside(r)) return false
  if (b.edit) {
    // Kept clear of the button by a little more than the button itself.
    const e = { x: b.edit.x - EDIT_GAP, y: b.edit.y, w: b.edit.w + EDIT_GAP, h: b.edit.h + 4 }
    if (overlaps(b.time, e)) return false
    if (b.date && overlaps(b.date, e)) return false
    if (b.face && !circleClear(b.face, e)) return false
  }
  return true
}

/** The biggest time (from `cap` down to `min`) that fits, with the longest date form that fits too; null when none does. */
function largest(
  base: Omit<ClockFit, "timePx" | "datePx" | "date">,
  i: ClockFitInput,
  cap: number,
  min: number,
  withDate: boolean,
): ClockFit | null {
  for (let t = Math.floor(cap); t >= min; t--) {
    if (withDate) {
      const datePx = datePxOf(t)
      for (const date of i.dates) {
        const fit = { ...base, timePx: t, datePx, date }
        if (fits(fit, i)) return fit
      }
    } else {
      const fit = { ...base, timePx: t, datePx: 0, date: null }
      if (fits(fit, i)) return fit
    }
  }
  return null
}

/** Sizes the look to the content box. */
export function fitClock(i: ClockFitInput): ClockFit {
  const W = Math.max(0, i.width)
  const H = Math.max(0, i.height)
  const box = { ...i, width: W, height: H }
  const editSize = W < 100 || H < 64 ? 24 : 28
  const editLabel = i.edit && i.look !== "time" && W >= 260
  const suffix: ClockFit["suffix"] = i.seconds || i.period ? "inline" : "none"
  const base = { look: i.look, direction: "column" as const, face: 0, suffix, editLabel, editSize }
  const date = i.showDate && i.dates.length > 0
  const empty: ClockFit = { ...base, timePx: 0, datePx: 0, date: null }
  if (W <= 0 || H <= 0) return empty

  if (i.look === "face") {
    const column = (): ClockFit | null => {
      // A calm time under a face that takes the rest.
      const tCap = Math.min(48, Math.max(18, H * 0.13))
      for (let t = Math.floor(tCap); t >= 16; t--) {
        for (const withDate of date ? [true, false] : [false]) {
          const datePx = withDate ? datePxOf(t) : 0
          const blockH = timeBoxSize(t, suffix).h + (withDate ? dateGapOf(t) + datePx * DATE_LINE : 0)
          const dMax = Math.floor(Math.min(W, H - blockH - FACE_GAP, FACE_MAX))
          for (let D = dMax; D >= FACE_MIN; D -= 2) {
            for (const d of withDate ? i.dates : [null]) {
              const fit: ClockFit = { ...base, direction: "column", face: D, timePx: t, datePx, date: d }
              if (fits(fit, box)) return fit
            }
          }
        }
      }
      return null
    }
    const row = (): ClockFit | null => {
      // The face as tall as the card, the time beside it as big as it gets.
      const dMax = Math.floor(Math.min(H, W * 0.45, FACE_MAX))
      const tMin = Math.max(20, Math.min(32, H * 0.2))
      for (let D = dMax; D >= FACE_MIN; D -= 2) {
        const faceBase = { ...base, direction: "row" as const, face: D }
        const fit =
          (date ? largest(faceBase, box, Math.min(56, H), tMin, true) : null) ?? largest(faceBase, box, Math.min(56, H), tMin, false)
        if (fit) return fit
      }
      return null
    }
    // Whichever arrangement gives the bigger face; a wide card prefers the face beside the time when they are close.
    const c = column()
    const r = W >= H ? row() : null
    const wide = W >= H * 1.25
    const best = !c ? r : !r ? c : wide ? (r.face >= c.face * 0.92 ? r : c) : c.face >= r.face * 0.92 ? c : r
    if (best) return best
    // No room for a face worth reading: the digital look.
    return fitClock({ ...i, look: "standard" })
  }

  if (i.look === "standard") {
    const cap = Math.min(96, Math.max(40, H * 0.45))
    const std = { ...base, look: "standard" as const }
    const fit = (date ? largest(std, box, cap, 14, true) : null) ?? largest(std, box, cap, TIME_MIN, false)
    if (fit) return fit
    // Too cramped beside the button: the time under it.
    return fitClock({ ...i, look: "time" })
  }

  // time: the suffix after the time, or under it when that makes the time bigger.
  const tall = date && H >= 150
  const options: ClockFit["suffix"][] = suffix === "none" ? ["none"] : ["inline", "stacked"]
  let best: ClockFit | null = null
  for (const s of options) {
    const timeBase = { ...base, look: "time" as const, editLabel: false, suffix: s }
    const fit = (tall ? largest(timeBase, box, 64, 14, true) : null) ?? largest(timeBase, box, 64, TIME_MIN, false)
    // Stacked only when it buys a clearly bigger time.
    if (fit && (!best || fit.timePx > best.timePx * (s === "stacked" ? 1.15 : 1))) best = fit
  }
  return best ?? { ...base, look: "time", editLabel: false, timePx: TIME_MIN, datePx: 0, date: null }
}
