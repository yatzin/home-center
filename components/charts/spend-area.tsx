"use client"

import { ChartFrame } from "./primitives/chart-frame"
import { XLabels } from "./primitives/axis"
import { ChartTable } from "./primitives/chart-table"
import { TooltipCard, useChartTooltip } from "./primitives/tooltip"
import { fitLabels, niceMax, niceTicks } from "./primitives/scale"
import { useWidth } from "./primitives/use-width"
import { type BucketPoint } from "@/lib/costs"
import { useFormat } from "@/components/regional-provider"

const PLOT_HEIGHT = 116
const Y_AXIS_WIDTH = 38

// The dashboard's spending chart: one measure over twelve months, with the same
// twelve months a year earlier behind it for reference.
//
// No categories here on purpose. The card answers "are we spending more than we
// were", and a six-way category split is a different question that the /costs
// page is where to ask. That also leaves the comparison series free to be a plain
// neutral, which it could not be if six hues were already in play.
export function SpendArea({
  points,
  prior,
  priorLabel,
  fill = false,
}: {
  points: BucketPoint[]
  /// The same buckets one year earlier, aligned index-for-index.
  prior: number[]
  priorLabel: string
  /// Fill the parent's height instead of a fixed plot height, with the table
  /// view for screen readers only (a dashboard card: fixed box, no room for a
  /// disclosure to open into).
  fill?: boolean
}) {
  const fmt = useFormat()
  const { containerRef, cardRef, tip, offset, anchorProps } = useChartTooltip()
  const [boxRef, boxWidth] = useWidth<HTMLDivElement>()

  if (points.length < 2) return null

  const peak = Math.max(0, ...points.map((p) => p.total), ...prior)
  const domainMax = niceMax(peak, 2)
  const ticks = niceTicks(peak, 2)

  const x = (i: number) => (i / (points.length - 1)) * 100
  const y = (value: number) => (1 - value / domainMax) * 100
  const path = (values: number[]) =>
    values.map((v, i) => (i === 0 ? "M" : "L") + x(i).toFixed(3) + "," + y(v).toFixed(3)).join(" ")

  // A month that nets to a refund draws at the baseline, not below the plot
  // (the domain starts at 0); its tooltip and table still give the real figure.
  const current = points.map((p) => Math.max(0, p.total))
  const currentLine = path(current)
  const currentArea = currentLine + " L100," + y(0).toFixed(3) + " L0," + y(0).toFixed(3) + " Z"
  const hasPrior = prior.some((v) => v > 0)

  return (
    <div className={fill ? "flex h-full min-h-0 flex-col gap-2" : "space-y-2"}>
      <div ref={boxRef} className={fill ? "min-h-0 flex-1" : undefined}>
        <ChartFrame
          plotHeight={fill ? undefined : PLOT_HEIGHT}
          ticks={ticks}
          domainMax={domainMax}
          formatTick={fmt.moneyCompact}
          yAxisWidth={Y_AXIS_WIDTH}
          xAxis={
            fill ? (
              // Thinned to the card's real width, counted back from this month.
              <XLabels
                labels={fitLabels(points.map((p) => p.label), boxWidth - Y_AXIS_WIDTH)}
                maxLabels={points.length}
                highlightIndex={points.length - 1}
              />
            ) : (
              <XLabels labels={points.map((p) => p.label)} maxLabels={6} highlightIndex={points.length - 1} />
            )
          }
        >
          <div ref={containerRef} className="absolute inset-0">
            <svg
              aria-hidden="true"
              className="absolute inset-0 h-full w-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* Prior period first, so the current one draws over it. Neutral and
                  thinner: it is a reference the eye should be able to ignore. */}
              {hasPrior ? (
                <path
                  d={path(prior.map((v) => Math.max(0, v)))}
                  fill="none"
                  stroke="var(--chart-ghost)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              <path d={currentArea} fill="var(--cost-bar)" opacity={0.1} />
              <path
                // The draw-in dash is measured in screen px (non-scaling stroke),
                // so a fixed 400 cuts short any line longer than that. Filling a
                // card the line can be any length, so it skips the draw-in.
                className={fill ? undefined : "chart-draw"}
                style={fill ? undefined : { ["--chart-draw-length" as string]: "400" }}
                d={currentLine}
                fill="none"
                stroke="var(--cost-bar)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* The current month gets an end marker with a surface ring, so it
                  stays legible where it crosses the reference line. */}
              <circle
                cx={x(points.length - 1)}
                cy={y(current[current.length - 1])}
                r={0}
                fill="none"
                stroke="var(--card)"
                strokeWidth={9}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={x(points.length - 1)}
                cy={y(current[current.length - 1])}
                r={0}
                fill="none"
                stroke="var(--cost-bar)"
                strokeWidth={7}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* Hit areas over the plot. The reader aims at a month, not at a 2px
                line, so each target is a full-height column. */}
            <div className="absolute inset-0 flex">
              {points.map((point, i) => (
                <div
                  key={point.key}
                  tabIndex={0}
                  role="img"
                  aria-label={point.fullLabel + ": " + fmt.money(point.total)}
                  className="min-w-0 flex-1 rounded-sm outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50"
                  {...anchorProps({
                    title: point.fullLabel,
                    rows: [
                      { label: "Spend", value: fmt.money(point.total), color: "var(--cost-bar)" },
                      ...(hasPrior
                        ? [{ label: priorLabel, value: fmt.money(prior[i]), color: "var(--chart-ghost)", muted: true }]
                        : []),
                    ],
                  })}
                />
              ))}
            </div>

            <TooltipCard tip={tip} cardRef={cardRef} offset={offset} />
          </div>
        </ChartFrame>
      </div>

      {/* Two series, so a legend is present. It is never optional at two. */}
      {hasPrior ? (
        <ul className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ backgroundColor: "var(--cost-bar)" }} />
            Last 12 months
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ backgroundColor: "var(--chart-ghost)" }} />
            {priorLabel}
          </li>
        </ul>
      ) : null}

      <ChartTable
        srOnly={fill}
        caption="Monthly spending against the same month a year earlier"
        columns={[
          { key: "month", label: "Month" },
          { key: "total", label: "Spend", align: "right" },
          ...(hasPrior ? [{ key: "prior", label: priorLabel, align: "right" as const }] : []),
        ]}
        rows={points.map((point, i) => ({
          month: point.fullLabel,
          total: fmt.money(point.total),
          prior: fmt.money(prior[i]),
        }))}
      />
    </div>
  )
}
