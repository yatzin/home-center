"use client"

import Link from "next/link"
import { AlertTriangle, Clock, EyeOff } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { RemindersCardData, ReminderItem } from "@/lib/dashboard/loaders"
import { groupByUrgency } from "@/lib/dashboard/shaping"
import { ReminderRow } from "@/components/dashboard/reminder-row"
import { CardMessage, CardShell, GroupHeading } from "./card-shell"
import type { CardViewProps } from "./types"

// Reminders: the next item, then a short list, then (wide) grouped by urgency.

const TIER_NEXT = 0
const TIER_LIST = 1

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

/** The smallest tier: one line pair, no actions (the card is a link into Maintenance). */
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

export function RemindersCard({ data, tier }: CardViewProps) {
  if (!isRemindersData(data)) throw new Error("Unexpected Reminders card data")
  const title = "Reminders"
  const href = "/maintenance"

  if (data.hidden) {
    return (
      <CardShell title={title} href={href}>
        <CardMessage icon={EyeOff} message="Reminders for people are hidden." note="Turn on Health in Settings to see them." />
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

  if (tier === TIER_NEXT) {
    return (
      <CardShell title={title} href={href}>
        <div className="px-3">
          <NextRow item={data.items[0]} />
          {data.total > 1 && <p className="px-2 pt-1 text-xs text-muted-foreground">+{data.total - 1} more due</p>}
        </div>
      </CardShell>
    )
  }

  const footer =
    data.total > data.items.length ? (
      <p className="px-4 pb-3 pt-1 text-xs text-muted-foreground">
        Showing {data.items.length} of {data.total} due
      </p>
    ) : null

  if (tier === TIER_LIST) {
    return (
      <CardShell title={title} href={href} scroll>
        <ul className="space-y-0.5 px-3 pb-2">
          {data.items.map((item) => (
            <li key={item.schedule.id}>
              <Row item={item} />
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
