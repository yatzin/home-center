"use client"

import Link from "next/link"
import { CalendarRange } from "lucide-react"
import { PlannedBars, PlannedLegend } from "@/components/charts/planned-bars"
import { useSize } from "@/components/charts/primitives/use-width"
import { useFormat } from "@/components/regional-provider"
import type { PlannedItemData, PlannedSpendData } from "@/lib/dashboard/loaders"
import { fitText, plannedArrangement, plannedChartable, plannedListRows, plannedStats } from "@/lib/dashboard/planned-spend"
import { cn } from "@/lib/utils"
import { CardMessage, CardShell } from "./card-shell"
import type { CardViewProps } from "./types"

// Planned Spend: what is coming, and when, so nothing surprises the household.
// The total is the Costs page's own planned figure. Size is a lens: a number
// with the next item; a number with a forward strip of months; bars by month
// with this month marked; bars stacked by asset type; the biggest items under
// the chart; and bars beside the list. A chart appears only with two months of
// planned spend and room to read it (lib/dashboard/planned-spend.ts); without
// that the card says the number and lists the items instead.

const TIER_STRIP = 1
const TIER_STACKED = 3
const TIER_LIST = 4
const TIER_SPLIT = 5

const TITLE = "Planned spend"
const HREF = "/costs"
const EMPTY_HREF = "/maintenance"
const EMPTY_HINT = "Add an estimated cost to a reminder to see what's coming."
const EMPTY_HINT_LONG = "Add an estimated cost to a reminder, or plan an equipment replacement, to see what's coming."

function isPlannedData(data: unknown): data is PlannedSpendData {
  return (
    typeof data === "object" &&
    data !== null &&
    "hasPlan" in data &&
    typeof data.hasPlan === "boolean" &&
    "months" in data &&
    Array.isArray(data.months) &&
    "items" in data &&
    Array.isArray(data.items) &&
    "horizon" in data &&
    typeof data.horizon === "number"
  )
}

const horizonText = (h: number) => (h === 1 ? "next month" : `next ${h} months`)

function useMoney() {
  const fmt = useFormat()
  /** The most precise figure that fits `avail` px at `fontPx`. */
  return (n: number, avail: number, fontPx: number) => fitText([fmt.money(n), fmt.moneyWhole(n), fmt.moneyCompact(n), ...(n >= 1e6 ? [`${fmt.currencySymbol}${(n / 1e6).toFixed(1)}M`] : [])], avail, fontPx)
}

/** A body that reports its size to a render function (the chart and list regions size themselves to what is left). */
function Region({ className, children }: { className?: string; children: (box: { width: number; height: number }) => React.ReactNode }) {
  const [ref, box] = useSize<HTMLDivElement>()
  return (
    <div ref={ref} className={cn("relative min-h-0 min-w-0", className)}>
      {children(box)}
    </div>
  )
}

function NextLine({ data, className }: { data: PlannedSpendData; className?: string }) {
  const fmt = useFormat()
  if (!data.next) return null
  return (
    <Link
      href={data.next.href}
      className={cn("block min-w-0 rounded-md px-1.5 py-1 text-xs transition-colors duration-150 hover:bg-muted/60", className)}
    >
      <span className="text-muted-foreground">Next · {data.next.dateText}</span>
      <span className="block truncate font-medium">{data.next.title}</span>
      <span className="block truncate text-muted-foreground">
        {data.next.assetName} · {fmt.money(data.next.cost)}
      </span>
    </Link>
  )
}

