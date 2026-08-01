"use client"

import { cloneElement, isValidElement } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { assetImageSrc } from "@/components/asset-image"
import { cn } from "@/lib/utils"
import type { AssetType } from "@/app/generated/prisma/client"

function assetHref(assetType: AssetType, assetId: string) {
  return assetType === "PROPERTY" ? `/assets/properties/${assetId}` : `/assets/vehicles/${assetId}`
}

type Thumbnail = { assetType: AssetType; assetId: string; imageFilename: string; name: string }

export function SummaryCard({ icon, label, value, href, urgent, thumbnails, compact }: {
  icon: React.ReactElement<{ className?: string; strokeWidth?: number }>
  label: string; value: number | string; href?: string; urgent?: boolean
  thumbnails?: Thumbnail[]
  compact?: boolean
}) {
  const router = useRouter()
  const cardClassName = cn(
    "h-full border-t-2 border-t-primary transition-all duration-150",
    href ? "cursor-pointer hover:-translate-y-1 hover:bg-muted hover:shadow-md" : "opacity-70",
    compact ? "py-2.5" : "py-5"
  )

  const content = (
    <CardContent className={cn("flex h-full flex-1 flex-col justify-between", compact ? "gap-1.5 px-4" : "gap-3 px-5")}>
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
        {thumbnails && thumbnails.length > 0 && (
          <div className="flex -space-x-6">
            {thumbnails.map((t) => (
              <Link
                key={t.assetId}
                href={assetHref(t.assetType, t.assetId)}
                onClick={(e) => e.stopPropagation()}
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- served from a private, auth-gated route */}
                <img
                  src={assetImageSrc(t.assetType, t.assetId, t.imageFilename)}
                  alt={t.name}
                  className="h-16 w-16 rounded-xl border-2 border-card object-cover transition-transform duration-150 hover:scale-105"
                />
              </Link>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className={cn(compact ? "text-lg font-semibold leading-none tabular-nums" : "text-[28px] font-semibold leading-none tabular-nums", urgent && "text-destructive")}>
          {value}
        </div>
        <div className={cn("font-medium uppercase tracking-wide text-muted-foreground", compact ? "mt-1 text-[10px]" : "mt-2 text-xs")}>
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
