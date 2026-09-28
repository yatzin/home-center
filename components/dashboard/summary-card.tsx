"use client"

import { cloneElement, isValidElement } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { assetImageSrc } from "@/components/asset-image"
import { cn } from "@/lib/utils"
import { assetHref } from "@/lib/assets"
import { initialsOf, firstNameOf, softColorOf } from "@/lib/asset-visuals"
import type { AssetType } from "@/app/generated/prisma/client"

type Thumbnail = { assetType: AssetType; assetId: string; imageFilename: string | null; name: string }

// A soft-colored initials tile in place of a photo, for anything without one —
// used everywhere a thumbnail would otherwise be, not just the hero rows. For
// people specifically, the first name reads better than two letters.
function InitialsTile({ thumbnail, className }: { thumbnail: Thumbnail; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center px-1 text-center", className)} style={softColorOf(thumbnail.assetId)}>
      {thumbnail.assetType === "PERSON" ? firstNameOf(thumbnail.name) : initialsOf(thumbnail.name)}
    </div>
  )
}

function ThumbnailLink({
  thumbnail,
  className,
  style,
}: {
  thumbnail: Thumbnail
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <Link
      href={assetHref(thumbnail.assetType, thumbnail.assetId)}
      onClick={(e) => e.stopPropagation()}
      className="block shrink-0"
      style={style}
    >
      {thumbnail.imageFilename ? (
        // eslint-disable-next-line @next/next/no-img-element -- served from a private, auth-gated route
        <img
          src={assetImageSrc(thumbnail.assetType, thumbnail.assetId, thumbnail.imageFilename)}
          alt={thumbnail.name}
          className={cn("h-full w-full border-card object-cover transition-transform duration-150 hover:scale-105", className)}
        />
      ) : (
        <InitialsTile thumbnail={thumbnail} className={cn("h-full w-full", className)} />
      )}
    </Link>
  )
}

// Cards size their thumbnails to the room they actually have: a few photos get
// big and spread out, many get smaller and tighter, and the stack lands on the
// same right edge either way.
type ThumbFit = { min: number; max: number; fraction: number }

const LARGE_FIT: ThumbFit = {
  min: 44,
  // Above ~91px the thumbnail row is taller than the space the old layout left
  // for it, so the large cards (and with them the dashboard's first row) get
  // taller. That's accepted here in exchange for a low count reading big.
  max: 110,
  // Fraction of each thumbnail left visible before the next one overlaps it.
  fraction: 0.7,
}
// Compact thumbnails run ~20% larger than the 48px/0.625 pair the equipment
// card used before it got wider: a smaller visible fraction buys the extra
// size out of overlap, and the cap keeps the stack inside the card's height.
const COMPACT_FIT: ThumbFit = { min: 24, max: 58, fraction: 0.48 }
// Gap between the end of the thumbnail stack and the text beside it.
const COMPACT_TEXT_GAP = 16
// Everything the strip does NOT get: the icon and its gutter on a large card,
// the reserved text column and the right inset on a compact one.
const LARGE_RESERVE = 44
const COMPACT_RESERVE = 92

// The sizes are expressed in CSS rather than measured in JS on purpose. A
// measured layout can only be right after hydration, so the first paint uses a
// guessed width and the thumbnails visibly snap when the real one arrives.
// 100cqw is the card content's own width, known to the very first paint, and it
// keeps tracking the card through resizes for free.
function thumbnailVars(count: number, fit: ThumbFit, reserve: number) {
  const divisor = 1 + (count - 1) * fit.fraction
  const available = `(100cqw - ${reserve}px)`
  return {
    "--thumb-size": `clamp(${fit.min}px, calc(${available} / ${divisor}), ${fit.max}px)`,
    // Derive the step from the clamped size so the row still ends flush right.
    "--thumb-step":
      count > 1
        ? `min(var(--thumb-size), calc((${available} - var(--thumb-size)) / ${count - 1}))`
        : "0px",
    "--thumb-stack": `calc(var(--thumb-size) + ${count - 1} * var(--thumb-step))`,
  } as React.CSSProperties
}