function ItemRows({ items, rows }: { items: PlannedItemData[]; rows: number }) {
  const fmt = useFormat()
  if (rows <= 0) return null
  return (
    <ul className="min-w-0">
      {items.slice(0, rows).map((item) => (
        <li key={item.id}>
          <Link href={item.href} title={`${item.title} · ${item.assetName}`} className="flex h-[34px] items-center gap-3 rounded-md px-2 transition-colors duration-150 hover:bg-muted/60">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-4 font-medium">{item.title}</span>
              <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                {item.dateText} · {item.assetName}
                {item.count > 1 ? ` · ${item.count}×` : ""}
              </span>
            </span>
            <span className="shrink-0 text-[13px] tabular-nums">{fmt.money(item.total)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The figure, what it covers and (as room allows) the biggest month and the near term. */
function Headline({ data, width, extra, link = false }: { data: PlannedSpendData; width: number; extra: 0 | 1 | 2; link?: boolean }) {
  const fmt = useFormat()
  const money = useMoney()
  const peak = data.peakIndex >= 0 ? data.months[data.peakIndex] : null
  const lines = [
    peak && plannedChartable(data.months)
      ? fitText(
          [`Biggest month: ${peak.label} · ${fmt.money(peak.total)}`, `Biggest: ${peak.label} · ${fmt.moneyWhole(peak.total)}`, `Biggest: ${peak.label} · ${fmt.moneyCompact(peak.total)}`],
          width,
          12,
        )
      : null,
    data.soon > 0 && data.soon < data.total
      ? fitText([`Next 3 months: ${fmt.money(data.soon)}`, `Next 3 mo: ${fmt.moneyWhole(data.soon)}`, `Next 3 mo: ${fmt.moneyCompact(data.soon)}`], width, 12)
      : null,
  ].filter((l): l is string => l !== null)
  return (
    <div className="shrink-0">
      <div className="text-2xl leading-none font-semibold tabular-nums">
        {link ? (
          <Link href={HREF} className="rounded-md transition-colors duration-150 hover:text-primary">
            {money(data.total, Math.max(width, 80), 24)}
          </Link>
        ) : (
          money(data.total, Math.max(width, 80), 24)
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">over the {horizonText(data.horizon)}</p>
      {lines.slice(0, extra).map((l) => (
        <p key={l} className="mt-0.5 truncate text-xs text-muted-foreground">
          {l}
        </p>
      ))}
    </div>
  )
}

function EmptyCompact() {
  const [ref, box] = useSize<HTMLAnchorElement>()
  return (
    <Link ref={ref} href={EMPTY_HREF} className="flex h-full flex-col justify-center gap-0.5 px-3 py-2 transition-colors duration-150 hover:bg-muted/40">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Planned</span>
      <span className="text-sm leading-tight font-medium">Nothing planned</span>
      {box.width >= 110 ? <span className="line-clamp-2 text-[11px] leading-tight text-muted-foreground">Add an estimated cost to a reminder.</span> : null}
    </Link>
  )
}

/** The smallest looks: no header (the figure carries the title), the card is the link. */
function Compact({ data, tier }: { data: PlannedSpendData; tier: number }) {
  const [ref, box] = useSize<HTMLDivElement>()
  const money = useMoney()
  const isStrip = tier === TIER_STRIP
  const showBars = isStrip && plannedChartable(data.months) && box.width >= 230
  // Beside the strip (or in its place) the next item gets its own block when 300px+ are free; narrower, one line under the figure.
  const nextBlock = data.next !== null && ((isStrip && box.width >= (showBars ? 400 : 300)) || (!isStrip && box.height >= 150 && box.width >= 110))
  const nextMini = data.next !== null && !isStrip && box.height >= 150 && box.width < 110
  const nextLine = data.next !== null && isStrip && !nextBlock && box.height >= 76
  const figureAvail = showBars ? (box.width - 40) * (nextBlock ? 0.3 : 0.4) : box.width - 28

  return (
    <div ref={ref} className={cn("flex h-full min-w-0", isStrip ? "items-center gap-3 px-3" : "flex-col justify-center gap-2 px-3 py-2")}>
      <div className={cn("min-w-0", showBars && "shrink-0")}>
        <Link
          href={HREF}
          className="block min-w-0 rounded-md py-0.5 transition-colors duration-150 hover:bg-muted/40"
          aria-label={`Planned spend, ${horizonText(data.horizon)}`}
        >
          <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Planned</span>
          <span className="block text-xl leading-tight font-semibold tabular-nums">{money(data.total, Math.max(figureAvail, 40), 20)}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{box.width < 110 ? `${data.horizon} months` : horizonText(data.horizon)}</span>
        </Link>
        {nextLine && data.next ? (
          <Link href={data.next.href} className="block truncate rounded-md text-[11px] leading-5 text-muted-foreground transition-colors duration-150 hover:text-foreground">
            Next · {data.next.dateText} · {data.next.title}
          </Link>
        ) : null}
      </div>
      {isStrip && nextBlock ? <NextLine data={data} className={showBars ? "w-44 shrink-0" : "min-w-0 flex-1"} /> : null}
      {showBars ? (
        <div className="h-10 min-w-0 flex-1">
          <PlannedBars months={data.months} peakIndex={data.peakIndex} />
        </div>
      ) : null}
      {!isStrip && nextBlock ? <NextLine data={data} /> : null}
      {nextMini && data.next ? (
        <Link href={data.next.href} className="block rounded-md text-[11px] leading-4 text-muted-foreground transition-colors duration-150 hover:text-foreground">
          Next
          <span className="block font-medium text-foreground">{data.next.dateText}</span>
          <span className="block tabular-nums">{money(data.next.cost, Math.max(box.width - 28, 40), 11)}</span>
        </Link>
      ) : null}
    </div>
  )
}

function Rich({ data, tier }: { data: PlannedSpendData; tier: number }) {
  const [outerRef, outer] = useSize<HTMLDivElement>()
  const [ref, box] = useSize<HTMLDivElement>()
  // Under ~230px the title and "View all" cannot share a line: the title stands alone and the figure is the link.
  const narrow = outer.width > 0 && outer.width < 230
  const chartable = plannedChartable(data.months)
  const stats = plannedStats(data.months)
  const stacked = tier >= TIER_STACKED
  // Beside the list only with a chart to put there; otherwise the items take the width.
  const split = tier === TIER_SPLIT && chartable
  const arrangement = split ? "side" : tier >= TIER_LIST ? "stack" : plannedArrangement(box.width, box.height)
  const side = arrangement === "side"
  const legend = stacked && stats.types.length >= 2
  const showNote = data.mileageNote !== null && box.height >= 190
  const note = showNote ? <p className="shrink-0 text-[11px] text-muted-foreground">{data.mileageNote}</p> : null
  const extra: 0 | 1 | 2 = side || box.height >= 300 ? 2 : box.height >= 190 ? 1 : 0

  const chart = (
    <>
      <Region className="flex-1">
        {() => (
          <div className="absolute inset-0">
            <PlannedBars months={data.months} peakIndex={data.peakIndex} stacked={stacked} />
          </div>
        )}
      </Region>
      {legend ? <PlannedLegend types={stats.types} /> : null}
    </>
  )

  // No chart (under two months of planned spend): the items take its place.
  const itemsOnly = (
    <Region className="flex-1">
      {(b) => (
        <div className="absolute inset-0 overflow-hidden">
          <ItemRows items={data.items} rows={plannedListRows(b.height, data.items.length)} />
        </div>
      )}
    </Region>
  )

  let content: React.ReactNode
  if (split) {
    content = (
      <div className="flex h-full min-h-0 gap-6">
        <div className="flex min-w-0 flex-[3] flex-col gap-3">
          <Headline data={data} width={box.width * 0.55} extra={2} />
          {chart}
          {note}
        </div>
        <div className="flex min-w-0 flex-[2] flex-col">
          <h3 className="shrink-0 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Biggest items</h3>
          {itemsOnly}
        </div>
      </div>
    )
  } else if (side) {
    content = (
      <div className="flex h-full min-h-0 gap-5">
        <div className="flex w-44 shrink-0 flex-col gap-3">
          <Headline data={data} width={170} extra={extra} link={narrow} />
          {note}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">{chartable ? chart : itemsOnly}</div>
      </div>
    )
  } else {
    const listRows = tier >= TIER_LIST && chartable ? plannedListRows(box.height - 64 - 130 - (legend ? 22 : 0) - (note ? 18 : 0), data.items.length) : 0
    content = (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Headline data={data} width={box.width} extra={extra} link={narrow} />
        {chartable ? chart : itemsOnly}
        {listRows > 0 ? (
          <div className="shrink-0">
            <h3 className="px-2 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Biggest items</h3>
            <ItemRows items={data.items} rows={Math.min(listRows, 4)} />
          </div>
        ) : null}
        {note}
      </div>
    )
  }

  return (
    <div ref={outerRef} className="h-full min-h-0">
      <CardShell title={TITLE} href={narrow ? undefined : HREF} className="px-5 pb-4">
        <div ref={ref} className="h-full min-h-0">
          {content}
        </div>
      </CardShell>
    </div>
  )
}

export function PlannedSpendCard({ data, tier }: CardViewProps) {
  if (!isPlannedData(data)) throw new Error("Unexpected Planned Spend card data")

  if (!data.hasPlan) {
    // Mileage-only reminders still show: they explain why nothing is planned.
    if (tier <= TIER_STRIP) return <EmptyCompact />
    return (
      <CardShell title={TITLE} href={undefined}>
        <CardMessage
          icon={CalendarRange}
          message="Nothing planned yet."
          note={[tier >= TIER_STACKED ? EMPTY_HINT_LONG : EMPTY_HINT, data.mileageNote].filter(Boolean).join(" ")}
          action={{ href: EMPTY_HREF, label: "Go to maintenance" }}
        />
      </CardShell>
    )
  }

  if (tier <= TIER_STRIP) return <Compact data={data} tier={tier} />
  return <Rich data={data} tier={tier} />
}
