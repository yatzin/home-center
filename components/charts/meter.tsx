// A single value against a reference — the form for "how far through something
// are we", where a chart with an axis would be more apparatus than the one number
// deserves.
//
// The track is the fill's own hue at low opacity rather than a neutral grey, so
// the whole bar reads as one measure with a filled part and an unfilled part,
// not as a mark sitting on unrelated furniture.
export function Meter({
  value,
  max,
  color,
  label,
  valueLabel,
  note,
}: {
  value: number
  max: number
  /// The caller picks the hue, because severity is domain knowledge: what counts
  /// as "a lot" for service cost against purchase price is not something this
  /// component can know.
  color: string
  label: string
  valueLabel: string
  note?: string
}) {
  const share = max > 0 ? value / max : 0
  // Past the reference the bar is full and the number carries the overrun. A bar
  // that kept growing would need a scale nobody stated.
  const percent = Math.min(share, 1) * 100

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium tabular-nums">{valueLabel}</span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full"
        // A lighter step of the fill's own hue, mixed rather than hand-picked, so
        // one colour argument covers both parts of the bar at every severity.
        style={{ backgroundColor: "color-mix(in oklab, " + color + " 18%, transparent)" }}
        role="img"
        aria-label={label + ": " + valueLabel}
      >
        <div
          className="chart-grow-x h-full rounded-full"
          style={{ width: Math.max(percent, share > 0 ? 1.5 : 0) + "%", backgroundColor: color }}
        />
      </div>
      {note ? <p className="mt-1.5 text-[11px] text-muted-foreground">{note}</p> : null}
    </div>
  )
}
