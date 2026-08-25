import { formatMoney, formatMoneyCompact, type MonthPoint } from "@/lib/costs"

const CHART_HEIGHT = 128

// One column per month, single hue: these are consecutive periods, not separate
// series, so colour carries no identity here — height alone does the work.
export function MonthColumns({ points }: { points: MonthPoint[] }) {
  if (points.length === 0) return null

  return (
    <div className="flex items-stretch gap-2" style={{ height: CHART_HEIGHT }}>
      {points.map((point) => (
        <div key={point.key} className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="truncate text-center text-[11px] tabular-nums text-muted-foreground">
            {point.total > 0 ? formatMoneyCompact(point.total) : "—"}
          </div>

          {/* The track takes the leftover height and the fill is positioned
              against it. Sizing the fill directly as a flex sibling of the two
              labels would let their fixed heights eat into it, clamping every
              tall bar to the same height and flattening the top of the range. */}
          <div className="relative min-h-0 w-full flex-1">
            <div
              className="absolute inset-x-0 bottom-0 rounded-t"
              // A month with real spending keeps a visible sliver; a month with
              // none draws nothing at all, so zero reads as zero.
              style={{
                height: `${point.total > 0 ? Math.max(point.share * 100, 2) : 0}%`,
                backgroundColor: "var(--cost-bar)",
              }}
              title={`${point.label}: ${formatMoney(point.total)}`}
            />
          </div>

          <div className="text-center text-[11px] text-muted-foreground">{point.label}</div>
        </div>
      ))}
    </div>
  )
}
