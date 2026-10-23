// The phone placements to render: the stored phone layout when the admin has
// edited it, otherwise one derived from the large layout in reading order.
// Pure TS, so the server component and the tests share it.
import type { Features } from "@/lib/features"
import { cardType } from "./card-types"
import { deriveRowMajor, PHONE_COLS, type Placement, type Size } from "./grid"
import type { DashboardLayout } from "./layout"

const bottomOf = (ps: readonly Placement[]): number => ps.reduce((max, p) => Math.max(max, p.y + p.h), 0)

/** Stacks cards (each at its phone default size) below `y`, one per row, in the given order. */
function stackBelow(ids: readonly string[], sizes: ReadonlyMap<string, Size>, y: number): Placement[] {
  return ids.map((id) => {
    const s = sizes.get(id) ?? { w: PHONE_COLS, h: 1 }
    const p = { id, x: 0, y, w: Math.min(s.w, PHONE_COLS), h: s.h }
    y += s.h
    return p
  })
}

/**
 * Phone placements for exactly the layout's cards (one each, valid on the
 * PHONE_COLS grid). Stored placements win; cards missing from them are
 * appended at the bottom and orphans are dropped. When derived, cards whose
 * feature is off go after the visible ones, so hiding them leaves no gap.
 */
export function resolvePhoneLayout(layout: DashboardLayout, features: Features): Placement[] {
  const sizes = new Map<string, Size>()
  const visible = new Set<string>()
  for (const c of layout.cards) {
    const def = cardType(c.type)
    sizes.set(c.id, def ? { ...def.phone } : { w: PHONE_COLS, h: 1 })
    if (def && (!def.requires || features[def.requires])) visible.add(c.id)
  }

  if (layout.phone !== null) {
    const kept = layout.phone.filter((p) => sizes.has(p.id)).map((p) => ({ ...p }))
    const placed = new Set(kept.map((p) => p.id))
    const missing = layout.cards.map((c) => c.id).filter((id) => !placed.has(id))
    return [...kept, ...stackBelow(missing, sizes, bottomOf(kept))]
  }

  const large = layout.large.filter((p) => sizes.has(p.id))
  const shown = deriveRowMajor(
    large.filter((p) => visible.has(p.id)),
    sizes,
    PHONE_COLS,
  )
  // Hidden cards keep their relative reading order below everything shown.
  const hidden = deriveRowMajor(
    large.filter((p) => !visible.has(p.id)),
    sizes,
    PHONE_COLS,
  )
  const offset = bottomOf(shown)
  const placed = [...shown, ...hidden.map((p) => ({ ...p, y: p.y + offset }))]
  const ids = new Set(placed.map((p) => p.id))
  // repairLayout guarantees every card has a large placement; this is a backstop.
  const missing = layout.cards.map((c) => c.id).filter((id) => !ids.has(id))
  return [...placed, ...stackBelow(missing, sizes, bottomOf(placed))]
}
