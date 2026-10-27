"use client"

import Link from "next/link"
import { Calendar, ChevronRight, ShieldCheck, Wrench, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CardLine, DueCardData, RecordsCardData, WarrantiesCardData } from "@/lib/dashboard/loaders"
import { CardMessage, CardShell } from "./card-shell"
import { DatedListLook, datedLookOf, type DatedItem, type Tone } from "./dated-list"
import type { CardViewProps } from "./types"

// Records, Active Warranties and Due Maintenance: dated lists. Below their
// rich size (6+ columns, 3+ rows) they show the dated-list looks (one row a
// carousel, two a headline item, then slim / condensed / full rows:
// dated-list.tsx); at it, the list itself. CountTile and CountWithList are
// Rooms' (rooms-card.tsx).

type CountSpec = {
  label: string
  icon: LucideIcon
  listHref: string
  emptyMessage: string
}

/** The number, its label and the type icon; urgent (destructive) when `urgent`. */
export function CountTile({
  label,
  icon: Icon,
  href,
  count,
  urgent,
  className,
}: {
  label: string
  icon: LucideIcon
  href: string
  count: number
  urgent?: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn("flex items-center justify-between gap-3 px-5 transition-colors duration-150 hover:bg-muted/60", className)}
    >
      <div className="min-w-0">
        <div className={cn("text-[28px] font-semibold leading-none tabular-nums", urgent && "text-destructive")}>{count}</div>
        <div className="mt-2 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
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

/** The count tile with a bordered list beneath it (the middle tier). */
export function CountWithList({
  tile,
  scroll,
  children,
}: {
  tile: Parameters<typeof CountTile>[0]
  scroll?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <CountTile {...tile} />
      {/* A scrolling list fills the card. Otherwise the list takes the height
          its rows need and the tile (flex-1) the rest: in a short card the
          list gives way first, never the count. */}
      <div className={cn("min-h-0 border-t", scroll ? "flex-1 overflow-y-auto" : "shrink overflow-hidden")}>{children}</div>
    </div>
  )
}

/** A row of the rich list (6+ columns, 3+ rows). */
function LineRow({ line, overdue }: { line: CardLine; overdue?: boolean }) {
  return (
    <Link
      href={line.href}
      title={line.assetName ? `${line.title} — ${line.assetName}` : line.title}
      className="group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors duration-150 hover:bg-muted/60"
    >
      <span className="min-w-0 flex-1 truncate font-medium">{line.title}</span>
      {line.assetName && <span className="min-w-0 max-w-[40%] shrink truncate text-xs text-muted-foreground">{line.assetName}</span>}
      <span className={cn("shrink-0 text-xs tabular-nums", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{line.meta}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" aria-hidden />
    </Link>
  )
}

/** The card at a dated-list look, or (rich sizes) the list as before. */
function ListCard({
  typeId,
  spec,
  count,
  tier,
  lines,
  toneOf,
  editing,
}: {
  typeId: string
  spec: CountSpec
  count: number
  tier: number
  lines: CardLine[]
  /** How pressing a line is (overdue lines are also red in the rich list). */
  toneOf: (line: CardLine) => Tone
  editing: boolean
}) {
  const look = datedLookOf(typeId, tier)
  if (look) {
    const items: DatedItem[] = lines.map((l) => ({
      id: l.id,
      title: l.title,
      detail: l.assetName,
      href: l.href,
      meta: l.meta,
      short: l.short ?? l.meta,
      cost: l.cost ?? null,
      tone: toneOf(l),
    }))
    return (
      <DatedListLook
        look={look}
        editing={editing}
        spec={{
          title: spec.label,
          href: spec.listHref,
          icon: spec.icon,
          total: count,
          items,
          empty: { icon: spec.icon, message: spec.emptyMessage },
        }}
      />
    )
  }

  if (lines.length === 0) {
    return (
      <CardShell title={spec.label} href={spec.listHref}>
        <CardMessage icon={spec.icon} message={spec.emptyMessage} />
      </CardShell>
    )
  }

  return (
    <CardShell title={spec.label} href={spec.listHref} scroll>
      <ul className="space-y-0.5 px-3 pb-3">
        {lines.map((line) => (
          <li key={line.id}>
            <LineRow line={line} overdue={toneOf(line) === "overdue"} />
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

export function RecordsCard({ data, tier, editing }: CardViewProps) {
  if (!isRecordsData(data)) throw new Error("Unexpected Records card data")
  // Newest first; history, so nothing is urgent.
  return <ListCard typeId="records" spec={RECORDS_SPEC} count={data.total} tier={tier} lines={data.recent} toneOf={() => "neutral"} editing={editing} />
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

/** A warranty this close to its end is marked "soon" (amber) in the smaller looks. */
export const WARRANTY_SOON_DAYS = 30

export function ActiveWarrantiesCard({ data, tier, editing }: CardViewProps) {
  if (!isWarrantiesData(data)) throw new Error("Unexpected Active Warranties card data")
  const soon = new Set(data.soonest.filter((w) => typeof w.daysLeft === "number" && w.daysLeft <= WARRANTY_SOON_DAYS).map((w) => w.id))
  // Soonest to expire first.
  return (
    <ListCard
      typeId="active-warranties"
      spec={WARRANTIES_SPEC}
      count={data.total}
      tier={tier}
      lines={data.soonest}
      toneOf={(l) => (soon.has(l.id) ? "soon" : "neutral")}
      editing={editing}
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

export function DueMaintenanceCard({ data, tier, editing }: CardViewProps) {
  if (!isDueData(data)) throw new Error("Unexpected Due Maintenance card data")
  const overdue = new Set(data.items.filter((i) => i.overdue).map((i) => i.id))
  // Most urgent first; everything here is due within 30 days, so at least soon.
  return (
    <ListCard
      typeId="due-maintenance"
      spec={DUE_SPEC}
      count={data.count}
      tier={tier}
      lines={data.items}
      toneOf={(l) => (overdue.has(l.id) ? "overdue" : "soon")}
      editing={editing}
    />
  )
}
