"use client"

import Link from "next/link"
import { PiggyBank } from "lucide-react"
import { RankedBars } from "@/components/charts/ranked-bars"
import { CompositionBar } from "@/components/charts/composition-bar"
import { useFormat } from "@/components/regional-provider"
import type { SpendingBreakdownData, SpendingCategory } from "@/lib/dashboard/loaders"
import { chartable } from "@/lib/dashboard/spending"
import { CardMessage, CardShell } from "./card-shell"
import type { CardViewProps } from "./types"

// Spending Breakdown: where the money goes. Small, the biggest category and
// its share; with room, every category ranked on one scale; wide, the mix as
// one composition bar over a keyed totals table (the table is the legend).

const TIER_TOP = 0
const TIER_RANKED = 1

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

  // At the smallest tier: a title that fits, and no header link beside it.
  const shell = tier === TIER_TOP ? { title: "Top Spending" } : { title: TITLE, href: HREF }

  if (!data.hasCosts) {
    return (
      <CardShell {...shell}>
        <CardMessage icon={PiggyBank} message="No costs recorded yet." />
      </CardShell>
    )
  }
  if (data.categories.length === 0) {
    return (
      <CardShell {...shell}>
        <CardMessage icon={PiggyBank} message={`No spending ${data.periodText}.`} />
      </CardShell>
    )
  }

  // One category is a fact, not a distribution: no chart for it.
  const canChart = chartable(data.categories.map((c) => c.total))

  if (tier === TIER_TOP) {
    // Small: titled for what it shows, and the figure is the link (no room
    // for one beside the title).
    return (
      <CardShell {...shell} className="px-3 pb-3">
        <Link href={HREF} className="block rounded-md px-2 py-1 transition-colors duration-150 hover:bg-muted/60">
          <TopCategory data={data} />
        </Link>
      </CardShell>
    )
  }
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
