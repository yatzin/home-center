"use client"

import { cloneElement, isValidElement, useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { assetImageSrc } from "@/components/asset-image"
import { cn } from "@/lib/utils"
import { assetHref } from "@/lib/assets"
import type { AssetType } from "@/app/generated/prisma/client"

type Thumbnail = { assetType: AssetType; assetId: string; imageFilename: string; name: string }

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
      {/* eslint-disable-next-line @next/next/no-img-element -- served from a private, auth-gated route */}
      <img
        src={assetImageSrc(thumbnail.assetType, thumbnail.assetId, thumbnail.imageFilename)}
        alt={thumbnail.name}
        className={cn("h-full w-full border-card object-cover transition-transform duration-150 hover:scale-105", className)}
      />
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
// Compact thumbnails cap at the 48px the equipment card already used, so a
// small count still looks the way it did before the card got wider.
const COMPACT_FIT: ThumbFit = { min: 24, max: 48, fraction: 0.625 }
// Used for the server render, before the real width is known.
const ASSUMED_WIDTH = 240
// Gap between the end of the thumbnail stack and the text beside it.
const COMPACT_TEXT_GAP = 16

function thumbnailMetrics(count: number, available: number, fit: ThumbFit) {
  const raw = available / (1 + (count - 1) * fit.fraction)
  const size = Math.max(fit.min, Math.min(fit.max, Math.floor(raw)))
  // Derive the step from the clamped size so the row still ends flush right.
  const step = count > 1 ? Math.max(0, Math.min(size, Math.floor((available - size) / (count - 1)))) : 0
  return { size, step, width: size + (count - 1) * step }
}

export function SummaryCard({ icon, label, value, href, urgent, thumbnails, compact }: {
  icon: React.ReactElement<{ className?: string; strokeWidth?: number }>
  label: string; value: number | string; href?: string; urgent?: boolean
  thumbnails?: Thumbnail[]
  compact?: boolean
}) {
  const router = useRouter()

  // Measured rather than assumed: the card's width changes with the breakpoint,
  // so a fixed size would only be right at one of them. The observer callback
  // fires after layout, so this doesn't set state during render.
  const [available, setAvailable] = useState<number | null>(null)
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const metrics = thumbnailMetrics(
    thumbnails?.length ?? 1,
    available ?? ASSUMED_WIDTH,
    compact ? COMPACT_FIT : LARGE_FIT
  )

  const cardClassName = cn(
    "h-full border-t-2 border-t-primary transition-all duration-150",
    href ? "cursor-pointer hover:-translate-y-1 hover:bg-muted hover:shadow-md" : "opacity-70",
    compact ? "py-2.5" : "py-5"
  )

  const content = (
    <CardContent className={cn("relative flex h-full flex-1 flex-col justify-between", compact ? "gap-1.5 px-4" : "gap-3 px-5")}>
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
          <div ref={measureRef} className="flex min-w-0 flex-1 justify-end pl-3">
            {thumbnails.map((t, i) => (
              <ThumbnailLink
                key={t.assetId}
                thumbnail={t}
                className="rounded-xl border-2"
                style={{
                  width: metrics.size,
                  height: metrics.size,
                  marginLeft: i === 0 ? 0 : metrics.step - metrics.size,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Compact cards pull the thumbnails out of the flow and hang them off the
          right edge, vertically centred. In the flow they'd set the row height
          and the card would grow; taken out of it, they can be far larger than
          the 24px icon beside them while the card's height is unchanged. The
          left-24 leaves 96px clear for the value and label. */}
      {compact && thumbnails && thumbnails.length > 0 && (
        <div
          ref={measureRef}
          className="pointer-events-none absolute inset-y-0 left-24 right-3 flex items-center justify-end"
        >
          {thumbnails.map((t, i) => (
            <ThumbnailLink
              key={t.assetId}
              thumbnail={t}
              className="pointer-events-auto rounded-xl border-2 shadow-sm"
              style={{
                width: metrics.size,
                height: metrics.size,
                marginLeft: i === 0 ? 0 : metrics.step - metrics.size,
              }}
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
            ? { paddingRight: metrics.width + COMPACT_TEXT_GAP }
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
