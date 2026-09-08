import { labelStride } from "./scale"

// Axis chrome. Recessive by construction: hairline solid rules one step off the
// surface, and every piece of text wears a text token rather than a data colour.

export function YGrid({ ticks, domainMax }: { ticks: number[]; domainMax: number }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {ticks.map((tick) => (
        <div
          key={tick}
          className="absolute inset-x-0"
          style={{
            // Measured from the top so the zero line lands exactly on the
            // baseline the marks grow from.
            top: `${(1 - tick / domainMax) * 100}%`,
            borderTopWidth: 1,
            // The baseline is the one rule allowed to be a shade stronger; the
            // rest recede behind the data.
            borderColor: tick === 0 ? "var(--border)" : "var(--chart-grid)",
          }}
        />
      ))}
    </div>
  )
}

export function YTickLabels({
  ticks,
  domainMax,
  format,
}: {
  ticks: number[]
  domainMax: number
  format: (value: number) => string
}) {
  return (
    <div aria-hidden="true" className="relative h-full">
      {ticks.map((tick) => (
        <span
          key={tick}
          className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
          style={{ top: `${(1 - tick / domainMax) * 100}%` }}
        >
          {format(tick)}
        </span>
      ))}
    </div>
  )
}

/// One label per slot, thinned to `maxLabels` when they would collide. Dropped
/// labels are dropped from the axis only — the tooltip and the table view still
/// carry every period, so no value becomes unreachable.
export function XLabels({
  labels,
  maxLabels = 12,
  highlightIndex,
}: {
  labels: string[]
  maxLabels?: number
  highlightIndex?: number
}) {
  const stride = labelStride(labels.length, maxLabels)
  return (
    <div aria-hidden="true" className="flex pt-2">
      {labels.map((label, i) => (
        <div key={i} className="min-w-0 flex-1 text-center">
          {/* The last slot always keeps its label: with a stride that does not
              divide evenly it would otherwise be dropped, leaving the axis
              ending on an unlabelled period — the one a reader looks at first. */}
          {i % stride === 0 || i === labels.length - 1 ? (
            <span
              className={
                i === highlightIndex
                  ? "text-[10px] font-medium text-foreground"
                  : "text-[10px] text-muted-foreground"
              }
            >
              {label}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
