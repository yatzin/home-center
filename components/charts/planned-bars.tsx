"use client"

import { ChartFrame } from "./primitives/chart-frame"
import { XLabels } from "./primitives/axis"
import { ChartTable } from "./primitives/chart-table"
import { TooltipCard, useChartTooltip } from "./primitives/tooltip"
import { niceMax, niceTicks } from "./primitives/scale"
import { useSize } from "./primitives/use-width"
import { useFormat } from "@/components/regional-provider"
import { PLANNED_TYPE_LABELS, plannedBarDensity } from "@/lib/dashboard/planned-spend"

/// Bars stop growing past this; the rest of a wide slot is air.
const MAX_BAR_WIDTH = 28
const Y_AXIS_WIDTH = 38

/// The asset-type hues, in the stacking order: the validated cost palette's first four slots
/// (adjacent CVD separation holds in light and dark). Colour follows the type, never its size.
export const PLANNED_TYPE_COLORS: Record<string, string> = {
  PROPERTY: "var(--cost-routine)",
  VEHICLE: "var(--cost-repair)",
  EQUIPMENT: "var(--cost-upgrade)",
  PERSON: "var(--cost-inspection)",
}
const SINGLE = "var(--cost-bar)"

export type PlannedBarMonth = {
  key: string
  label: string
  fullLabel: string
  total: number
  count: number
  parts: { assetType: string; total: number }[]
}

export function PlannedLegend({ types }: { types: string[] }) {
  return (
    <ul className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
      {types.map((t) => (
        <li key={t} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: PLANNED_TYPE_COLORS[t] }} />
          {PLANNED_TYPE_LABELS[t] ?? t}
        </li>
      ))}
    </ul>
  )
}

// Planned spend by month going forward: one bar per month from this one, the
// current month marked, the biggest month the one direct label. With `stacked`
// each bar splits by asset type (the legend is the caller's, so it can drop it
// when short of room). Chrome follows the measured plot: a y-axis only when
// tall and wide enough, month names, then initials, then none. Fills its
// parent's height.
export function PlannedBars({
  months,
  peakIndex,
  stacked = false,
  caption = "Planned spend by month",
}: {
  months: PlannedBarMonth[]
  peakIndex: number
  stacked?: boolean
  caption?: string
}) {
  const fmt = useFormat()
  const { containerRef, cardRef, tip, offset, anchorProps } = useChartTooltip()
  const [boxRef, box] = useSize<HTMLDivElement>()

  if (months.length < 2) return null

  const { axis, labels } = plannedBarDensity(box.width, months.length, box.height)
  const peak = Math.max(0, ...months.map((m) => m.total))
  const domainMax = niceMax(peak, 3)
  const ticks = niceTicks(peak, 3)
  const pct = (v: number) => (Math.max(0, v) / domainMax) * 100
  const types = stacked ? [...new Set(months.flatMap((m) => m.parts.map((p) => p.assetType)))] : []
  const split = stacked && types.length >= 2
  const slot = (box.width - (axis ? Y_AXIS_WIDTH : 0)) / months.length
  // A direct label needs about 28px; in a narrower slot the headline says the peak.
  const labelPeak = slot >= 24

  const plot = (
    <div ref={containerRef} className="absolute inset-0">
      <div className="absolute inset-0 flex">
        {months.map((m, i) => (
          <div
            key={m.key}
            tabIndex={0}
            role="img"
            aria-label={`${m.fullLabel}${i === 0 ? " (this month)" : ""}: ${fmt.money(m.total)}`}
            className="relative min-w-0 flex-1 rounded-sm outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50"
            {...anchorProps({
              title: m.fullLabel + (i === 0 ? " (this month)" : ""),
              rows: [
                ...(split && m.parts.length > 0
                  ? m.parts.map((p) => ({ label: PLANNED_TYPE_LABELS[p.assetType] ?? p.assetType, value: fmt.money(p.total), color: PLANNED_TYPE_COLORS[p.assetType] }))
                  : [{ label: "Planned", value: fmt.money(m.total), color: SINGLE }]),
                { label: m.count === 1 ? "1 reminder due" : `${m.count} reminders due`, value: "", muted: true },
              ],
              ...(split && m.parts.length > 1 ? { total: fmt.money(m.total) } : {}),
            })}
          >
            {m.total > 0 ? (
              <div
                aria-hidden="true"
                className="chart-grow absolute inset-x-0 bottom-0 mx-auto flex flex-col-reverse gap-px"
                style={{ width: `min(56%, ${MAX_BAR_WIDTH}px)`, height: `max(${pct(m.total)}%, 3px)`, animationDelay: Math.min(i * 25, 250) + "ms" }}
              >
                {split ? (
                  m.parts.map((p) => (
                    <div
                      key={p.assetType}
                      className="min-h-px w-full last:rounded-t"
                      style={{ flex: `${p.total} 1 0px`, backgroundColor: PLANNED_TYPE_COLORS[p.assetType] }}
                    />
                  ))
                ) : (
                  <div className="h-full w-full rounded-t" style={{ backgroundColor: SINGLE }} />
                )}
              </div>
            ) : (
              // A month with nothing planned keeps a hairline so the timeline stays continuous.
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 mx-auto h-px w-[min(40%,12px)] bg-border" />
            )}
            {i === peakIndex && labelPeak ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums text-foreground"
                style={{ bottom: `calc(${pct(m.total)}% + 3px)` }}
              >
                {fmt.moneyCompact(m.total)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <TooltipCard tip={tip} cardRef={cardRef} offset={offset} />
    </div>
  )

  const labelTexts = months.map((m) => (labels === "initial" ? m.label.charAt(0).toUpperCase() : m.label))
  const xAxis =
    labels === "none" ? null : <XLabels labels={labelTexts} maxLabels={months.length} highlightIndex={0} />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={boxRef} className="min-h-0 flex-1">
        {axis ? (
          <ChartFrame ticks={ticks} domainMax={domainMax} formatTick={fmt.moneyCompact} yAxisWidth={Y_AXIS_WIDTH} xAxis={xAxis}>
            {plot}
          </ChartFrame>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="relative min-h-0 flex-1 border-b border-border">{plot}</div>
            {xAxis}
          </div>
        )}
      </div>

      <ChartTable
        srOnly
        caption={caption}
        columns={[
          { key: "month", label: "Month" },
          ...(split ? types.map((t) => ({ key: t, label: PLANNED_TYPE_LABELS[t] ?? t, align: "right" as const })) : []),
          { key: "total", label: "Planned", align: "right" },
        ]}
        rows={months.map((m) => ({
          month: m.fullLabel,
          total: fmt.money(m.total),
          ...Object.fromEntries(types.map((t) => [t, fmt.money(m.parts.find((p) => p.assetType === t)?.total ?? 0)])),
        }))}
      />
    </div>
  )
}
