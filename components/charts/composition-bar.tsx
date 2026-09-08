"use client"

import Link from "next/link"
import { ChartTable } from "./primitives/chart-table"
import { Legend, type LegendItem } from "./primitives/legend"
import { TooltipCard, useChartTooltip } from "./primitives/tooltip"
import { formatMoney, type RankedEntry } from "@/lib/costs"

/// Colour and link resolved by the caller, on the server. A client component
/// cannot take a `colorFor(key)` or `hrefFor(entry)` callback across the RSC
/// boundary — functions are not serializable — so the data arrives resolved.
export type CompositionSlice = RankedEntry & { color: string; href?: string }

/// Below this share, a segment is too narrow to hold its own label at any
/// sensible font size. Those keep the segment and drop the label to the legend,
/// the tooltip, and the table — never a clipped or overflowing one.
const LABEL_MIN_SHARE = 0.11
const BAR_HEIGHT = 40
const SEGMENT_GAP = 2

// Part-to-whole, at a glance. A stacked bar rather than a pie because the
// question here is "what is the mix", and reading a mix off angles is harder
// than reading it off one straight run.
export function CompositionBar({
  entries,
  activeKey,
  emptyMessage = "Nothing to show yet.",
  caption,
}: {
  entries: CompositionSlice[]
  activeKey?: string
  emptyMessage?: string
  caption?: string
}) {
  const { containerRef, cardRef, tip, offset, anchorProps } = useChartTooltip()

  const total = entries.reduce((sum, e) => sum + e.total, 0)
  if (entries.length === 0 || total <= 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
  }

  const legendItems: LegendItem[] = entries.map((entry) => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
  }))

  const hrefByKey = new Map(entries.flatMap((e) => (e.href ? [[e.key, e.href] as const] : [])))
  const linked = hrefByKey.size > 0

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="relative">
        <div className="flex w-full overflow-hidden" style={{ height: BAR_HEIGHT }}>
          {entries.map((entry, i) => {
            const share = entry.total / total
            const percent = share * 100
            const color = entry.color
            const content = {
              title: entry.label,
              rows: [
                { label: "Spend", value: formatMoney(entry.total), color },
                { label: "Share", value: percent.toFixed(1) + "%", muted: true },
                {
                  label: entry.count === 1 ? "1 record" : entry.count + " records",
                  value: "",
                  muted: true,
                },
              ],
            }
            const isFirst = i === 0
            const isLast = i === entries.length - 1
            const dimmed = activeKey != null && activeKey !== entry.key

            const body = (
              <span
                className="chart-grow-x flex h-full w-full items-center justify-center"
                style={{
                  backgroundColor: color,
                  opacity: dimmed ? 0.35 : 1,
                  borderTopLeftRadius: isFirst ? 4 : 0,
                  borderBottomLeftRadius: isFirst ? 4 : 0,
                  borderTopRightRadius: isLast ? 4 : 0,
                  borderBottomRightRadius: isLast ? 4 : 0,
                  animationDelay: Math.min(i * 40, 240) + "ms",
                }}
              >
                {/* A label only where it demonstrably fits. Text set inside a
                    fill takes white or ink by the fill's own luminance, which is
                    why the caller supplies colours from the validated ramp and
                    not arbitrary ones. */}
                {share >= LABEL_MIN_SHARE ? (
                  <span className="px-1 text-[11px] font-medium text-white mix-blend-luminosity">
                    {Math.round(percent)}%
                  </span>
                ) : null}
              </span>
            )

            const shared = {
              className: "block h-full outline-none transition-opacity focus-visible:opacity-80",
              style: {
                width: percent + "%",
                // Negative space does the separating, at the same width as every
                // other stack in the app.
                marginRight: isLast ? 0 : SEGMENT_GAP,
              },
              ...anchorProps(content),
            }

            return entry.href ? (
              <Link
                key={entry.key}
                href={entry.href}
                aria-label={entry.label + ": " + formatMoney(entry.total)}
                {...shared}
              >
                {body}
              </Link>
            ) : (
              <div
                key={entry.key}
                tabIndex={0}
                role="img"
                aria-label={entry.label + ": " + formatMoney(entry.total)}
                {...shared}
              >
                {body}
              </div>
            )
          })}
        </div>
        <TooltipCard tip={tip} cardRef={cardRef} offset={offset} />
      </div>

      {/* The legend and the bar are the same control: both set the category
          filter, so clicking a label does exactly what clicking its slice does. */}
      <Legend
        items={legendItems}
        hrefFor={linked ? (item) => hrefByKey.get(item.key) ?? "" : undefined}
        activeKey={activeKey}
      />

      <ChartTable
        caption={caption}
        columns={[
          { key: "label", label: "Category" },
          { key: "total", label: "Spend", align: "right" },
          { key: "share", label: "Share", align: "right" },
          { key: "count", label: "Records", align: "right" },
        ]}
        rows={entries.map((entry) => ({
          label: entry.label,
          total: formatMoney(entry.total),
          share: ((entry.total / total) * 100).toFixed(1) + "%",
          count: entry.count,
        }))}
      />
    </div>
  )
}
