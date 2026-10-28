"use client"

import Link from "next/link"
import { PiggyBank } from "lucide-react"
import { useSize } from "@/components/charts/primitives/use-width"
import { fitText } from "@/lib/dashboard/planned-spend"
import { cn } from "@/lib/utils"
import { RankedBars } from "@/components/charts/ranked-bars"
import { CompositionBar } from "@/components/charts/composition-bar"
import { useFormat } from "@/components/regional-provider"
import type { SpendingBreakdownData, SpendingCategory } from "@/lib/dashboard/loaders"
import { chartable } from "@/lib/dashboard/spending"
import { CardMessage, CardShell, CardShellHeader } from "./card-shell"
import type { CardViewProps } from "./types"

// Spending Breakdown: where the money goes. At 1x1, the biggest category and
// its share. Anything bigger shows every category, condensed: one row tall, a
// single bar split by share with the names inside; narrower or shorter than
// the ranked look, a row per category with its bar behind its text. With room,
// every category ranked on one scale; wide, the mix as one composition bar
// over a keyed totals table (the table is the legend). Text sits on a tint of
// the card, never on the category colour itself, so it reads in every theme;
// the colour is a solid edge that keeps a category's identity.

const TIER_TOP = 0
const TIER_SLICES = 1
const TIER_ROWS = 2
const TIER_RANKED = 3

const TITLE = "Spending by Category"
const HREF = "/costs"

function isBreakdownData(data: unknown): data is SpendingBreakdownData {
  return (
    typeof data === "object" &&
    data !== null &&
    "hasCosts" in data &&
    typeof data.hasCosts === "boolean" &&
    "total" in data &&
    typeof data.total === "number" &&
    "categories" in data &&
    Array.isArray(data.categories)
  )
}

/** Whole-number share; a real but tiny share reads "<1", never "0". */
function percent(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return "0"
  const p = Math.round((part / whole) * 100)
  return p === 0 ? "<1" : String(p)
}

/** A category's colour key. Identity is always also written as text beside it. */
function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: color }} />
}

/** A category's bar colour: a light tint of it on the card, for text to sit on. */
const tint = (color: string, pct: number) => `color-mix(in oklch, ${color} ${pct}%, var(--card))`

/** The most precise money figure that fits `avail` px at `fontPx`. */
function useMoneyFit() {
  const fmt = useFormat()
  return (n: number, avail: number, fontPx: number) => fitText([fmt.money(n), fmt.moneyWhole(n), fmt.moneyCompact(n)], avail, fontPx)
}

function EmptyCompact({ text }: { text: string }) {
  return (
    <Link href={HREF} className="flex h-full flex-col justify-center gap-0.5 px-3 py-2 transition-colors duration-150 hover:bg-muted/40">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Spending</span>
      <span className="text-sm leading-tight font-medium">{text}</span>
    </Link>
  )
}

/** 1x1: the top category, its figure and its share; the card is the link. */
function TopCompact({ data }: { data: SpendingBreakdownData }) {
  const [ref, box] = useSize<HTMLAnchorElement>()
  const money = useMoneyFit()
  const top = data.categories[0]
  return (
    <Link ref={ref} href={HREF} className="flex h-full min-w-0 flex-col justify-center gap-0.5 px-3 py-1.5 transition-colors duration-150 hover:bg-muted/40">
      <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Top spending</span>
      <span className="flex items-center gap-1.5 text-xs">
        <Swatch color={top.color} />
        <span className="truncate">{top.label}</span>
      </span>
      <span className="text-xl leading-tight font-semibold tabular-nums">{money(top.total, Math.max(box.width - 24, 40), 20)}</span>
      <span className="truncate text-[11px] text-muted-foreground">
        {data.categories.length === 1 ? data.periodText : `${percent(top.total, data.total)}% of the total`}
      </span>
    </Link>
  )
}

