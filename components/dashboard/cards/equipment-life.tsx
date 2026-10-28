"use client"

import Link from "next/link"
import { Hourglass } from "lucide-react"
import { useSize } from "@/components/charts/primitives/use-width"
import { useFormat } from "@/components/regional-provider"
import { assetHref } from "@/lib/assets"
import type { EquipmentLifeData } from "@/lib/dashboard/loaders"
import { lifeAxisMax, lifeBulletRows, lifeRemaining, type LifeRow, type LifeStatus } from "@/lib/dashboard/equipment-life-card"
import { cn } from "@/lib/utils"
import { CardMessage, CardShell } from "./card-shell"
import type { CardViewProps } from "./types"

// Equipment Life: how worn out the household's equipment is, each item's age
// against how long it should last. Size is a lens: a count of what is past its
// life; that count with a status bar; one bullet bar per item (the end of
// life is the marker, and a bar past it runs on); the same with ages and a
// status summary; and, wide, the cost of replacing what is nearing the end
// beside the bars. Equipment with no expected life or no start date has
// nothing to draw: it is counted and the card says how to add the data.

const TIER_STRIP = 1
const TIER_DETAILED = 3
const TIER_WIDE = 4

const TITLE = "Equipment life"
const HREF = "/assets/equipment"
const ROW_PX = 36

function isLifeData(data: unknown): data is EquipmentLifeData {
  return (
    typeof data === "object" &&
    data !== null &&
    "rows" in data &&
    Array.isArray(data.rows) &&
    "summary" in data &&
    typeof data.summary === "object" &&
    data.summary !== null &&
    "untracked" in data &&
    typeof data.untracked === "number"
  )
}

const TEXT_TONE: Record<LifeStatus, string> = {
  ok: "text-muted-foreground",
  near: "text-amber-700 dark:text-amber-400",
  past: "text-destructive",
}
const FILL_TONE: Record<LifeStatus, string> = {
  ok: "bg-chart-1",
  near: "bg-amber-500",
  past: "bg-destructive",
}
const STATUS_WORD: Record<LifeStatus, string> = { ok: "fine", near: "nearing the end", past: "past their life" }

const pctText = (pct: number) => `${Math.round(pct * 100)}%`

