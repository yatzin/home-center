import type { SparkPoint } from "@/lib/costs"

// The one shape CSS cannot express, so the one component here that is SVG. A
// single series, so no legend — the caption above it names what this is.
export function Sparkline({
  points,
  className = "h-10 w-full",
}: {
  points: SparkPoint[]
  className?: string
}) {
  if (points.length < 2) return null

  const width = 100
  const height = 28
  const max = Math.max(...points.map((p) => p.total))
  // A flat series would divide by zero; drawing it along the baseline is honest.
  const scale = max > 0 ? max : 1

  const coords = points.map((point, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - (point.total / scale) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      // Without this the stroke width would be scaled by the aspect distortion
      // and the line would render thicker horizontally than vertically.
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`Spend per year from ${points[0].year} to ${points[points.length - 1].year}`}
    >
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="var(--cost-bar)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