/** The text a slice has room for: "Maintenance 41%", else "41%", else nothing (about 6.4px a character at 11px). */
function sliceText(c: SpendingCategory, total: number, width: number): string {
  const pct = `${percent(c.total, total)}%`
  const fits = (t: string) => t.length * 6.4 + 12 <= width
  return fits(`${c.label} ${pct}`) ? `${c.label} ${pct}` : fits(pct) ? pct : ""
}

/** One bar split by share, each slice named inside it where it is wide enough; a slice's title is its full figure. */
function SliceBar({ data, width, height }: { data: SpendingBreakdownData; width: number; height: number }) {
  const fmt = useFormat()
  return (
    <div className="flex w-full gap-0.5 overflow-hidden rounded-md" style={{ height }} role="img" aria-label={`Spending by category, ${data.periodText}`}>
      {data.categories.map((c) => (
        <div
          key={c.key}
          title={`${c.label}: ${fmt.money(c.total)} (${percent(c.total, data.total)}%)`}
          className="flex min-w-0 items-center overflow-hidden px-1.5 text-[11px] leading-none font-medium whitespace-nowrap"
          style={{
            flex: `${c.total} 1 0`,
            minWidth: 3,
            backgroundColor: tint(c.color, 30),
            boxShadow: `inset 0 -3px 0 ${c.color}`,
          }}
        >
          <span className="truncate">{sliceText(c, data.total, (width * c.total) / data.total - 2)}</span>
        </div>
      ))}
    </div>
  )
}

/** One row tall: the title and total on a line, the bar under it. */
function Slices({ data }: { data: SpendingBreakdownData }) {
  const [ref, box] = useSize<HTMLDivElement>()
  const [barRef, bar] = useSize<HTMLDivElement>()
  const n = data.categories.length
  return (
    <div ref={ref} className="flex h-full min-w-0 flex-col justify-center gap-1.5 px-3 py-2">
      <Link href={HREF} className="flex min-w-0 items-baseline justify-between gap-2 rounded-md transition-colors duration-150 hover:text-primary">
        <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {box.width >= 250 ? `${TITLE} · ${data.periodText}` : box.width >= 150 ? TITLE : "Spending"}
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums">{data.totalText}</span>
      </Link>
      <div ref={barRef} className="min-w-0">
        <SliceBar data={data} width={bar.width} height={28} />
      </div>
      {box.height >= 100 ? (
        <p className="truncate text-[11px] text-muted-foreground">
          {data.periodText} · {n} {n === 1 ? "category" : "categories"}
        </p>
      ) : null}
    </div>
  )
}

const ROW_GAP = 2
const ROW_MIN = 16
const ROW_MAX = 26
const TWO_LINE = 32

/**
 * A row per category on one scale (the largest is full length): its bar is a
 * tint behind the text, a solid edge keeps its colour. In a very narrow card
 * (one column) a row has two lines, the name over its share and figure, when
 * the height allows; otherwise the name comes first and the share follows only
 * if it fits. Every row stays; past the card's height it scrolls.
 */
