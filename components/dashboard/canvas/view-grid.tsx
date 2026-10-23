"use client"

import { useState } from "react"
import { LayoutGrid, Loader2 } from "lucide-react"
import { cardType, configFieldsFor } from "@/lib/dashboard/card-types"
import type { CanvasCardData } from "@/lib/dashboard/card-data"
import { compact, LARGE_COLS, PHONE_COLS, type Placement, type Size } from "@/lib/dashboard/grid"
import type { DashboardLayout } from "@/lib/dashboard/layout"
import { resolvePhoneLayout } from "@/lib/dashboard/resolve-phone"
import type { Features } from "@/lib/features"
import { cn } from "@/lib/utils"
import { CARD_VIEWS } from "@/components/dashboard/cards"
import { CardConfigureProvider } from "@/components/dashboard/cards/card-configure"
import { CardFrame } from "./card-frame"
import { CardGear } from "./card-gear"
import { CARD_ICONS } from "./card-icons"
import { GAP, ROW_HEIGHT } from "./grid-metrics"
import { useCardTier, type LayoutMode } from "./use-card-tier"

// Both layouts are in the markup at once: each card carries its phone and its
// large placement as CSS variables, and a container query on the canvas's own
// width (LARGE_MIN_WIDTH, 40rem) picks one. Measuring the canvas rather than
// the viewport keeps a tablet with the sidebar open on the phone layout. The
// server and the first client render are identical, so there is no hydration
// mismatch and no layout flash.
//
// Tiers follow the same rule: when a card's phone and large tiers differ, both
// views are rendered and CSS shows the right one (images load lazily, so the
// hidden copy costs no downloads). When they agree, the view renders once.
//
// The `/dash` container name keeps these queries pointed at the canvas even if
// a card view declares its own @container.

export type { CanvasCardData } from "@/lib/dashboard/card-data"

/** Shown on the dashboard: a known card type with a view, whose feature is on. */
export function isShownType(type: string, features: Features): boolean {
  const def = cardType(type)
  return def !== undefined && (!def.requires || features[def.requires]) && Object.hasOwn(CARD_VIEWS, type)
}

const GRID_STYLE = {
  "--dash-row": `${ROW_HEIGHT}px`,
  "--dash-gap": `${GAP}px`,
  "--dash-cols-phone": PHONE_COLS,
  "--dash-cols-large": LARGE_COLS,
} as React.CSSProperties

const span = (start: number, length: number) => `${start + 1} / span ${length}`

/** Eases a card's content in when its tier changes (not on first paint). Reduced motion: no animation. */
export function TierFade({ tier, children }: { tier: number; children: React.ReactNode }) {
  const [shown, setShown] = useState(tier)
  const [changed, setChanged] = useState(false)
  if (shown !== tier) {
    setShown(tier)
    setChanged(true)
  }
  return (
    <div key={tier} className={cn("h-full min-h-0", changed && "chart-fade")}>
      {children}
    </div>
  )
}

/**
 * A card the page has no data for yet (just added, or put back by Reset to
 * default): its name over a calm skeleton until the refresh brings its data.
 */
function CardSetup({ type }: { type: string }) {
  const def = cardType(type)
  const Icon = def ? CARD_ICONS[def.icon] : LayoutGrid
  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-hidden px-5 pt-4 pb-3">
      <div className="flex shrink-0 items-center gap-2 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{cardTitle(type)}</span>
      </div>
      <div aria-hidden className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden motion-safe:animate-pulse">
        <div className="h-5 w-1/3 shrink-0 rounded-md bg-muted" />
        <div className="h-3 w-3/4 shrink-0 rounded bg-muted/70" />
        <div className="h-3 w-1/2 shrink-0 rounded bg-muted/70" />
      </div>
      <p className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden />
        Setting up…
      </p>
    </div>
  )
}

/**
 * A card's view at a tier; a skeleton while its data is on the way; dimmed
 * with an "Updating" chip while it shows data loaded for its previous settings.
 */
export function CardView({
  card,
  tier,
  size,
  mode,
  editing,
}: {
  card: CanvasCardData
  tier: number
  size: Size
  mode: LayoutMode
  editing: boolean
}) {
  const View = CARD_VIEWS[card.type]
  if (card.status === "loading" || !View) return <CardSetup type={card.type} />
  const data = card.status === "ok" ? card.data : null
  const view = (
    <TierFade tier={tier}>
      <View data={data} config={card.config} tier={tier} size={size} mode={mode} editing={editing} />
    </TierFade>
  )
  if (!card.updating) return view
  return (
    <div className="relative h-full min-h-0">
      <div className="h-full min-h-0 opacity-50 motion-safe:transition-opacity motion-safe:duration-300">{view}</div>
      <span
        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-popover/95 px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm ring-1 ring-border motion-safe:animate-in motion-safe:fade-in-0"
      >
        <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden />
        Updating
      </span>
    </div>
  )
}

