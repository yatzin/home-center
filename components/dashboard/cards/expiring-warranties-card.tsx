"use client"

import Link from "next/link"
import { EyeOff, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cardType } from "@/lib/dashboard/card-types"
import type { ExpiringItem, ExpiringWarrantiesCardData } from "@/lib/dashboard/loaders"
import { groupByMonth } from "@/lib/dashboard/shaping"
import { CardMessage, CardShell, GroupHeading } from "./card-shell"
import { useViewerIsAdmin } from "./card-configure"
import { WARRANTY_SOON_DAYS } from "./count-card"
import { DatedListLook, datedLookOf, type DatedItem } from "./dated-list"
import type { CardViewProps } from "./types"

// Expiring Warranties: below the rich size the dated-list looks (dated-list.tsx:
// one row a carousel, two the next to expire with compact rows, then slim /
// condensed / full rows); from 6 columns and 3 rows the dated list as before,
// and with 4+ rows by month. Soonest first.

function toDatedItem(item: ExpiringItem): DatedItem {
  return {
    id: item.id,
    title: item.productName,
    detail: item.assetName,
    href: item.href,
    meta: `${item.daysLeft}d left`,
    short: `${item.daysLeft}d`,
    cost: null,
    tone: item.daysLeft <= WARRANTY_SOON_DAYS ? "soon" : "neutral",
    note: `Expires ${item.expires}`,
  }
}

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

export function ExpiringWarrantiesCard({ data, tier, editing }: CardViewProps) {
  const isAdmin = useViewerIsAdmin()
  if (!isExpiringData(data)) throw new Error("Unexpected Expiring Warranties card data")
  const title = "Expiring Warranties"
  const href = "/warranties"

  const look = datedLookOf("expiring-warranties", tier)
  if (look) {
    const hiddenNote = isAdmin ? "Turn on Health in Settings to see them." : undefined
    return (
      <DatedListLook
        look={look}
        editing={editing}
        spec={{
          title,
          href,
          icon: ShieldCheck,
          total: data.total,
          items: data.items.map(toDatedItem),
          forceEmpty: data.hidden,
          empty: data.hidden
            ? { icon: EyeOff, message: "Warranties for people are hidden.", note: hiddenNote }
            : { icon: ShieldCheck, message: `No warranties expiring in the next ${data.windowDays} days.` },
        }}
      />
    )
  }

  if (data.hidden) {
    return (
      <CardShell title={title} href={href}>
        <CardMessage icon={EyeOff} message="Warranties for people are hidden." note={isAdmin ? "Turn on Health in Settings to see them." : undefined} />
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

  const footer =
    data.total > data.items.length ? (
      <p className="px-4 pb-3 pt-1 text-xs text-muted-foreground">
        Showing {data.items.length} of {data.total} expiring
      </p>
    ) : null

  if (cardType("expiring-warranties")?.tiers[tier]?.name !== "grouped") {
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
