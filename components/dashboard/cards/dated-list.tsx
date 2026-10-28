"use client"

// The dated-item list cards (Records, Active Warranties, Due Maintenance,
// Reminders, Expiring Warranties) below their rich sizes (lib/dashboard/
// dated-list-layout.ts): a rotating carousel at one row, a headline item with
// compact rows at two, and from three rows a list whose rows are full,
// condensed or slim by width. The count is a small badge, never the hero.
// Each card maps its own data to DatedItems; the rich sizes keep their views.

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, type LucideIcon } from "lucide-react"
import { useSize } from "@/components/charts/primitives/use-width"
import { usePrefersReducedMotion } from "@/components/property-filter-cue"
import {
  CAROUSEL_INTERVAL_MS,
  CAROUSEL_MAX_ITEMS,
  CAROUSEL_NARROW_PX,
  MAX_DOTS,
  dotWindow,
  nextIndex,
  prevIndex,
  rowsThatFit,
  shouldAutoAdvance,
  swipeStep,
  wrapIndex,
  type DatedLook,
} from "@/lib/dashboard/dated-list-layout"
import { cardType } from "@/lib/dashboard/card-types"
import { cn } from "@/lib/utils"
import { CardMessage, CardShell } from "./card-shell"

/** How pressing an item is: late (destructive), soon (amber), or neither. */
export type Tone = "overdue" | "soon" | "neutral"

/** One row of a dated list, already formatted by the card. */
export type DatedItem = {
  id: string
  title: string
  /** The asset it belongs to, or another detail line; null when none. */
  detail: string | null
  href: string
  /** The date or countdown ("Mar 4, 2026", "12d left", "3d late"). */
  meta: string
  /** The same, short, for a narrow chip ("Mar 4", "12d"). */
  short: string
  /** Formatted cost; null when none. */
  cost: string | null
  tone: Tone
  /** More for the tooltip and the carousel ("Expires Nov 8, 2026"). */
  note?: string
}

export type DatedLookName = Exclude<DatedLook, "rich">

/** The dated look a card type's tier is, or null (a rich tier, or not a dated-list type). */
export function datedLookOf(typeId: string, tier: number): DatedLookName | null {
  const look = cardType(typeId)?.tiers[tier]?.look
  return look === "carousel" || look === "headline" || look === "slim" || look === "condensed" || look === "full" ? look : null
}

/** What a card hands its look: its title, list page, icon, items and total. */
export type DatedListSpec = {
  title: string
  href: string
  icon: LucideIcon
  /** Everything there is (the badge), not just the items loaded. */
  total: number
  items: DatedItem[]
  /** Shown instead of the items when there are none. */
  empty: { icon: LucideIcon; message: string; note?: string }
  /** Show it even with items (e.g. reminders for people hidden): the empty state wins. */
  forceEmpty?: boolean
}

// ---- Pieces ---------------------------------------------------------------------

const ring = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

const TONE_TEXT: Record<Tone, string> = {
  overdue: "font-medium text-destructive",
  soon: "text-amber-700 dark:text-amber-400",
  neutral: "text-muted-foreground",
}
const TONE_CHIP: Record<Tone, string> = {
  overdue: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  soon: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  neutral: "bg-secondary text-secondary-foreground",
}
const TONE_DOT: Record<Tone, string> = {
  overdue: "bg-destructive",
  soon: "bg-amber-500",
  neutral: "bg-muted-foreground/35",
}

/** The tooltip: everything the row may not have room for. */
function tooltipOf(item: DatedItem): string {
  return [item.title, item.detail, item.meta, item.note, item.cost].filter(Boolean).join(" — ")
}

/** Overdue and soon get their icon; anything else the card's own (muted). */
function Marker({ tone, icon: Icon }: { tone: Tone; icon: LucideIcon }) {
  if (tone === "overdue") return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
  if (tone === "soon") return <Clock className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
}

function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone], className)} />
}

