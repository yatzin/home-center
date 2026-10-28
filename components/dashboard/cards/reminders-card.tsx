"use client"

import Link from "next/link"
import { AlertTriangle, Clock, EyeOff } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { cardType } from "@/lib/dashboard/card-types"
import type { RemindersCardData, ReminderItem } from "@/lib/dashboard/loaders"
import { groupByUrgency, type Urgency } from "@/lib/dashboard/shaping"
import { ReminderRow } from "@/components/dashboard/reminder-row"
import { CardMessage, CardShell, GroupHeading } from "./card-shell"
import { useViewerIsAdmin } from "./card-configure"
import { DatedListLook, datedLookOf, type DatedItem, type Tone } from "./dated-list"
import type { CardViewProps } from "./types"

// Reminders: below the rich size the dated-list looks (dated-list.tsx: one row
// a carousel, two the most urgent item with compact rows, then slim /
// condensed / full rows); from 6 columns and 3 rows the list as before, and
// with 4+ rows grouped by urgency. Most urgent first.

const TONES: Record<Urgency, Tone> = { overdue: "overdue", dueSoon: "soon", upcoming: "neutral" }

function toDatedItem(item: ReminderItem): DatedItem {
  return {
    id: item.schedule.id,
    title: item.schedule.title,
    detail: item.assetName,
    href: item.href,
    meta: item.dueLabel,
    short: item.dueLabel,
    cost: item.cost ?? null,
    tone: TONES[item.urgency] ?? (item.overdue ? "overdue" : "soon"),
  }
}

const GROUP_COLUMNS: Record<number, string> = { 1: "@3xl:grid-cols-1", 2: "@3xl:grid-cols-2", 3: "@3xl:grid-cols-3" }

function isRemindersData(data: unknown): data is RemindersCardData {
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

function Row({ item }: { item: ReminderItem }) {
  return (
    <ReminderRow
      schedule={item.schedule}
      assetName={item.assetName ?? undefined}
      href={item.href}
      overdue={item.overdue}
      dueLabel={item.dueLabel}
      currentMileage={item.currentMileage}
      meterUnit={item.meterUnit}
    />
  )
}

/**
 * Two lines, no actions (the row is a link into the asset): the list tier's
 * rows, where the card has no room for the full row's actions. Those come
 * with the grouped tier.
 */
function NextRow({ item }: { item: ReminderItem }) {
  return (
    <Link
      href={item.href}
      title={item.assetName ? `${item.schedule.title} — ${item.assetName}` : item.schedule.title}
      className="block rounded-md px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted/60"
    >
      <span className="flex items-center gap-2">
        {item.overdue ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
        ) : (
          <Clock className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{item.schedule.title}</span>
      </span>
      <span className="mt-1 flex items-center gap-2 pl-5.5">
        <Badge variant={item.overdue ? "destructive" : "secondary"} className="shrink-0 text-xs">
          {item.dueLabel}
        </Badge>
        {item.assetName && <span className="min-w-0 truncate text-xs text-muted-foreground">{item.assetName}</span>}
      </span>
    </Link>
  )
}

export function RemindersCard({ data, tier, editing }: CardViewProps) {
  const isAdmin = useViewerIsAdmin()
  if (!isRemindersData(data)) throw new Error("Unexpected Reminders card data")
  const title = "Reminders"
  const href = "/maintenance"

  const look = datedLookOf("reminders", tier)
  if (look) {
    const hiddenNote = isAdmin ? "Turn on Health in Settings to see them." : undefined
    return (
      <DatedListLook
        look={look}
        editing={editing}
        spec={{
          title,
          href,
          icon: Clock,
          total: data.total,
          items: data.items.map(toDatedItem),
          forceEmpty: data.hidden,
          empty: data.hidden
            ? { icon: EyeOff, message: "Reminders for people are hidden.", note: hiddenNote }
            : { icon: Clock, message: `Nothing due in the next ${data.windowDays} days.` },
        }}
      />
    )
  }

  if (data.hidden) {
    return (
      <CardShell title={title} href={href}>
        <CardMessage icon={EyeOff} message="Reminders for people are hidden." note={isAdmin ? "Turn on Health in Settings to see them." : undefined} />
      </CardShell>
    )
  }
  if (data.items.length === 0) {
    return (
      <CardShell title={title} href={href}>
        <CardMessage icon={Clock} message={`Nothing due in the next ${data.windowDays} days.`} />
      </CardShell>
    )
  }

  const footer =
    data.total > data.items.length ? (
      <p className="px-4 pb-3 pt-1 text-xs text-muted-foreground">
        Showing {data.items.length} of {data.total} due
      </p>
    ) : null

  if (cardType("reminders")?.tiers[tier]?.name !== "grouped") {
    return (
      <CardShell title={title} href={href} scroll>
        <ul className="space-y-0.5 px-3 pb-2">
          {data.items.map((item) => (
            <li key={item.schedule.id}>
              <NextRow item={item} />
            </li>
          ))}
        </ul>
        {footer}
      </CardShell>
    )
  }

  const groups = groupByUrgency(data.items)
  return (
    <CardShell title={title} href={href} scroll>
      <div className="@container">
        <div className={cn("grid grid-cols-1 gap-x-4 gap-y-3 px-3 pb-2", GROUP_COLUMNS[groups.length])}>
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label} className="min-w-0">
              <GroupHeading label={g.label} count={g.items.length} />
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.schedule.id}>
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