/** Items past / nearing / fine, as one segmented bar with the counts beside it in text. */
function StatusBar({ data, className }: { data: EquipmentLifeData; className?: string }) {
  const { past, near, ok, tracked } = data.summary
  if (tracked === 0) return null
  const segments: { status: LifeStatus; n: number }[] = [
    { status: "past", n: past },
    { status: "near", n: near },
    { status: "ok", n: ok },
  ]
  return (
    <div className={cn("flex h-2 min-w-0 gap-px overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      {segments
        .filter((s) => s.n > 0)
        .map((s) => (
          <div key={s.status} className={FILL_TONE[s.status]} style={{ flexGrow: s.n, flexBasis: 0, minWidth: 3 }} />
        ))}
    </div>
  )
}

function countsText(data: EquipmentLifeData, short: boolean): string {
  const { past, near, ok } = data.summary
  const parts = [
    past > 0 ? `${past} past` : null,
    near > 0 ? `${near} ${short ? "near" : "nearing"}` : null,
    ok > 0 ? `${ok} ${short ? "ok" : "fine"}` : null,
  ].filter((p): p is string => p !== null)
  return parts.join(" · ")
}

/** The one figure that says the most: how many are past their life, else how many near it, else the most worn one's share. */
function headline(data: EquipmentLifeData): { figure: string; label: string; status: LifeStatus } {
  const { past, near, mostWorn } = data.summary
  if (past > 0) return { figure: String(past), label: "past their life", status: "past" }
  if (near > 0) return { figure: String(near), label: "nearing the end", status: "near" }
  return { figure: mostWorn ? pctText(mostWorn.pct) : "–", label: "most worn", status: "ok" }
}

function Bullet({ row, axis, detail }: { row: LifeRow; axis: number; detail: boolean }) {
  const fill = Math.min(row.pct, axis) / axis
  const marker = axis > 1 ? 1 / axis : null
  const remaining = lifeRemaining(row.monthsLeft)
  const summary = `${row.name}: ${pctText(row.pct)} of its expected life used (${row.years} of ${row.lifeYears} yr), ${remaining}`
  return (
    <li>
      <Link
        href={assetHref("EQUIPMENT", row.id)}
        title={summary}
        aria-label={summary}
        className="flex h-9 flex-col justify-center gap-1 rounded-md px-2 transition-colors duration-150 hover:bg-muted/60"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[13px] leading-4 font-medium">{row.name}</span>
          <span className={cn("shrink-0 text-[11px] leading-4 tabular-nums", TEXT_TONE[row.status])}>
            {detail ? `${row.years} of ${row.lifeYears} yr · ` : ""}
            {remaining}
          </span>
        </span>
        <span className="relative block h-1.5 rounded-full bg-muted" aria-hidden>
          <span className={cn("absolute inset-y-0 left-0 rounded-full", FILL_TONE[row.status])} style={{ width: `${Math.max(fill * 100, 2)}%` }} />
          {marker !== null ? <span className="absolute -inset-y-0.5 w-0.5 rounded-full bg-foreground/60" style={{ left: `${marker * 100}%` }} /> : null}
        </span>
      </Link>
    </li>
  )
}

function Bullets({ data, rows, detail }: { data: EquipmentLifeData; rows: number; detail: boolean }) {
  const shown = data.rows.slice(0, rows)
  const axis = lifeAxisMax(shown)
  return (
    <ul className="min-w-0">
      {shown.map((r) => (
        <Bullet key={r.id} row={r} axis={axis} detail={detail} />
      ))}
    </ul>
  )
}

function Empty({ tier, compact }: { tier: number; compact: boolean }) {
  if (compact) {
    return (
      <Link href={HREF} className="flex h-full flex-col justify-center gap-0.5 px-3 py-2 transition-colors duration-150 hover:bg-muted/40">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Life</span>
        <span className="text-sm leading-tight font-medium">No life data</span>
      </Link>
    )
  }
  return (
    <CardShell title={TITLE} href={undefined}>
      <CardMessage
        icon={Hourglass}
        message="No equipment life to show yet."
        note={
          tier >= TIER_DETAILED
            ? "Give equipment an install or purchase date and an expected life, and it appears here."
            : "Add an install date and expected life to equipment."
        }
        action={{ href: HREF, label: "Go to equipment" }}
      />
    </CardShell>
  )
}

function Compact({ data, tier }: { data: EquipmentLifeData; tier: number }) {
  const [ref, box] = useSize<HTMLDivElement>()
  const h = headline(data)
  const strip = tier === TIER_STRIP
  const showBar = strip && box.width >= 190
  return (
    <div ref={ref} className={cn("flex h-full min-w-0", strip ? "items-center gap-3 px-3" : "flex-col justify-center gap-0.5 px-3 py-2")}>
      <Link
        href={HREF}
        aria-label={`Equipment life: ${h.figure} ${h.label}`}
        className="block min-w-0 shrink-0 rounded-md py-0.5 transition-colors duration-150 hover:bg-muted/40"
      >
        <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Life</span>
        <span className={cn("block text-2xl leading-tight font-semibold tabular-nums", h.status === "ok" ? "" : TEXT_TONE[h.status])}>{h.figure}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{h.label}</span>
      </Link>
      {showBar ? (
        <div className="min-w-0 flex-1 space-y-1.5">
          <StatusBar data={data} />
          <p className="truncate text-[11px] text-muted-foreground">{countsText(data, box.width < 260)}</p>
        </div>
      ) : null}
    </div>
  )
}

function Rich({ data, tier }: { data: EquipmentLifeData; tier: number }) {
  const fmt = useFormat()
  const [outerRef, outer] = useSize<HTMLDivElement>()
  const [bodyRef, body] = useSize<HTMLDivElement>()
  const narrow = outer.width > 0 && outer.width < 230
  const wide = tier >= TIER_WIDE && outer.width >= 520
  const detail = tier >= TIER_DETAILED
  const s = data.summary
  const total = data.show === "all" ? s.tracked : s.past + s.near
  // Above the bars: the summary line and bar when tall enough. Below: a missing-data note when taller.
  const showSummary = detail && body.height >= 190
  const needsData = data.untracked > 0 && detail && body.height >= 260
  const reserved = (showSummary ? 34 : 0) + (needsData ? 28 : 0)
  const fitRows = lifeBulletRows(body.height - reserved, ROW_PX, data.rows.length)
  // Keep a line for "+N more" when it would otherwise be cut off.
  const shown = fitRows < total && fitRows > 1 && body.height - reserved - fitRows * ROW_PX < 24 ? fitRows - 1 : fitRows
  const more = Math.max(0, total - shown)

  const list =
    data.rows.length === 0 ? (
      <p className="py-3 text-sm text-muted-foreground">Nothing is nearing the end of its life.</p>
    ) : (
      <>
        <Bullets data={data} rows={shown} detail={detail} />
        {more > 0 && shown > 0 ? (
          <Link
            href={HREF}
            className="mt-0.5 block rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground"
          >
            +{more} more
          </Link>
        ) : null}
      </>
    )

  const summary = showSummary ? (
    <div className="mb-2 space-y-1.5 px-2">
      <StatusBar data={data} />
      <p className="truncate text-xs text-muted-foreground">{countsText(data, false)}</p>
    </div>
  ) : null

  const note = needsData ? (
    <Link
      href={HREF}
      className="mt-1 block truncate rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground"
    >
      {data.untracked} without an install date or expected life
    </Link>
  ) : null

  let content: React.ReactNode
  if (wide) {
    const attention = s.past + s.near
    const costLine =
      attention === 0
        ? "Nothing is past or nearing the end of its life."
        : s.replacementKnown === 0
          ? "No replacement cost recorded for them yet."
          : s.replacementKnown < attention
            ? `Costs known for ${s.replacementKnown} of ${attention}.`
            : `For the ${attention} past or nearing the end.`
    content = (
      <div className="flex h-full min-h-0 gap-6">
        <div className="min-w-0 flex-[3]">
          {summary}
          {list}
          {note}
        </div>
        <div className="min-w-0 flex-[2] space-y-3 border-l border-border pl-6">
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">To replace</h3>
            <p className="mt-1 text-2xl leading-none font-semibold tabular-nums">{s.replacementKnown > 0 ? fmt.money(s.replacement) : "–"}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{costLine}</p>
          </div>
          <ul className="space-y-1 text-xs">
            {(["past", "near", "ok"] as const).map((st) => (
              <li key={st} className="flex items-center gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", FILL_TONE[st])} aria-hidden />
                <span className="tabular-nums">{s[st]}</span>
                <span className="truncate text-muted-foreground">{STATUS_WORD[st]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  } else {
    content = (
      <div>
        {summary}
        {list}
        {note}
      </div>
    )
  }

  return (
    <div ref={outerRef} className="h-full min-h-0">
      <CardShell title={TITLE} href={narrow ? undefined : HREF} className="px-3 pb-3">
        <div ref={bodyRef} className="h-full min-h-0 overflow-hidden">
          {content}
        </div>
      </CardShell>
    </div>
  )
}

export function EquipmentLifeCard({ data, tier }: CardViewProps) {
  if (!isLifeData(data)) throw new Error("Unexpected Equipment Life card data")
  if (data.summary.tracked === 0) return <Empty tier={tier} compact={tier <= TIER_STRIP} />
  if (tier <= TIER_STRIP) return <Compact data={data} tier={tier} />
  return <Rich data={data} tier={tier} />
}
