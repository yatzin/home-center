// Dashboard layout model: shape parsing, validation (what may be saved) and
// repair (what is rendered when stored data is stale or damaged). Pure TS.
import { z } from "zod"
import { clampGaps, LARGE_COLS, MAX_GAP_ROWS, MAX_ROW, PHONE_COLS, type Placement, type Size } from "./grid"

export { LARGE_COLS, PHONE_COLS } from "./grid"
export type { Placement } from "./grid"

export const LAYOUT_FORMAT = 1

export type CardInstance = { id: string; type: string; config: Record<string, unknown> }
/** `phone: null` means the phone layout was never edited and is derived. */
export type DashboardLayout = { format: number; cards: CardInstance[]; large: Placement[]; phone: Placement[] | null }
export type CardLimits = { min: Size; max: Size; default: Size }


const placementSchema = z.object({ id: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })
const layoutSchema = z.object({
  format: z.literal(LAYOUT_FORMAT),
  cards: z.array(z.object({ id: z.string(), type: z.string(), config: z.record(z.string(), z.unknown()) })),
  large: z.array(placementSchema),
  phone: z.array(placementSchema).nullable(),
})

/** Shape check only; use validateLayout/repairLayout for semantics. */
export function parseLayout(raw: unknown): DashboardLayout | null {
  const r = layoutSchema.safeParse(raw)
  return r.success ? r.data : null
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi)
const int = (n: number, fallback: number): number => (Number.isFinite(n) ? Math.round(n) : fallback)

/** Effective size bounds of a card in a grid `cols` wide. */
function bounds(l: CardLimits, cols: number) {
  const minW = clamp(int(l.min.w, 1), 1, cols)
  const maxW = Math.max(minW, Math.min(int(l.max.w, cols), cols))
  const minH = clamp(int(l.min.h, 1), 1, MAX_ROW)
  const maxH = Math.max(minH, Math.min(int(l.max.h, MAX_ROW), MAX_ROW))
  return { minW, maxW, minH, maxH }
}

function defaultSize(l: CardLimits, cols: number): Size {
  const b = bounds(l, cols)
  return { w: clamp(int(l.default.w, b.minW), b.minW, b.maxW), h: clamp(int(l.default.h, b.minH), b.minH, b.maxH) }
}

function repairPlacements(
  cards: readonly CardInstance[],
  ps: readonly Placement[],
  known: ReadonlyMap<string, CardLimits>,
  cols: number,
): Placement[] {
  const typeOf = new Map(cards.map((c) => [c.id, c.type]))
  const seen = new Set<string>()
  const kept: Placement[] = []
  for (const p of ps) {
    const t = typeOf.get(p.id)
    const limits = t === undefined ? undefined : known.get(t)
    if (!limits || seen.has(p.id)) continue
    seen.add(p.id)
    const b = bounds(limits, cols)
    const w = clamp(int(p.w, b.minW), b.minW, b.maxW)
    kept.push({
      id: p.id,
      x: clamp(int(p.x, 0), 0, cols - w),
      y: clamp(int(p.y, 0), 0, MAX_ROW),
      w,
      h: clamp(int(p.h, b.minH), b.minH, b.maxH),
    })
  }
  let bottom = kept.reduce((m, p) => Math.max(m, p.y + p.h), 0)
  for (const c of cards) {
    const limits = known.get(c.type)
    if (!limits || seen.has(c.id)) continue
    seen.add(c.id)
    const s = defaultSize(limits, cols)
    kept.push({ id: c.id, x: 0, y: bottom, ...s })
    bottom += s.h
  }
  // Push overlapping cards down, then apply the gap cap. Valid layouts (gaps
  // of up to MAX_GAP_ROWS included) come back unchanged: no compaction.
  const resolved = clampGaps(kept, cols)
  if (resolved.every((p) => p.y <= MAX_ROW)) return resolved
  // Pathological pile-up pushed cards past the row cap: stack them in one column.
  let y = 0
  return kept.map((p) => {
    const q = { ...p, x: 0, y, h: Math.min(p.h, 20) }
    y += q.h
    return q
  })
}