const THUMB_STYLE: React.CSSProperties = { width: "var(--thumb-size)", aspectRatio: "1" }
const THUMB_OVERLAP_STYLE: React.CSSProperties = {
  ...THUMB_STYLE,
  marginLeft: "calc(var(--thumb-step) - var(--thumb-size))",
}

export function SummaryCard({ icon, label, value, href, urgent, thumbnails, compact, hero }: {
  icon: React.ReactElement<{ className?: string; strokeWidth?: number }>
  label: string; value: number | string; href?: string; urgent?: boolean
  thumbnails?: Thumbnail[]
  compact?: boolean
  /** Demo alternative to the thumbnail-strip treatment: the most recent photo
   * fills the top of the card as a real photo instead of a small corner strip,
   * with the count/label as its own row underneath. */
  hero?: boolean
}) {
  const router = useRouter()

  const thumbVars = thumbnailVars(
    thumbnails?.length ?? 1,
    compact ? COMPACT_FIT : LARGE_FIT,
    compact ? COMPACT_RESERVE : LARGE_RESERVE
  )

  const cardClassName = cn(
    "h-full border-t-2 border-t-primary transition-all duration-150",
    href ? "cursor-pointer hover:-translate-y-1 hover:bg-muted hover:shadow-md" : "opacity-70",
    compact ? "py-2.5" : "py-5"
  )

  if (hero && thumbnails && thumbnails.length > 0) {
    // Large cards get a mosaic (one big tile plus a stacked column or 2x2
    // grid); compact, full-width cards like Equipment instead get a single
    // row — up to 8 equal tiles, cropped to fill whatever width each gets,
    // so a handful of items still fill the row instead of floating at a
    // fixed small size. Either way, a count badge lands on the last tile
    // when there are more photos than are shown.
    const shown = thumbnails.slice(0, compact ? 8 : 4)
    const remaining = thumbnails.length - shown.length
    const mosaicClass = compact
      ? undefined
      : shown.length <= 1 ? "grid-cols-1" : shown.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2"
    const mosaicStyle = compact ? { gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` } : undefined

    return (
      <Card className={cn(cardClassName, "gap-0 py-0")}>
        <div
          className={cn(
            "grid gap-0.5 overflow-hidden rounded-t-xl bg-card",
            compact ? "h-30" : "h-64",
            mosaicClass
          )}
          style={mosaicStyle}
        >
          {shown.map((t, i) => (
            <Link
              key={t.assetId}
              href={assetHref(t.assetType, t.assetId)}
              className={cn("group relative block overflow-hidden", !compact && shown.length === 3 && i === 0 && "row-span-2")}
            >
              {t.imageFilename ? (
                // eslint-disable-next-line @next/next/no-img-element -- served from a private, auth-gated route
                <img
                  src={assetImageSrc(t.assetType, t.assetId, t.imageFilename)}
                  alt={t.name}
                  className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
                />
              ) : (
                <InitialsTile thumbnail={t} className={cn("h-full w-full", compact ? "text-base" : "text-2xl")} />
              )}
              {i === shown.length - 1 && remaining > 0 && (
                <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                  +{remaining} more
                </span>
              )}
            </Link>
          ))}
        </div>
        {(() => {
          const statRow = (
            <>
              <div>
                <div className={cn(compact ? "text-lg font-semibold leading-none tabular-nums" : "text-[28px] font-semibold leading-none tabular-nums", urgent && "text-destructive")}>
                  {value}
                </div>
                <div className={cn("font-medium uppercase tracking-wide text-muted-foreground", compact ? "mt-1 text-[10px]" : "mt-2 text-xs")}>{label}</div>
              </div>
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-lg",
                  compact ? "h-6 w-6" : "h-8 w-8",
                  urgent ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                )}
              >
                {isValidElement(icon) && cloneElement(icon, { className: compact ? "h-3.5 w-3.5" : "h-4 w-4", strokeWidth: 1.75 })}
              </div>
            </>
          )
          const rowClassName = cn("flex items-center justify-between gap-3", compact ? "px-4 py-1" : "px-5 py-1")
          return href ? (
            <Link href={href} className={cn(rowClassName, "transition-colors duration-150 hover:bg-muted")}>{statRow}</Link>
          ) : (
            <div className={rowClassName}>{statRow}</div>
          )
        })()}
      </Card>
    )
  }

  // @container makes CardContent the reference for the 100cqw in the thumbnail
  // sizes, so the strip and the text padding both measure the same width.
  const content = (
    <CardContent className={cn("@container relative flex h-full flex-1 flex-col justify-between", compact ? "gap-1.5 px-4" : "gap-3 px-5")}>
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex items-center justify-center rounded-lg",
            compact ? "h-6 w-6" : "h-8 w-8",
            urgent ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          )}
        >
          {isValidElement(icon) && cloneElement(icon, { className: compact ? "h-3.5 w-3.5" : "h-4 w-4", strokeWidth: 1.75 })}
        </div>
        {/* Large cards keep their thumbnails in the flow, beside the icon, and
            size themselves to whatever width is left over. */}
        {!compact && thumbnails && thumbnails.length > 0 && (
          <div className="flex min-w-0 flex-1 justify-end pl-3" style={thumbVars}>
            {thumbnails.map((t, i) => (
              <ThumbnailLink
                key={t.assetId}
                thumbnail={t}
                className="rounded-xl border-2"
                style={i === 0 ? THUMB_STYLE : THUMB_OVERLAP_STYLE}
              />
            ))}
          </div>
        )}
      </div>

      {/* Compact cards pull the thumbnails out of the flow and hang them off the
          right edge, vertically centred. In the flow they'd set the row height
          and the card would grow; taken out of it, they can be far larger than
          the 24px icon beside them while the card's height is unchanged. The
          left-28 leaves 112px clear for the value and label. */}
      {compact && thumbnails && thumbnails.length > 0 && (
        <div
          // Centred vertically, so a larger thumbnail takes evenly from the
          // space above and below rather than riding up against the top edge.
          className="pointer-events-none absolute inset-y-0 left-28 right-3 flex items-center justify-end"
          style={thumbVars}
        >
          {thumbnails.map((t, i) => (
            <ThumbnailLink
              key={t.assetId}
              thumbnail={t}
              className="pointer-events-auto rounded-xl border-2 shadow-sm"
              style={i === 0 ? THUMB_STYLE : THUMB_OVERLAP_STYLE}
            />
          ))}
        </div>
      )}

      {/* whitespace-nowrap so a squeezed label clips rather than wrapping —
          wrapping would add a line and change the card's height. */}
      <div
        className="whitespace-nowrap"
        style={
          compact && thumbnails && thumbnails.length > 0
            ? { ...thumbVars, paddingRight: `calc(var(--thumb-stack) + ${COMPACT_TEXT_GAP}px)` }
            : undefined
        }
      >
        <div className={cn(compact ? "text-lg font-semibold leading-none tabular-nums" : "text-[28px] font-semibold leading-none tabular-nums", urgent && "text-destructive")}>
          {value}
        </div>
        {/* The half-width compact cards are narrower than their own labels, so
            those wrap instead of clipping. Grid stretch keeps the row level. */}
        <div className={cn("font-medium uppercase tracking-wide text-muted-foreground", compact ? "mt-1 text-[10px] whitespace-normal break-words" : "mt-2 text-xs")}>
          {label}
        </div>
      </div>
    </CardContent>
  )

  // Cards with thumbnails need their own nested links (to the specific
  // asset), so the card itself can't be a single outer <a> — anchors can't
  // nest. Fall back to a click/keyboard handler on a div instead.
  if (thumbnails && thumbnails.length > 0) {
    return (
      <div
        className="h-full"
        role={href ? "link" : undefined}
        tabIndex={href ? 0 : undefined}
        onClick={href ? () => router.push(href) : undefined}
        onKeyDown={href ? (e) => { if (e.key === "Enter") router.push(href) } : undefined}
      >
        <Card className={cardClassName}>{content}</Card>
      </div>
    )
  }

  if (!href) return <div className="h-full"><Card className={cardClassName}>{content}</Card></div>

  return (
    <Link href={href} className="block h-full">
      <Card className={cardClassName}>{content}</Card>
    </Link>
  )
}