function Rows({ data }: { data: SpendingBreakdownData }) {
  const fmt = useFormat()
  const [outerRef, outer] = useSize<HTMLDivElement>()
  const [bodyRef, body] = useSize<HTMLDivElement>()
  const n = data.categories.length
  const tight = outer.width > 0 && outer.width < 130
  const narrow = outer.width > 0 && outer.width < 230
  // The total line when it still leaves every row its minimum height.
  const showTotal = !tight && body.height >= 22 + n * (ROW_MIN + ROW_GAP) && outer.width >= 140
  const avail = body.height - (showTotal ? 22 : 0)
  const fit = Math.floor((avail - ROW_GAP * (n - 1)) / n)
  const twoLine = tight && fit >= TWO_LINE
  const rowH = twoLine ? Math.min(40, fit) : Math.max(ROW_MIN, Math.min(ROW_MAX, fit))
  const max = data.categories[0]?.total ?? 1
  const rowW = Math.max(0, outer.width - (tight ? 12 : 24))

  // The measured box is the one that fills the space (not the list inside it, whose height is its own content), and the list scrolls inside it.
  const list = (
    <div ref={bodyRef} className="relative h-full min-h-0 flex-1">
      <div className="absolute inset-0 overflow-y-auto">
      {showTotal ? (
        <p className="flex h-[22px] items-baseline gap-2 px-1">
          <span className="text-sm font-semibold tabular-nums">{data.totalText}</span>
          <span className="truncate text-[11px] text-muted-foreground">{data.periodText}</span>
        </p>
      ) : null}
      <ul className="flex flex-col" style={{ gap: ROW_GAP }}>
        {data.categories.map((c) => {
          const pct = percent(c.total, data.total)
          const value = fitText([`${fmt.money(c.total)} · ${pct}%`, fmt.money(c.total), `${pct}%`], rowW * 0.55, 11)
          // One line, very narrow: the share only when the name still fits beside it.
          const oneLineValue = tight ? (c.label.length * 6.2 + 34 <= rowW ? `${pct}%` : "") : value
          return (
            <li
              key={c.key}
              title={`${c.label}: ${fmt.money(c.total)} (${pct}%)`}
              className="relative overflow-hidden rounded-[5px] bg-muted/50"
              style={{ height: rowH }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 rounded-[5px]"
                style={{ width: `${Math.max(2, (c.total / max) * 100)}%`, backgroundColor: tint(c.color, 34), boxShadow: `inset 3px 0 0 ${c.color}` }}
              />
              {twoLine ? (
                <span className="absolute inset-0 flex flex-col justify-center gap-0.5 px-2 pl-3 leading-none">
                  <span className="truncate text-[11px] font-medium">{c.label}</span>
                  <span className="truncate text-[10px] tabular-nums text-muted-foreground">
                    {fitText([`${pct}% · ${fmt.money(c.total)}`, `${pct}% · ${fmt.moneyWhole(c.total)}`, `${pct}%`], rowW - 12, 10)}
                  </span>
                </span>
              ) : (
                <span className={cn("absolute inset-0 flex items-center gap-2 text-[11px] leading-none", tight ? "px-2 pl-3" : "px-2.5")}>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                  {oneLineValue ? <span className="shrink-0 tabular-nums text-muted-foreground">{oneLineValue}</span> : null}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      </div>
    </div>
  )

  // One tree whatever the width (only the header and padding differ), so the
  // measured body keeps its element when the card is resized across a threshold.
  return (
    <div ref={outerRef} className="h-full min-h-0">
      <div className={cn("flex h-full min-h-0 flex-col", tight ? "px-1.5 pt-2 pb-1.5" : "px-3 pb-3")}>
        {tight ? (
          <Link href={HREF} className="mb-1 block shrink-0 truncate px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-primary">
            Spending
          </Link>
        ) : (
          <CardShellHeader title={narrow ? "Spending" : TITLE} href={narrow ? undefined : HREF} />
        )}
        {list}
      </div>
      <div className="sr-only">
        <TotalsTable categories={data.categories} total={data.total} />
      </div>
    </div>
  )
}

function TopCategory({ data }: { data: SpendingBreakdownData }) {
  const fmt = useFormat()
  const top = data.categories[0]
  const rest = data.categories.length - 1
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm">
        <Swatch color={top.color} />
        <span className="truncate">{top.label}</span>
      </p>
      <p className="mt-1.5 text-2xl font-semibold leading-none">{fmt.money(top.total)}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {rest === 0
          ? `All spending ${data.periodText}.`
          : `${percent(top.total, data.total)}% of ${data.totalText} ${data.periodText}.`}
      </p>
      {rest > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          +{rest} more {rest === 1 ? "category" : "categories"}
        </p>
      )}
    </div>
  )
}

/** "$2,940 in 2026 · 5 categories": the whole the chart below divides up. */
function TotalLine({ data }: { data: SpendingBreakdownData }) {
  const n = data.categories.length
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-lg font-semibold leading-none">{data.totalText}</span>
      <span className="text-xs text-muted-foreground">
        {data.periodText} · {n} {n === 1 ? "category" : "categories"}
        {data.refundsExcluded ? " · excluding refunds" : ""}
      </span>
    </p>
  )
}

function TotalsTable({ categories, total }: { categories: SpendingCategory[]; total: number }) {
  const fmt = useFormat()
  return (
    // Capped width: on a very wide card the numbers stay near their labels.
    <table className="w-full max-w-2xl text-sm">
      <caption className="sr-only">Spending by category</caption>
      <thead className="text-muted-foreground">
        <tr>
          <th scope="col" className="py-1.5 pr-3 text-left text-xs font-medium">Category</th>
          <th scope="col" className="px-3 py-1.5 text-right text-xs font-medium">Spend</th>
          <th scope="col" className="px-3 py-1.5 text-right text-xs font-medium">Share</th>
          <th scope="col" className="py-1.5 pl-3 text-right text-xs font-medium">Records</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {categories.map((c) => (
          <tr key={c.key}>
            <th scope="row" className="py-1.5 pr-3 text-left font-normal">
              <span className="flex items-center gap-2">
                <Swatch color={c.color} />
                <span className="truncate">{c.label}</span>
              </span>
            </th>
            <td className="px-3 py-1.5 text-right tabular-nums">{fmt.money(c.total)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{percent(c.total, total)}%</td>
            <td className="py-1.5 pl-3 text-right tabular-nums text-muted-foreground">{c.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SpendingBreakdownCard({ data, tier }: CardViewProps) {
  if (!isBreakdownData(data)) throw new Error("Unexpected Spending Breakdown card data")

  // The sizes with no header: a short line instead, the card itself the link.
  const headerless = tier <= TIER_SLICES
  if (!data.hasCosts || data.categories.length === 0) {
    const text = !data.hasCosts ? "No costs yet" : `None ${data.periodText}`
    if (headerless) return <EmptyCompact text={text} />
    return (
      <CardShell title={TITLE} href={HREF}>
        <CardMessage icon={PiggyBank} message={!data.hasCosts ? "No costs recorded yet." : `No spending ${data.periodText}.`} />
      </CardShell>
    )
  }

  if (tier === TIER_TOP) return <TopCompact data={data} />
  if (tier === TIER_SLICES) {
    return (
      <>
        <Slices data={data} />
        <div className="sr-only">
          <TotalsTable categories={data.categories} total={data.total} />
        </div>
      </>
    )
  }
  if (tier === TIER_ROWS) return <Rows data={data} />

  // One category is a fact, not a distribution: no chart for it.
  const canChart = chartable(data.categories.map((c) => c.total))
  if (!canChart) {
    return (
      <CardShell title={TITLE} href={HREF} className="px-5 pb-4">
        <TopCategory data={data} />
        <p className="mt-4 text-xs text-muted-foreground">A breakdown appears once a second category has spending.</p>
      </CardShell>
    )
  }

  if (tier === TIER_RANKED) {
    return (
      <CardShell title={TITLE} href={HREF} scroll className="px-4 pb-3">
        <div className="px-1.5 pb-3">
          <TotalLine data={data} />
        </div>
        <RankedBars entries={data.categories} size="compact" valueLabel="Spend" caption="Spending by category" tableSrOnly />
      </CardShell>
    )
  }

  return (
    <CardShell title={TITLE} href={HREF} scroll className="space-y-4 px-5 pb-4">
      <TotalLine data={data} />
      <CompositionBar entries={data.categories} bare />
      <TotalsTable categories={data.categories} total={data.total} />
    </CardShell>
  )
}
