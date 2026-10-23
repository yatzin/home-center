"use client"

import Link from "next/link"
import { AlertTriangle, Calendar, ChevronRight, Clock, ShieldCheck, Wrench, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CardLine, DueCardData, RecordsCardData, WarrantiesCardData } from "@/lib/dashboard/loaders"
import { CardMessage, CardShell } from "./card-shell"
import type { CardViewProps } from "./types"

// Count cards: Records, Active Warranties and Due Maintenance. A big number at
// the smallest size; under it, at 2+ rows, a line or two of what is behind the
// number; at the largest tier, the list itself.

const TIER_COUNT = 0
const TIER_PEEK = 1

type CountSpec = {
  label: string
  icon: LucideIcon
  listHref: string
  emptyMessage: string
}

/** The number, its label and the type's icon; urgent (destructive) when `urgent`. */
function CountRow({ spec, count, urgent, className }: { spec: CountSpec; count: number; urgent?: boolean; className?: string }) {
  const Icon = spec.icon
  return (
    <Link
      href={spec.listHref}
      className={cn("flex items-center justify-between gap-3 px-5 transition-colors duration-150 hover:bg-muted/60", className)}
    >
      <div className="min-w-0">
        <div className={cn("text-[28px] font-semibold leading-none tabular-nums", urgent && "text-destructive")}>{count}</div>
        <div className="mt-2 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{spec.label}</div>
      </div>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          urgent ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </div>
    </Link>
  )
}

/** `compact` drops the asset name (it is still in the tooltip) for the narrow middle tier. */
function LineRow({ line, overdue, compact }: { line: CardLine; overdue?: boolean; compact?: boolean }) {
  return (
    <Link
      href={line.href}
      title={line.assetName ? `${line.title} — ${line.assetName}` : line.title}
      className="group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors duration-150 hover:bg-muted/60"
    >
      <span className="min-w-0 flex-1 truncate font-medium">{line.title}</span>
      {line.assetName && !compact && <span className="min-w-0 max-w-[40%] shrink truncate text-xs text-muted-foreground">{line.assetName}</span>}
      <span className={cn("shrink-0 text-xs tabular-nums", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{line.meta}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" aria-hidden />
    </Link>
  )
}

/** The count with a short list beneath it (the middle tier). */
function Peek({ spec, count, urgent, children }: { spec: CountSpec; count: number; urgent?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <CountRow spec={spec} count={count} urgent={urgent} className="min-h-0 flex-1" />
      <div className="shrink-0 overflow-hidden border-t px-3 py-1.5">{children}</div>
    </div>
  )
}

function ListCard({
  spec,
  count,
  urgent,
  tier,
  lines,
  peek,
  overdueOf,
}: {
  spec: CountSpec
  count: number
  urgent?: boolean
  tier: number
  lines: CardLine[]
  /** What the middle tier shows under the count. */
  peek: React.ReactNode
  overdueOf?: (line: CardLine) => boolean
}) {
  if (tier === TIER_COUNT) return <CountRow spec={spec} count={count} urgent={urgent} className="h-full" />

  if (lines.length === 0) {
    return (
      <CardShell title={spec.label} href={spec.listHref}>
        <CardMessage icon={spec.icon} message={spec.emptyMessage} />
      </CardShell>
    )
  }

  if (tier === TIER_PEEK) {
    return (
      <Peek spec={spec} count={count} urgent={urgent}>
        {peek}
      </Peek>
    )
  }

  return (
    <CardShell title={spec.label} href={spec.listHref} scroll>
      <ul className="space-y-0.5 px-3 pb-3">
        {lines.map((line) => (
          <li key={line.id}>
            <LineRow line={line} overdue={overdueOf?.(line)} />
          </li>
        ))}
      </ul>
    </CardShell>
  )
}

function isObject(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null
}

// ---- Records --------------------------------------------------------------------

const RECORDS_SPEC: CountSpec = { label: "Records", icon: Wrench, listHref: "/records", emptyMessage: "No service records yet" }

function isRecordsData(data: unknown): data is RecordsCardData {
  return isObject(data) && typeof data.total === "number" && Array.isArray(data.recent)
}

export function RecordsCard({ data, tier }: CardViewProps) {
  if (!isRecordsData(data)) throw new Error("Unexpected Records card data")
  return (
    <ListCard
      spec={RECORDS_SPEC}
      count={data.total}
      tier={tier}
      lines={data.recent}
      peek={<LineRow line={data.recent[0]} compact />}
    />
  )
}

// ---- Active warranties ----------------------------------------------------------

const WARRANTIES_SPEC: CountSpec = {
  label: "Active Warranties",
  icon: ShieldCheck,
  listHref: "/warranties",
  emptyMessage: "No active warranties",
}

function isWarrantiesData(data: unknown): data is WarrantiesCardData {
  return isObject(data) && typeof data.total === "number" && Array.isArray(data.breakdown) && Array.isArray(data.soonest)
}

export function ActiveWarrantiesCard({ data, tier }: CardViewProps) {
  if (!isWarrantiesData(data)) throw new Error("Unexpected Active Warranties card data")
  return (
    <ListCard
      spec={WARRANTIES_SPEC}
      count={data.total}
      tier={tier}
      lines={data.soonest}
      peek={
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 py-1 text-xs text-muted-foreground">
          {data.breakdown.map((b) => (
            <li key={b.label}>
              <span className="font-medium tabular-nums text-foreground">{b.count}</span> {b.label}
            </li>
          ))}
        </ul>
      }
    />
  )
}

// ---- Due maintenance ------------------------------------------------------------

const DUE_SPEC: CountSpec = {
  label: "Due (30d)",
  icon: Calendar,
  listHref: "/maintenance",
  emptyMessage: "Nothing due in the next 30 days.",
}

function isDueData(data: unknown): data is DueCardData {
  return isObject(data) && typeof data.count === "number" && Array.isArray(data.items)
}

export function DueMaintenanceCard({ data, tier }: CardViewProps) {
  if (!isDueData(data)) throw new Error("Unexpected Due Maintenance card data")
  const overdue = new Set(data.items.filter((i) => i.overdue).map((i) => i.id))
  const next = data.items[0]
  return (
    <ListCard
      spec={DUE_SPEC}
      count={data.count}
      urgent={data.count > 0}
      tier={tier}
      lines={data.items}
      overdueOf={(l) => overdue.has(l.id)}
      peek={
        next && (
          <div className="flex items-center gap-1">
            {next.overdue ? (
              <AlertTriangle className="ml-2 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
            ) : (
              <Clock className="ml-2 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <LineRow line={next} overdue={next.overdue} compact />
            </div>
          </div>
        )
      }
    />
  )
}
