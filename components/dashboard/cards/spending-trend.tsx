"use client"

import Link from "next/link"
import { PiggyBank } from "lucide-react"
import { SpendArea } from "@/components/charts/spend-area"
import { MonthBars } from "@/components/charts/month-bars"
import { useFormat } from "@/components/regional-provider"
import type { SpendingTrendData } from "@/lib/dashboard/loaders"
import { chartable } from "@/lib/dashboard/spending"
import { CardMessage, CardShell } from "./card-shell"
import type { CardViewProps } from "./types"

// Spending Trend: are we spending more than last year? The headline answers it
// at any size; with room, the twelve-month curve against last year (as the
// classic dashboard card); wide and tall, month-by-month bars with the mean
// month and last year's months as references, beside the facts they imply.

const TIER_HEADLINE = 0
const TIER_CHART = 1

const TITLE = "Spending"
const HREF = "/costs"

function isTrendData(data: unknown): data is SpendingTrendData {
  return (
    typeof data === "object" &&
    data !== null &&
    "hasCosts" in data &&
    typeof data.hasCosts === "boolean" &&
    "totalText" in data &&
    typeof data.totalText === "string" &&
    "points" in data &&
    Array.isArray(data.points) &&
    "prior" in data &&
    Array.isArray(data.prior)
  )
}

/** The figure, its period and the change against a year earlier (as the classic card). */
function Headline({ data }: { data: SpendingTrendData }) {
  const { delta } = data
  return (
    <div className="shrink-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {/* Proportional figures: tabular-nums reads loose at this size. */}
        <span className="text-2xl font-semibold leading-none">{data.totalText}</span>
        <span className="text-xs text-muted-foreground">{data.periodText}</span>
        {delta !== null && (
          <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            <span aria-hidden="true">{delta >= 0 ? "↑" : "↓"}</span>
            <span className="sr-only">{delta >= 0 ? "Up" : "Down"}</span> {Math.abs(delta * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{data.comparison}</p>
    </div>
  )
}

/** Where a chart would go when there is too little history to draw one. */
function NoChart() {
  return (
    <p className="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-xs text-muted-foreground">
      A chart appears once two months have spending.
    </p>
  )
}

/** The facts the month bars imply, written out: the wide tier's side column. */
function Facts({ data }: { data: SpendingTrendData }) {
  const fmt = useFormat()
  const peak = data.points.reduce((best, p) => (p.total > best.total ? p : best), data.points[0])
  const current = data.points[data.points.length - 1]
  const facts = [
    { label: "Monthly average", value: fmt.money(data.average) },
    ...(peak && peak.total > 0 ? [{ label: "Highest month", value: `${fmt.money(peak.total)}`, note: peak.fullLabel }] : []),
    ...(current ? [{ label: "This month so far", value: fmt.money(current.total) }] : []),
  ]
  return (
    <dl className="space-y-2.5">
      {facts.map((f) => (
        <div key={f.label}>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{f.label}</dt>
          <dd className="text-sm font-medium tabular-nums">
            {f.value}
            {"note" in f && f.note ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{f.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function SpendingTrendCard({ data, tier }: CardViewProps) {
  if (!isTrendData(data)) throw new Error("Unexpected Spending Trend card data")

  if (!data.hasCosts) {
    // At the smallest tier there is no room for the header link beside the title.
    return (
      <CardShell title={TITLE} href={tier === TIER_HEADLINE ? undefined : HREF}>
        <CardMessage icon={PiggyBank} message="No costs recorded yet." />
      </CardShell>
    )
  }

  const canChart = chartable(data.points.map((p) => p.total))

  if (tier === TIER_HEADLINE) {
    // Too narrow for the header link beside the title: the figure is the link.
    return (
      <CardShell title={TITLE} className="px-3 pb-3">
        <Link href={HREF} className="block rounded-md px-2 py-1 transition-colors duration-150 hover:bg-muted/60">
          <Headline data={data} />
        </Link>
      </CardShell>
    )
  }

  if (tier === TIER_CHART) {
    return (
      <CardShell title={TITLE} href={HREF} className="flex flex-col gap-4 px-5 pb-4">
        <Headline data={data} />
        {canChart ? (
          <div className="min-h-0 flex-1">
            <SpendArea points={data.points} prior={data.prior} priorLabel={data.priorLabel} fill />
          </div>
        ) : (
          <NoChart />
        )}
      </CardShell>
    )
  }

  return (
    <CardShell title={TITLE} href={HREF} className="flex gap-6 px-5 pb-4">
      <div className="flex w-52 shrink-0 flex-col gap-5">
        <Headline data={data} />
        <Facts data={data} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {canChart ? (
          <MonthBars points={data.points} prior={data.prior} priorLabel={data.priorLabel} average={data.average} />
        ) : (
          <NoChart />
        )}
      </div>
    </CardShell>
  )
}
