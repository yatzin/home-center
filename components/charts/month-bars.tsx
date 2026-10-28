"use client"

import { ChartFrame } from "./primitives/chart-frame"
import { XLabels } from "./primitives/axis"
import { ChartTable } from "./primitives/chart-table"
import { TooltipCard, useChartTooltip } from "./primitives/tooltip"
import { fitLabels, niceMax, niceTicks } from "./primitives/scale"
import { useWidth } from "./primitives/use-width"
import { type BucketPoint } from "@/lib/costs"
import { useFormat } from "@/components/regional-provider"

/// Bars stop growing past this; the rest of a wide slot is air.
const MAX_BAR_WIDTH = 28
const Y_AXIS_WIDTH = 38

// Month-by-month spend as discrete amounts: the reading the area chart cannot
// give. Each month is one bar in the series hue; the same month a year earlier
// is a wider pale bar behind it (a reference, not a second solid series
// fighting for attention); the mean month is one dashed rule with its value written on it;
// and only the peak month carries a direct label. Fills its parent's height.
export function MonthBars({
  points,
  prior,
  priorLabel,
  average,
}: {
  points: BucketPoint[]
  /// The same months a year earlier, aligned index-for-index.
  prior: number[]
  priorLabel: string
  /// Mean monthly spend; drawn as a reference rule when above zero.
  average: number
}) {
  const fmt = useFormat()
  const { containerRef, cardRef, tip, offset, anchorProps } = useChartTooltip()
  const [boxRef, boxWidth] = useWidth<HTMLDivElement>()

  if (points.length < 2) return null

  const hasPrior = prior.some((v) => v > 0)
  const peak = Math.max(0, ...points.map((p) => p.total), ...(hasPrior ? prior : []))
  const domainMax = niceMax(peak, 3)
  const ticks = niceTicks(peak, 3)
  const pct = (v: number) => (Math.max(0, v) / domainMax) * 100
  const peakIndex = points.reduce((best, p, i) => (p.total > points[best].total ? i : best), 0)
  const last = points.length - 1

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div ref={boxRef} className="min-h-0 flex-1">
        <ChartFrame
          ticks={ticks}
          domainMax={domainMax}
          formatTick={fmt.moneyCompact}
          yAxisWidth={Y_AXIS_WIDTH}
          xAxis={
            <XLabels
              labels={fitLabels(points.map((p) => p.label), boxWidth - Y_AXIS_WIDTH, 32)}
              maxLabels={points.length}
              highlightIndex={last}
            />
          }
        >
          <div ref={containerRef} className="absolute inset-0">
            <div className="absolute inset-0 flex">
              {points.map((point, i) => {
                const priorValue = prior[i] ?? 0
                return (
                  <div
                    key={point.key}
                    tabIndex={0}
                    role="img"
                    aria-label={
                      point.fullLabel +
                      ": " +
                      fmt.money(point.total) +
                      (hasPrior ? ", " + priorLabel + ": " + fmt.money(priorValue) : "")
                    }
                    className="relative min-w-0 flex-1 rounded-sm outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50"
                    {...anchorProps({
                      title: point.fullLabel + (i === last ? " (so far)" : ""),
                      rows: [
                        { label: "Spend", value: fmt.money(point.total), color: "var(--cost-bar)" },
                        ...(hasPrior
                          ? [{ label: priorLabel, value: fmt.money(priorValue), color: "var(--chart-ghost)", muted: true }]
                          : []),
                        ...(average > 0
                          ? [{ label: "Monthly average", value: fmt.money(average), muted: true }]
                          : []),
                      ],
                    })}
                  >
                    {/* Last year's month: a wider, pale bar behind this year's,
                        so the two read as one comparison per month without a
                        second solid series competing for attention. */}
                    {hasPrior && priorValue > 0 ? (
                      <div
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 mx-auto rounded-t"
                        style={{
                          width: `min(88%, ${MAX_BAR_WIDTH + 12}px)`,
                          height: `max(${pct(priorValue)}%, 2px)`,
                          backgroundColor: "var(--chart-ghost)",
                          opacity: 0.35,
                        }}
                      />
                    ) : null}
                    {/* This year's bar: 4px rounded data end, square at the baseline. */}
                    {point.total > 0 ? (
                      <div
                        aria-hidden="true"
                        className="chart-grow absolute inset-x-0 bottom-0 mx-auto rounded-t"
                        style={{
                          width: `min(56%, ${MAX_BAR_WIDTH}px)`,
                          height: `max(${pct(point.total)}%, 2px)`,
                          backgroundColor: "var(--cost-bar)",
                          animationDelay: Math.min(i * 25, 250) + "ms",
                        }}
                      />
                    ) : null}
                    {/* The one direct label: the peak month's amount. */}
                    {i === peakIndex && point.total > 0 ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums text-foreground"
                        style={{ bottom: `calc(${pct(point.total)}% + 3px)` }}
                      >
                        {fmt.moneyCompact(point.total)}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {average > 0 ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 border-t border-dashed"
                style={{ bottom: `${pct(average)}%`, borderColor: "var(--chart-trend)" }}
              >
                <span className="absolute right-0 bottom-0.5 rounded-sm bg-card/85 px-1 text-[10px] tabular-nums text-muted-foreground">
                  avg {fmt.moneyCompact(average)}
                </span>
              </div>
            ) : null}

            <TooltipCard tip={tip} cardRef={cardRef} offset={offset} />
          </div>
        </ChartFrame>
      </div>

      <ul className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: "var(--cost-bar)" }} />
          Last 12 months
        </li>
        {hasPrior ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] opacity-35" style={{ backgroundColor: "var(--chart-ghost)" }} />
            {priorLabel}
          </li>
        ) : null}
        {average > 0 ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="w-3.5 border-t border-dashed" style={{ borderColor: "var(--chart-trend)" }} />
            Monthly average
          </li>
        ) : null}
      </ul>

      <ChartTable
        srOnly
        caption="Spending by month, with the same month a year earlier"
        columns={[
          { key: "month", label: "Month" },
          { key: "total", label: "Spend", align: "right" },
          ...(hasPrior ? [{ key: "prior", label: priorLabel, align: "right" as const }] : []),
        ]}
        rows={points.map((point, i) => ({
          month: point.fullLabel,
          total: fmt.money(point.total),
          prior: fmt.money(prior[i] ?? 0),
        }))}
      />
    </div>
  )
}
