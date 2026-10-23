"use client"

import Link from "next/link"
import { EyeOff, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ExpiringItem, ExpiringWarrantiesCardData } from "@/lib/dashboard/loaders"
import { groupByMonth } from "@/lib/dashboard/shaping"
import { CardMessage, CardShell, GroupHeading } from "./card-shell"
import type { CardViewProps } from "./types"

// Expiring Warranties: the next one to expire, then a dated list, then (wide) by month.

const TIER_NEXT = 0
const TIER_LIST = 1

function isExpiringData(data: unknown): data is ExpiringWarrantiesCardData {
  return (
    typeof data === "object" &&
    data !== null &&
    "windowDays" in data &&
    typeof data.windowDays === "number" &&
    "total" in data &&
    typeof data.total === "number" &&
    "items" in data &&
    Array.isArray(data.items)
  )
}

function Row({ item }: { item: ExpiringItem }) {
  return (
    <Link
      href={item.href}
      title={item.assetName ? `${item.productName} — ${item.assetName}` : item.productName}
      className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm transition-colors duration-150 hover:bg-muted/60"
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.productName}</span>
      {item.assetName && <span className="min-w-0 max-w-[40%] shrink truncate text-xs text-muted-foreground">{item.assetName}</span>}
      <Badge variant="secondary" className="shrink-0 text-xs">
        {item.daysLeft}d
      </Badge>
    </Link>
  )
}

/** The smallest tier: name, then expiry and countdown on a second line. */
function NextRow({ item }: { item: ExpiringItem }) {
  return (
    <Link
      href={item.href}
      title={item.assetName ? `${item.productName} — ${item.assetName}` : item.productName}
      className="block rounded-md px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted/60"
    >
      <span className="flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{item.productName}</span>
      </span>
      <span className="mt-1 flex items-center gap-2 pl-5.5">
        <Badge variant="secondary" className="shrink-0 text-xs">
          {item.daysLeft}d
        </Badge>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{item.assetName ?? item.expires}</span>
      </span>
    </Link>
  )
}

export function ExpiringWarrantiesCard({ data, tier }: CardViewProps) {
  if (!isExpiringData(data)) throw new Error("Unexpected Expiring Warranties card data")
  const title = "Expiring Warranties"
  const href = "/warranties"

  if (data.hidden) {
    return (
      <CardShell title={title} href={href}>
        <CardMessage icon={EyeOff} message="Warranties for people are hidden." note="Turn on Health in Settings to see them." />
      </CardShell>
    )
  }
  if (data.items.length === 0) {
    return (
      <CardShell title={title} href={href}>
        <CardMessage icon={ShieldCheck} message={`No warranties expiring in the next ${data.windowDays} days.`} />
      </CardShell>
    )
  }

  if (tier === TIER_NEXT) {
    const next = data.items[0]
    return (
      <CardShell title={title} href={href}>
        <div className="px-3">
          <NextRow item={next} />
          <p className="px-2 pt-1 text-xs text-muted-foreground">Expires {next.expires}</p>
          {data.total > 1 && <p className="px-2 pt-1 text-xs text-muted-foreground">+{data.total - 1} more expiring</p>}
        </div>
      </CardShell>
    )
  }

  const footer =
    data.total > data.items.length ? (
      <p className="px-4 pb-3 pt-1 text-xs text-muted-foreground">
        Showing {data.items.length} of {data.total} expiring
      </p>
    ) : null

  if (tier === TIER_LIST) {
    return (
      <CardShell title={title} href={href} scroll>
        <ul className="space-y-0.5 px-3 pb-2">
          {data.items.map((item) => (
            <li key={item.id}>
              <Row item={item} />
            </li>
          ))}
        </ul>
        {footer}
      </CardShell>
    )
  }

  const months = groupByMonth(data.items)
  return (
    <CardShell title={title} href={href} scroll>
      <div className="@container">
        <div className="gap-x-4 px-3 pb-2 @3xl:columns-2">
          {months.map((m) => (
            <section key={m.key} aria-label={m.label} className="mb-3 break-inside-avoid">
              <GroupHeading label={m.label} count={m.items.length} />
              <ul className="space-y-0.5">
                {m.items.map((item) => (
                  <li key={item.id}>
                    <Row item={item} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {footer}
      </div>
    </CardShell>
  )
}
