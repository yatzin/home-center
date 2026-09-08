// A sparkline carries shape, not values — it rides beside a number that already
// states the magnitude. Values live in the tile's own figure and in the table
// view of whatever chart it summarises, so nothing here is the only way to read
// one.
//
// preserveAspectRatio="none" is deliberate and, at a fixed height, unavoidable:
// the mark has independent x and y scales like any plot. What the previous
// version was missing is not the aspect lock but the reference marks — a
// baseline, an area wash, and an end point — which are what let a reader tell a
// rise from a plateau without an axis.

const VIEW_W = 100
const VIEW_H = 30

export function Sparkline({
  values,
  ariaLabel,
  className = "h-9 w-full",
  color = "var(--cost-bar)",
  showArea = true,
  showEnd = true,
}: {
  values: number[]
  ariaLabel: string
  className?: string
  color?: string
  showArea?: boolean
  showEnd?: boolean
}) {
  if (values.length < 2) return null

  const max = Math.max(...values)
  // A flat series would divide by zero; drawing it along the baseline is honest.
  const scale = max > 0 ? max : 1

  const points = values.map((value, i) => ({
    x: (i / (values.length - 1)) * VIEW_W,
    y: VIEW_H - (value / scale) * VIEW_H,
  }))

  const line = points.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(2) + "," + p.y.toFixed(2)).join(" ")
  const area = line + " L" + VIEW_W + "," + VIEW_H + " L0," + VIEW_H + " Z"
  const last = points[points.length - 1]

  return (
    <svg
      viewBox={"0 0 " + VIEW_W + " " + VIEW_H}
      preserveAspectRatio="none"
      className={className + " overflow-visible"}
      role="img"
      aria-label={ariaLabel}
    >
      {/* The area is a wash at 10%, never a saturated block — it marks the
          baseline the line is measured from without competing with the line. */}
      {showArea ? <path d={area} fill={color} opacity={0.1} /> : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showEnd ? (
        <circle
          cx={last.x}
          cy={last.y}
          // Radius in viewBox units would be squashed by the x/y scale
          // difference into an ellipse; a non-scaling stroke on a zero-radius
          // circle draws a true round dot at any container size.
          r={0}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  )
}