function Chip({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[11px] font-medium tabular-nums whitespace-nowrap",
        TONE_CHIP[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** The total, small, linking to the full list. Destructive when something is late. */
export function CountBadge({ total, title, href, urgent }: { total: number; title: string; href: string; urgent?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={`View all ${total} ${title}`}
      className={cn(
        "relative inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums transition-colors duration-150",
        // A 24px (44px on touch) target around the small badge.
        "before:absolute before:-inset-x-1 before:-inset-y-0.5 before:content-[''] pointer-coarse:before:-inset-3",
        urgent
          ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
          : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary",
        ring,
      )}
    >
      {total}
    </Link>
  )
}

function DatedHeader({ spec, compact }: { spec: DatedListSpec; compact?: boolean }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2", compact ? "px-4 pt-2.5 pb-1" : "px-5 pt-4 pb-2")}>
      <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium uppercase tracking-wide text-muted-foreground">{spec.title}</h2>
      <CountBadge total={spec.total} title={spec.title} href={spec.href} urgent={spec.items.some((i) => i.tone === "overdue")} />
    </div>
  )
}

export type Density = "full" | "condensed" | "slim"

/** Row heights by density, in px (the headline look fits its compact rows by these). */
const CONDENSED_ROW_PX = 28

/**
 * One item as a link, in three densities: `full` (one line: name, asset, cost,
 * date), `condensed` (one line: name and a short date chip; the rest in the
 * tooltip), `slim` (name, the short date under it; no cost).
 */
export function DatedRow({ item, density, icon }: { item: DatedItem; density: Density; icon: LucideIcon }) {
  const base = cn("group flex min-w-0 rounded-md transition-colors duration-150 hover:bg-muted/60", ring)
  if (density === "full") {
    // The name keeps at least 40% of the row (the asset gives way first); the
    // date is short until the row is wide (the list is an @container).
    return (
      <Link href={item.href} title={tooltipOf(item)} className={cn(base, "items-center gap-2 px-2 py-2 text-sm")}>
        <Marker tone={item.tone} icon={icon} />
        <span className="min-w-[40%] flex-1 truncate font-medium">{item.title}</span>
        {item.detail && <span className="min-w-0 max-w-[35%] shrink truncate text-xs text-muted-foreground">{item.detail}</span>}
        {item.cost && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.cost}</span>}
        <span className={cn("shrink-0 text-xs tabular-nums", TONE_TEXT[item.tone])}>
          <span className="hidden @[26rem]:inline">{item.meta}</span>
          <span className="@[26rem]:hidden">{item.short}</span>
        </span>
      </Link>
    )
  }
  if (density === "condensed") {
    return (
      <Link href={item.href} title={tooltipOf(item)} className={cn(base, "h-7 items-center gap-2 px-2 text-[13px]")}>
        <Dot tone={item.tone} />
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        <Chip tone={item.tone}>{item.short}</Chip>
      </Link>
    )
  }
  return (
    <Link href={item.href} title={tooltipOf(item)} className={cn(base, "flex-col px-2 py-1")}>
      <span className="truncate text-[13px] leading-[18px] font-medium">{item.title}</span>
      <span className={cn("flex min-w-0 items-center gap-1.5 text-[11px] leading-4 tabular-nums", TONE_TEXT[item.tone])}>
        <Dot tone={item.tone} />
        <span className="truncate">{item.short}</span>
      </span>
    </Link>
  )
}

/**
 * The two-row look's first item: name, then its date chip, asset and cost.
 * Narrow (an @container under 15rem): the short date, and the cost only in
 * the tooltip.
 */
function HeadlineItem({ item, icon }: { item: DatedItem; icon: LucideIcon }) {
  return (
    <Link
      href={item.href}
      title={tooltipOf(item)}
      className={cn("@container block rounded-md px-2 py-1 text-sm transition-colors duration-150 hover:bg-muted/60", ring)}
    >
      <span className="flex items-center gap-2">
        <Marker tone={item.tone} icon={icon} />
        <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-2 pl-5.5">
        <Chip tone={item.tone}>
          <span className="hidden @[15rem]:inline">{item.meta}</span>
          <span className="@[15rem]:hidden">{item.short}</span>
        </Chip>
        {item.detail && <span className="min-w-0 truncate text-xs text-muted-foreground">{item.detail}</span>}
        {item.cost && <span className="ml-auto hidden shrink-0 text-xs tabular-nums text-muted-foreground @[15rem]:inline">{item.cost}</span>}
      </span>
    </Link>
  )
}

// ---- Looks ----------------------------------------------------------------------

function HeadlineLook({ spec }: { spec: DatedListSpec }) {
  const [restRef, { height }] = useSize<HTMLDivElement>()
  const [first, ...rest] = spec.items
  // Until measured (server, first paint) assume the room a 2-row card has: two rows.
  const fit = height > 0 ? rowsThatFit(height, CONDENSED_ROW_PX, 2) : 2
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DatedHeader spec={spec} compact />
      <div className="shrink-0 px-2">
        <HeadlineItem item={first} icon={spec.icon} />
      </div>
      <div ref={restRef} className="min-h-0 flex-1 overflow-hidden px-2 pt-0.5">
        <ul>
          {rest.slice(0, fit).map((item) => (
            <li key={item.id}>
              <DatedRow item={item} density="condensed" icon={spec.icon} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ListLook({ spec, density }: { spec: DatedListSpec; density: Density }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DatedHeader spec={spec} />
      <div className="@container min-h-0 flex-1 overflow-y-auto">
        <ul className={cn("px-3 pb-2", density === "full" ? "space-y-0.5" : "space-y-px")}>
          {spec.items.map((item) => (
            <li key={item.id}>
              <DatedRow item={item} density={density} icon={spec.icon} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---- Carousel -------------------------------------------------------------------

const COARSE = "(pointer: coarse)"

function subscribeCoarse(onChange: () => void) {
  const mq = window.matchMedia(COARSE)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}
const useCoarsePointer = () =>
  useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(COARSE).matches,
    () => false,
  )

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange)
  return () => document.removeEventListener("visibilitychange", onChange)
}
const useDocumentHidden = () =>
  useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  )

/** Dot hit areas, in px: 24 (44 on touch); the visible dot is smaller. */
const DOT_HIT = 24
const DOT_HIT_COARSE = 44
/** Arrow strip widths, in px (44 on touch). */
const ARROW_W = 28
const ARROW_W_COARSE = 44

/**
 * One row: one item at a time, moving on every few seconds (not while
 * hovered, focused, pressed, hidden, edited, or with reduced motion), with
 * prev/next arrows at the edges, page dots along the bottom, swipe and
 * Left/Right keys. The slide is a link to its item; the arrows and dots sit
 * beside it, never inside it.
 */
function CarouselLook({ spec, editing }: { spec: DatedListSpec; editing: boolean }) {
  const items = spec.items.slice(0, CAROUSEL_MAX_ITEMS)
  const count = items.length
  const [rawIndex, setIndex] = useState(0)
  const index = wrapIndex(rawIndex, count)
  // The direction of the last change, for the slide-in (none on first paint).
  const [dir, setDir] = useState<0 | 1 | -1>(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [boxRef, { width }] = useSize<HTMLDivElement>()
  const reducedMotion = usePrefersReducedMotion()
  const hidden = useDocumentHidden()
  const coarse = useCoarsePointer()
  const touch = useRef<{ id: number; x: number; y: number } | null>(null)
  const swiped = useRef(false)

  // Unmeasured or display:none (the other layout's copy): hold still.
  const running = shouldAutoAdvance({
    paused: hovered || focused || pressed || width === 0,
    hidden,
    reducedMotion,
    editing,
    count,
  })

  const go = (step: 1 | -1) => {
    setDir(step)
    setIndex((i) => (step === 1 ? nextIndex(wrapIndex(i, count), count) : prevIndex(wrapIndex(i, count), count)))
  }
  const goTo = (i: number) => {
    if (i === index) return
    setDir(i > index ? 1 : -1)
    setIndex(i)
  }

  // A fresh full interval after every change, manual or not.
  useEffect(() => {
    if (!running) return
    const id = setTimeout(() => {
      setDir(1)
      setIndex((i) => nextIndex(wrapIndex(i, count), count))
    }, CAROUSEL_INTERVAL_MS)
    return () => clearTimeout(id)
  }, [running, index, count])

  // A press that ends outside the carousel still ends.
  useEffect(() => {
    if (!pressed) return
    const up = () => setPressed(false)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => {
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
    }
  }, [pressed])

  const item = items[index]
  const multi = count > 1
  const narrow = width > 0 && width < CAROUSEL_NARROW_PX
  const arrowW = coarse ? ARROW_W_COARSE : ARROW_W
  const dotHit = coarse ? DOT_HIT_COARSE : DOT_HIT
  // Dots that fit between the arrows (at least 3: the active one and its neighbours).
  const room = width > 0 ? width - (narrow ? 8 : 2 * arrowW) : MAX_DOTS * dotHit
  const dots = multi ? dotWindow(count, index, Math.max(3, Math.min(MAX_DOTS, Math.floor(room / dotHit)))) : []
  const showBadge = width === 0 || width >= 240
  const pad = multi && !narrow ? arrowW : 12

  return (
    <div
      ref={boxRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={spec.title}
      className="group/carousel relative h-full min-h-0 touch-pan-y overflow-hidden select-none"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
      // Keyboard focus holds it; a mouse click on an arrow or dot does not
      // (hover already does, and the focus would outlast the pointer).
      onFocus={(e) => setFocused(e.target.matches(":focus-visible"))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
      onPointerDown={(e) => {
        setPressed(true)
        swiped.current = false
        touch.current = e.pointerType === "touch" && multi ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null
      }}
      onPointerUp={(e) => {
        const start = touch.current
        touch.current = null
        if (!start || start.id !== e.pointerId) return
        const step = swipeStep({
          dx: e.clientX - start.x,
          dy: e.clientY - start.y,
        })
        if (step !== 0) {
          swiped.current = true
          go(step)
        }
      }}
      onPointerCancel={() => {
        touch.current = null
      }}
      // A swipe that ends on the slide is not a tap on its link.
      onClickCapture={(e) => {
        if (swiped.current) {
          swiped.current = false
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onKeyDown={(e) => {
        if (!multi || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
        if (e.key === "ArrowRight") {
          e.preventDefault()
          go(1)
        } else if (e.key === "ArrowLeft") {
          e.preventDefault()
          go(-1)
        }
      }}
    >
      <div aria-live={running ? "off" : "polite"} className="h-full">
        {/* The slide and its link stay mounted (keyboard focus stays on the
            link as the slides change); only the content re-mounts, to animate. */}
        <div role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${count}`} className="h-full">
          <Link
            href={item.href}
            title={tooltipOf(item)}
            draggable={false}
            className={cn(
              "flex h-full min-w-0 flex-col justify-center transition-colors duration-150 hover:bg-muted/40",
              // Clear of the dots along the bottom.
              multi ? (coarse ? "pt-1 pb-10" : "pt-1 pb-5") : "py-2",
              ring,
            )}
            style={{ paddingLeft: pad, paddingRight: pad }}
          >
            <span
              key={item.id + ":" + index}
              className={cn(
                "flex min-w-0 flex-col gap-0.5",
                dir === 1 && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-3 motion-safe:duration-300",
                dir === -1 && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-3 motion-safe:duration-300",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Marker tone={item.tone} icon={spec.icon} />
                <span className="min-w-0 flex-1 truncate text-sm leading-5 font-semibold">{item.title}</span>
                {showBadge && (
                  <span
                    aria-hidden
                    title={`${spec.total} in all`}
                    className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground"
                  >
                    {spec.total}
                  </span>
                )}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 pl-5 text-xs leading-4">
                <span className={cn("shrink-0 tabular-nums", TONE_TEXT[item.tone])}>{item.meta}</span>
                {/* Narrow: the asset is in the tooltip; a squeezed "·" alone says nothing. */}
                {item.detail && !narrow && <span className="min-w-0 truncate text-muted-foreground">· {item.detail}</span>}
                {item.cost && !narrow && <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{item.cost}</span>}
              </span>
            </span>
          </Link>
        </div>
      </div>
      <span className="sr-only">
        {spec.total} in all{item.note ? `. ${item.note}` : ""}
      </span>

      {multi && (
        <>
          <ArrowButton side="left" narrow={narrow} width={arrowW} coarse={coarse} onClick={() => go(-1)} />
          <ArrowButton side="right" narrow={narrow} width={arrowW} coarse={coarse} onClick={() => go(1)} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
            {dots.map((d) => (
              <button
                key={d.index}
                type="button"
                aria-label={`Go to item ${d.index + 1} of ${count}`}
                aria-current={d.active ? "true" : undefined}
                onClick={() => goTo(d.index)}
                className={cn("group/dot pointer-events-auto flex items-end justify-center rounded-full", ring)}
                style={{ width: dotHit, height: dotHit }}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mb-2 block rounded-full transition-all duration-200 motion-reduce:transition-none",
                    d.active
                      ? "h-1.5 w-3.5 bg-primary"
                      : cn("bg-muted-foreground/40 group-hover/dot:bg-muted-foreground/70", d.edge ? "size-1" : "size-1.5"),
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ArrowButton({
  side,
  narrow,
  width,
  coarse,
  onClick,
}: {
  side: "left" | "right"
  narrow: boolean
  width: number
  coarse: boolean
  onClick: () => void
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  const label = side === "left" ? "Previous item" : "Next item"
  if (narrow) {
    // A very narrow card: small buttons over the slide's edges, shown on hover
    // or focus (touch swipes; keys work either way).
    return (
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "absolute top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-muted-foreground shadow-sm ring-1 ring-border",
          "opacity-0 transition-opacity duration-150 group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100 focus-visible:opacity-100",
          side === "left" ? "left-0.5" : "right-0.5",
          ring,
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </button>
    )
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        // Full height: the dots are sized to fit between the arrows, never under them.
        "group/arrow absolute inset-y-0 flex items-center justify-center text-muted-foreground/70 hover:text-foreground",
        side === "left" ? "left-0" : "right-0",
        ring,
      )}
      // The chevron centred on the slide's text, which sits above the dots.
      style={{ width, paddingBottom: coarse ? 40 : 20 }}
    >
      <span className="flex size-6 items-center justify-center rounded-full transition-colors duration-150 group-hover/arrow:bg-muted">
        <Icon className="size-4" aria-hidden />
      </span>
    </button>
  )
}

// ---- Entry ----------------------------------------------------------------------

/** The empty (or hidden) state, fitted to the look: one line at one row. */
function EmptyLook({ spec, look }: { spec: DatedListSpec; look: DatedLookName }) {
  const { icon: Icon, message, note } = spec.empty
  if (look === "carousel") {
    return (
      <div className="flex h-full min-w-0 items-center gap-2 px-4" title={note ? `${message} ${note}` : message}>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60" strokeWidth={1.5} aria-hidden />
        <p className="min-w-0 truncate text-[13px] text-muted-foreground">
          {message}
          {note && <span className="sr-only"> {note}</span>}
        </p>
      </div>
    )
  }
  return (
    <CardShell title={spec.title} href={look === "headline" ? undefined : spec.href}>
      <CardMessage icon={Icon} message={message} note={note} />
    </CardShell>
  )
}

/** A dated-list card at one of its looks (the card's rich tiers are its own). */
export function DatedListLook({ spec, look, editing }: { spec: DatedListSpec; look: DatedLookName; editing: boolean }) {
  const empty = spec.forceEmpty || spec.items.length === 0
  return (
    <div data-dated-look={empty ? `${look}-empty` : look} className="h-full min-h-0">
      {empty ? (
        <EmptyLook spec={spec} look={look} />
      ) : look === "carousel" ? (
        <CarouselLook spec={spec} editing={editing} />
      ) : look === "headline" ? (
        <HeadlineLook spec={spec} />
      ) : (
        <ListLook spec={spec} density={look} />
      )}
    </div>
  )
}