/** Drops unknown/duplicate cards and orphan placements, adds missing ones, clamps sizes, resolves overlaps, caps gaps. */
export function repairLayout(layout: DashboardLayout, known: ReadonlyMap<string, CardLimits>): DashboardLayout {
  const ids = new Set<string>()
  const cards = layout.cards.filter((c) => {
    if (!known.has(c.type) || ids.has(c.id)) return false
    ids.add(c.id)
    return true
  })
  return {
    ...layout,
    cards,
    large: repairPlacements(cards, layout.large, known, LARGE_COLS),
    phone: layout.phone === null ? null : repairPlacements(cards, layout.phone, known, PHONE_COLS),
  }
}

function validatePlacements(
  name: string,
  ps: readonly Placement[],
  typeOf: ReadonlyMap<string, string>,
  known: ReadonlyMap<string, CardLimits>,
  cols: number,
): string | null {
  const seen = new Set<string>()
  for (const p of ps) {
    if (seen.has(p.id)) return `Duplicate placement id in ${name} layout: ${p.id}`
    seen.add(p.id)
    const t = typeOf.get(p.id)
    if (t === undefined) return `Placement in ${name} layout has no card: ${p.id}`
    const isInt = [p.x, p.y, p.w, p.h].every((n) => Number.isInteger(n))
    if (!isInt) return `Placement ${p.id} in ${name} layout has non-integer values`
    if (p.x < 0 || p.y < 0 || p.w < 1 || p.h < 1) return `Placement ${p.id} in ${name} layout is out of range`
    if (p.x + p.w > cols) return `Placement ${p.id} in ${name} layout is outside the grid`
    if (p.y > MAX_ROW || p.h > MAX_ROW) return `Placement ${p.id} in ${name} layout is too far down`
    const limits = known.get(t)
    if (limits) {
      const b = bounds(limits, cols)
      if (p.w < b.minW || p.w > b.maxW || p.h < b.minH || p.h > b.maxH) {
        return `Placement ${p.id} in ${name} layout is outside its card size limits`
      }
    }
  }
  for (const id of typeOf.keys()) {
    if (!seen.has(id)) return `Card ${id} has no placement in ${name} layout`
  }
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i]
      const b = ps[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        return `Cards ${a.id} and ${b.id} overlap in ${name} layout`
      }
    }
  }
  // The gap cap (grid.ts clampGaps): no card more than MAX_GAP_ROWS empty rows
  // below the lowest card above it in its columns, or below the top.
  for (const p of ps) {
    let floor = 0
    for (const o of ps) {
      if (o.x < p.x + p.w && p.x < o.x + o.w && o.y + o.h <= p.y) floor = Math.max(floor, o.y + o.h)
    }
    if (p.y - floor > MAX_GAP_ROWS) return `Placement ${p.id} in ${name} layout has more than ${MAX_GAP_ROWS} empty rows above it`
  }
  return null
}

/** An error message for a layout that must not be saved, or null when it is fine. */
export function validateLayout(layout: DashboardLayout, known: ReadonlyMap<string, CardLimits>): string | null {
  if (layout.format !== LAYOUT_FORMAT) return `Unsupported layout format: ${layout.format}`
  const typeOf = new Map<string, string>()
  for (const c of layout.cards) {
    if (typeOf.has(c.id)) return `Duplicate card id: ${c.id}`
    if (!known.has(c.type)) return `Unknown card type: ${c.type}`
    typeOf.set(c.id, c.type)
  }
  const large = validatePlacements("large", layout.large, typeOf, known, LARGE_COLS)
  if (large) return large
  return layout.phone ? validatePlacements("phone", layout.phone, typeOf, known, PHONE_COLS) : null
}
