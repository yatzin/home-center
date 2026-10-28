"use client"

// An asset card's avatar looks (lib/dashboard/avatar-layout.ts): at long, thin
// sizes the card is nothing but its items' avatars. Round photos (or
// initials), each a link to its item; pills add the name. What does not fit
// becomes a final "+N" chip linking to the list. No title, counts or footer:
// the card frame still names the card for assistive tech (role="group").

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { assetImageSrc } from "@/components/asset-image"
import { useSize } from "@/components/charts/primitives/use-width"
import { assetHref } from "@/lib/assets"
import {
  AVATAR_GAP,
  AVATAR_SIZE,
  AVATAR_SIZE_COARSE,
  avatarFit,
  avatarSize,
  initialsOf,
  type AssetLook,
} from "@/lib/dashboard/avatar-layout"
import type { AssetCardData, AssetCardItem } from "@/lib/dashboard/loaders"
import type { Size } from "@/lib/dashboard/grid"
import { cn } from "@/lib/utils"
import { useCardConfigure } from "./card-configure"
import type { AssetCardSpec } from "./stat-card"

export type AvatarLook = Exclude<AssetLook, "rich">

// ---- Pointer: 44px targets on touch -------------------------------------------

const COARSE = "(pointer: coarse)"

function subscribeCoarse(onChange: () => void) {
  const mq = window.matchMedia(COARSE)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

/** The avatar diameter this device wants (fine pointer on the server). */
function useTargetSize(): number {
  const coarse = useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(COARSE).matches,
    () => false,
  )
  return coarse ? AVATAR_SIZE_COARSE : AVATAR_SIZE
}

// Padding inside the card, and the grid's row pitch for a first-paint
// estimate of the strip's length before it is measured.
const PAD = 10
const MIN_PAD = 4
const ROW_PX = 88
const ROW_GAP = 16
const COL_PX_ESTIMATE = 64

function estimateLength(look: AvatarLook, size: Size): number {
  if (look === "row") return Math.max(1, size.w) * COL_PX_ESTIMATE - 2 * PAD
  return Math.max(1, size.h) * ROW_PX + (Math.max(1, size.h) - 1) * ROW_GAP - 2 * PAD
}

// ---- Pieces ---------------------------------------------------------------------

const ring =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"

/** The round photo or initials (decorative: the link around it carries the name). */
function Face({ spec, item, d }: { spec: AssetCardSpec; item: AssetCardItem; d: number }) {
  const box = { width: d, height: d }
  if (item.imageFilename) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served from a private, auth-gated route
      <img
        src={assetImageSrc(spec.assetType, item.id, item.imageFilename)}
        alt=""
        loading="lazy"
        style={box}
        className="shrink-0 rounded-full object-cover ring-1 ring-border"
      />
    )
  }
  return (
    <span
      aria-hidden
      style={{ ...box, fontSize: Math.max(10, Math.round(d * 0.38)) }}
      className="flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold leading-none text-primary ring-1 ring-primary/20 select-none"
    >
      {initialsOf(item.name)}
    </span>
  )
}

/** The item's name under a focused circle (the native tooltip covers hover). */
function FocusLabel({ text }: { text: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-full left-1/2 z-10 mt-1 hidden max-w-48 -translate-x-1/2 truncate rounded-md bg-popover px-1.5 py-0.5 text-[11px] leading-tight whitespace-nowrap text-popover-foreground shadow-sm ring-1 ring-border group-focus-visible/avatar:block"
    >
      {text}
    </span>
  )
}

function Circle({ spec, item, d }: { spec: AssetCardSpec; item: AssetCardItem; d: number }) {
  return (
    <Link
      href={assetHref(spec.assetType, item.id)}
      aria-label={item.name}
      title={item.name}
      data-avatar=""
      style={{ width: d, height: d }}
      className={cn(
        "group/avatar relative block shrink-0 rounded-full transition-transform duration-150 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100",
        ring,
      )}
    >
      <Face spec={spec} item={item} d={d} />
      <FocusLabel text={item.name} />
    </Link>
  )
}

const pillBox = "flex min-w-0 shrink items-center gap-2 rounded-full bg-muted/60 ring-1 ring-border/70 transition-colors duration-150 hover:bg-muted"

function Pill({ spec, item, d, maxWidth }: { spec: AssetCardSpec; item: AssetCardItem; d: number; maxWidth?: number }) {
  return (
    <Link
      href={assetHref(spec.assetType, item.id)}
      data-avatar-pill=""
      style={{ height: d, maxWidth }}
      className={cn(pillBox, "max-w-full pr-3.5", ring)}
    >
      <Face spec={spec} item={item} d={d} />
      <span className="min-w-0 truncate text-sm font-medium whitespace-nowrap">{item.name}</span>
    </Link>
  )
}

/** "+N": everything not drawn, linking to the list. */
function More({ spec, more, d, pill, maxWidth }: { spec: AssetCardSpec; more: number; d: number; pill: boolean; maxWidth?: number }) {
  const label = `${more} more`
  return (
    <Link
      href={spec.listHref}
      aria-label={label}
      title={pill ? undefined : label}
      data-avatar-more=""
      style={pill ? { height: d, maxWidth } : { width: d, height: d }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground tabular-nums ring-1 ring-border transition-colors duration-150 hover:bg-primary/10 hover:text-primary",
        pill ? "min-w-0 px-3.5 text-sm" : more > 99 ? "text-[10px]" : "text-xs",
        ring,
      )}
    >
      <span className="truncate">{pill ? `+${more} more` : `+${more}`}</span>
    </Link>
  )
}

