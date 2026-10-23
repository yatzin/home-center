"use client"

// "+ Add card": the card catalog, grouped (Assets, Maintenance & warranties,
// Money, Inbox). A dialog on larger screens, a full-height sheet on phones.
// Each entry shows what the card is (icon, name, description), a tiny
// schematic of what it shows at the size it is added at, and what it grows
// into when made bigger. Only types whose feature is on are offered; adding
// a type that is already on the dashboard is allowed (another instance).

import { useId, useRef } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { availableCardTypes, groupCardTypes, tierOf, type CardTypeDef } from "@/lib/dashboard/card-types"
import type { Features } from "@/lib/features"
import { cn } from "@/lib/utils"
import { CARD_ICONS } from "./card-icons"

const TIER_LABELS: Record<string, string> = {
  count: "Count",
  thumbnails: "Photos",
  list: "List",
  recent: "Recent",
  breakdown: "Breakdown",
  next: "Next up",
  grouped: "By urgency",
  detailed: "Details",
  headline: "Total",
  chart: "Chart",
  bars: "Monthly bars",
  top: "Top category",
  ranked: "Ranked",
  composition: "Composition",
}
const tierLabel = (name: string) => TIER_LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1)

type Schematic = "number" | "photos" | "list" | "chart" | "bars" | "columns"

const SCHEMATICS: Record<string, Schematic> = {
  count: "number",
  headline: "number",
  top: "number",
  thumbnails: "photos",
  chart: "chart",
  bars: "chart",
  breakdown: "bars",
  ranked: "bars",
  composition: "bars",
  grouped: "columns",
}

/** A tiny, token-coloured sketch of what the card shows when added. */
function Preview({ def }: { def: CardTypeDef }) {
  const tier = def.tiers[tierOf(def, def.large)]
  const kind = SCHEMATICS[tier.name] ?? "list"
  const ink = "bg-muted-foreground/30"
  return (
    <div
      aria-hidden
      className="relative flex h-14 w-18 shrink-0 flex-col gap-1 overflow-hidden rounded-lg border-t-2 border-t-primary bg-card p-1.5 ring-1 ring-border"
    >
      <div className={cn("h-1 w-7 rounded-full", ink)} />
      {kind === "number" && (
        <div className="flex flex-1 flex-col justify-center gap-1">
          <div className="h-3 w-8 rounded-sm bg-foreground/60" />
          <div className={cn("h-1 w-11 rounded-full", ink)} />
        </div>
      )}
      {kind === "photos" && (
        <div className="grid flex-1 grid-cols-2 gap-0.5">
          <div className="row-span-2 rounded-sm bg-primary/35" />
          <div className="rounded-sm bg-primary/20" />
          <div className="rounded-sm bg-primary/25" />
        </div>
      )}
      {kind === "list" && (
        <div className="flex flex-1 flex-col justify-center gap-1">
          {[10, 8, 9].map((w, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="size-1.5 rounded-full bg-primary/50" />
              <div className={cn("h-1 rounded-full", ink)} style={{ width: `${w * 4}px` }} />
            </div>
          ))}
        </div>
      )}
      {kind === "chart" && (
        <div className="flex flex-1 items-end gap-0.5">
          {[40, 65, 50, 80, 60, 95].map((h, i) => (
            <div key={i} className="flex-1 rounded-t-[2px] bg-primary/45" style={{ height: `${h}%` }} />
          ))}
        </div>
      )}
      {kind === "bars" && (
        <div className="flex flex-1 flex-col justify-center gap-1">
          {[100, 70, 45, 25].map((w, i) => (
            <div key={i} className="h-1.5 rounded-full bg-primary/45" style={{ width: `${w}%`, opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      )}
      {kind === "columns" && (
        <div className="grid flex-1 grid-cols-3 gap-1">
          {[0, 1, 2].map((c) => (
            <div key={c} className="flex flex-col gap-1 pt-0.5">
              <div className={cn("h-1 rounded-full", c === 0 ? "bg-destructive/50" : "bg-primary/40")} />
              <div className={cn("h-1 w-3/4 rounded-full", ink)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CardTypeOption({ def, count, onPick }: { def: CardTypeDef; count: number; onPick: () => void }) {
  const id = useId()
  const Icon = CARD_ICONS[def.icon]
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Add ${def.label}`}
      aria-describedby={`${id}-desc ${id}-more`}
      className={cn(
        "group flex min-h-11 w-full touch-manipulation items-start gap-3 rounded-xl border border-border/70 bg-background/40 p-3 text-left outline-none",
        "transition-[background-color,border-color,transform] duration-150 hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99]",
        "focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      <Preview def={def} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate font-medium">{def.label}</span>
        </div>
        <p id={`${id}-desc`} className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {def.description}
        </p>
        <div id={`${id}-more`} className="text-[11px] text-muted-foreground/80">
          <p className="mt-1 truncate">
            <span className="sr-only">Shows more as it grows: </span>
            {def.tiers.map((t) => tierLabel(t.name)).join(" → ")}
          </p>
          {count > 0 && (
            <p className="mt-1.5 inline-flex rounded-full bg-muted px-1.5 py-0.5 leading-none text-muted-foreground">
              <span className="sr-only">. </span>
              {count} on dashboard
            </p>
          )}
        </div>
      </div>
      <Plus
        className="mt-0.5 size-4 shrink-0 text-muted-foreground/50 transition-colors duration-150 group-hover:text-primary group-focus-visible:text-primary"
        aria-hidden
      />
    </button>
  )
}

export function AddCardDialog({
  open,
  onOpenChange,
  features,
  counts,
  onPick,
  finalFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  features: Features
  /** Instances of each type already on the dashboard. */
  counts: ReadonlyMap<string, number>
  onPick: (typeId: string) => void
  /** Where focus goes on close: the new card after a pick, else the Add card button (null). */
  finalFocus: () => HTMLElement | null
}) {
  const groups = groupCardTypes(availableCardTypes(features))
  const headingId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        // The first card, not the close button; on touch the sheet itself (no keyboard popping up).
        initialFocus={(type) => (type === "touch" ? true : (listRef.current?.querySelector<HTMLElement>("button") ?? true))}
        finalFocus={() => finalFocus() ?? true}
        className={cn(
          "flex flex-col gap-0 p-0 sm:max-h-[min(46rem,calc(100dvh-4rem))] sm:max-w-2xl",
          // Phones: a full-height sheet rising from the bottom.
          "max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:data-open:slide-in-from-bottom-6 max-sm:data-open:zoom-in-100",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 pt-5 pb-4 max-sm:pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <DialogTitle>Add a card</DialogTitle>
              <DialogDescription>New cards go at the bottom. You can add the same card more than once, each with its own settings.</DialogDescription>
            </div>
            <DialogClose
              render={<Button variant="ghost" size="icon-sm" className="-mt-1 -mr-2 shrink-0 pointer-coarse:size-11" />}
            >
              <X aria-hidden />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </DialogHeader>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4">
          {groups.map((g, i) => (
            <section key={g.label} aria-labelledby={`${headingId}-${i}`} className="mb-4 last:mb-1">
              <h3 id={`${headingId}-${i}`} className="px-1 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {g.label}
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {g.types.map((def) => (
                  <li key={def.id}>
                    <CardTypeOption def={def} count={counts.get(def.id) ?? 0} onPick={() => onPick(def.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