/** No data yet, or data for older settings: the card is aria-busy until it arrives. */
export function isBusy(card: CanvasCardData): boolean {
  return card.status === "loading" || card.updating === true
}

export function cardTitle(type: string): string {
  return cardType(type)?.label ?? "Card"
}

function CanvasCard({
  card,
  large,
  phone,
  onConfigure,
}: {
  card: CanvasCardData
  large: Placement
  phone: Placement
  onConfigure?: () => void
}) {
  const largeSize: Size = { w: large.w, h: large.h }
  const phoneSize: Size = { w: phone.w, h: phone.h }
  const largeTier = useCardTier(card.type, largeSize, "large")
  const phoneTier = useCardTier(card.type, phoneSize, "phone")

  return (
    <div
      data-card-id={card.id}
      className="relative min-h-0 min-w-0 [grid-column:var(--dash-pc)] [grid-row:var(--dash-pr)] @min-[40rem]/dash:[grid-column:var(--dash-lc)] @min-[40rem]/dash:[grid-row:var(--dash-lr)]"
      style={
        {
          "--dash-pc": span(phone.x, phone.w),
          "--dash-pr": span(phone.y, phone.h),
          "--dash-lc": span(large.x, large.w),
          "--dash-lr": span(large.y, large.h),
        } as React.CSSProperties
      }
    >
      <CardConfigureProvider value={onConfigure ?? null}>
        <CardFrame title={cardTitle(card.type)} failed={card.status === "error"} busy={isBusy(card)}>
          {largeTier === phoneTier ? (
            <CardView card={card} tier={largeTier} size={largeSize} mode="large" editing={false} />
          ) : (
            <>
              <div className="h-full min-h-0 @min-[40rem]/dash:hidden">
                <CardView card={card} tier={phoneTier} size={phoneSize} mode="phone" editing={false} />
              </div>
              <div className="hidden h-full min-h-0 @min-[40rem]/dash:block">
                <CardView card={card} tier={largeTier} size={largeSize} mode="large" editing={false} />
              </div>
            </>
          )}
        </CardFrame>
      </CardConfigureProvider>
      {onConfigure && configFieldsFor(card.type).length > 0 && (
        <CardGear
          cardTitle={cardTitle(card.type)}
          onClick={onConfigure}
          className="absolute -top-3.5 -right-3.5 z-10 pointer-coarse:-top-5.5 pointer-coarse:-right-5.5"
        />
      )}
    </div>
  )
}

/** The dashboard as configured (no edit controls), for one layout and its cards. */
export function ViewGrid({
  cards,
  layout,
  features,
  onConfigure,
}: {
  cards: readonly CanvasCardData[]
  layout: DashboardLayout
  features: Features
  /** Edit mode on small screens: a settings gear on configurable cards, and "Choose another" on a card whose item is gone. */
  onConfigure?: (id: string) => void
}) {
  const largeById = new Map(layout.large.map((p) => [p.id, p]))
  const phoneById = new Map(resolvePhoneLayout(layout, features).map((p) => [p.id, p]))
  const shown = cards.filter((c) => CARD_VIEWS[c.type] && largeById.has(c.id) && phoneById.has(c.id))

  if (shown.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <LayoutGrid className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
        <p className="text-sm text-muted-foreground">
          {layout.cards.length === 0 ? "Your dashboard has no cards yet." : "There's nothing to show on the dashboard right now."}
        </p>
      </div>
    )
  }

  // Display only: cards that are not shown (feature off, unknown type, no view
  // yet) would leave holes, so the shown ones float up. The stored layout is
  // untouched.
  const ids = new Set(shown.map((c) => c.id))
  const large = new Map(compact(layout.large.filter((p) => ids.has(p.id)), LARGE_COLS).map((p) => [p.id, p]))
  const phone = new Map(compact([...phoneById.values()].filter((p) => ids.has(p.id)), PHONE_COLS).map((p) => [p.id, p]))

  return (
    <div className="@container/dash">
      <div
        className="grid auto-rows-(--dash-row) grid-cols-[repeat(var(--dash-cols-phone),minmax(0,1fr))] gap-(--dash-gap) @min-[40rem]/dash:grid-cols-[repeat(var(--dash-cols-large),minmax(0,1fr))]"
        style={GRID_STYLE}
      >
        {shown.map((card) => (
          <CanvasCard
            key={card.id}
            card={card}
            large={large.get(card.id)!}
            phone={phone.get(card.id)!}
            onConfigure={onConfigure && (() => onConfigure(card.id))}
          />
        ))}
      </div>
    </div>
  )
}