const placeholder =
  "flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/35 text-muted-foreground"

/**
 * A placeholder in the avatar's place: "?" for a pinned item that no longer
 * exists (in edit mode, for an admin, a button that opens the card's
 * settings), "+" linking to the list when there is nothing yet.
 */
function Placeholder({
  spec,
  kind,
  d,
  pill,
  maxWidth,
}: {
  spec: AssetCardSpec
  kind: "missing" | "empty"
  d: number
  pill: boolean
  maxWidth?: number
}) {
  const configure = useCardConfigure()
  const text = kind === "missing" ? spec.missingMessage : spec.emptyMessage
  const glyph =
    kind === "missing" ? (
      <span aria-hidden className="font-semibold" style={{ fontSize: Math.round(d * 0.4) }}>
        ?
      </span>
    ) : (
      <Plus aria-hidden className="size-1/2" strokeWidth={1.75} />
    )
  const face = (
    <span className={placeholder} style={{ width: d, height: d }}>
      {glyph}
    </span>
  )
  const body = pill ? (
    <>
      {face}
      <span className="min-w-0 truncate pr-3.5 text-sm whitespace-nowrap text-muted-foreground">{text}</span>
    </>
  ) : (
    face
  )
  const shape = cn("flex min-w-0 items-center gap-2 rounded-full", ring, pill && "max-w-full")
  const style = { maxWidth, height: d }

  if (kind === "missing") {
    if (configure) {
      return (
        // Above the editor's drag surface (see EditableCard), like ChooseAnother.
        <button
          type="button"
          onClick={configure}
          aria-label={`${text} Choose another`}
          title={`${text} Choose another`}
          style={style}
          className={cn(shape, "relative z-20 cursor-pointer hover:bg-muted/60")}
        >
          {body}
        </button>
      )
    }
    return (
      <span role="img" aria-label={text} title={text} style={style} className={shape}>
        {body}
      </span>
    )
  }
  return (
    <Link href={spec.listHref} aria-label={`${text}. ${spec.addLabel}`} title={pill ? undefined : text} style={style} className={cn(shape, "hover:bg-muted/60")}>
      {body}
    </Link>
  )
}

// ---- The strip ------------------------------------------------------------------

const LAYOUT: Record<AvatarLook, string> = {
  single: "items-center justify-center",
  row: "flex-row items-center",
  "column-circles": "flex-col items-center",
  "column-pills": "flex-col items-start",
}

export function AvatarStrip({
  spec,
  data,
  look,
  size,
}: {
  spec: AssetCardSpec
  data: AssetCardData
  look: AvatarLook
  /** Grid cells, for a first-paint estimate before the box is measured. */
  size: Size
}) {
  // Measured without padding: the padding across the strip gives way (down to
  // MIN_PAD) before the avatars shrink, so a one-column card on a narrow large
  // grid keeps near-full-size avatars.
  const [boxRef, box] = useSize<HTMLDivElement>()
  const target = useTargetSize()
  const measured = box.width > 0 && box.height > 0
  const row = look === "row"
  const outerCross = measured ? (look === "single" ? Math.min(box.width, box.height) : row ? box.height : box.width) : 0
  const padCross = measured ? Math.max(MIN_PAD, Math.min(PAD, Math.floor((outerCross - target) / 2))) : PAD
  const padMain = look === "single" ? padCross : PAD
  const length = measured ? (row ? box.width : box.height) - 2 * padMain : estimateLength(look, size)
  const d = avatarSize(target, measured ? outerCross - 2 * padCross : 0)
  const padding = row ? `${padCross}px ${padMain}px` : `${padMain}px ${padCross}px`

  const items = data.missing ? [] : data.items
  const total = data.missing ? 0 : data.total
  const placeholderKind = data.missing ? "missing" : total === 0 ? "empty" : null
  const pillsMode = look === "column-pills" ? "always" : row ? "auto" : "never"

  const fit =
    look === "single" || placeholderKind
      ? avatarFit({ length: look === "single" ? 0 : length, itemCount: 1, total: 1, circle: d, pills: look === "single" ? "never" : pillsMode })
      : avatarFit({ length, itemCount: items.length, total, circle: d, pills: pillsMode })
  const shown = placeholderKind ? [] : items.slice(0, look === "single" ? 1 : fit.shown)
  const rowPillWidth = row && fit.pills ? fit.pillWidth : undefined

  return (
    <div ref={boxRef} data-avatar-look={look} className="h-full min-h-0 min-w-0">
      <div className={cn("box-border flex h-full min-h-0 min-w-0", LAYOUT[look])} style={{ gap: AVATAR_GAP, padding }}>
        {placeholderKind ? (
          <Placeholder spec={spec} kind={placeholderKind} d={d} pill={fit.pills} maxWidth={rowPillWidth} />
        ) : (
          <>
            {shown.map((item) =>
              fit.pills ? (
                <Pill key={item.id} spec={spec} item={item} d={d} maxWidth={rowPillWidth} />
              ) : (
                <Circle key={item.id} spec={spec} item={item} d={d} />
              ),
            )}
            {look !== "single" && fit.showMore && <More spec={spec} more={fit.more} d={d} pill={fit.pills} maxWidth={rowPillWidth} />}
          </>
        )}
      </div>
    </div>
  )
}
