// Pure scale and tick maths. No React, no DOM, no imports — the same reason
// lib/costs.ts is written the way it is: these are the parts most worth unit
// testing if a runner is ever added, and they stay cheap to test by having no
// dependencies to stand up.

/// Maps a value in `domain` onto `range`, clamped to the range's ends. Clamping
/// matters because a rounded "nice" maximum can sit below a real datum only
/// through floating-point drift, and an unclamped scale would draw that mark a
/// fraction of a pixel outside the plot.
export function linearScale(
  domain: [number, number],
  range: [number, number]
): (value: number) => number {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0
  return (value) => {
    if (span === 0) return r0
    const t = (value - d0) / span
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t
    return r0 + clamped * (r1 - r0)
  }
}

export type Band = {
  /// Left edge of the band for `key`, or null if the key is not in the scale.
  position(key: string): number | null
  bandwidth: number
  step: number
}

/// Evenly spaced slots with padding expressed as a fraction of the step, the
/// same shape d3's band scale has. `padding` is the share of each step given
/// over to air, so 0.2 leaves a bar occupying 80% of its slot.
export function bandScale(keys: string[], range: [number, number], padding = 0.2): Band {
  const [r0, r1] = range
  const n = keys.length
  const step = n > 0 ? (r1 - r0) / n : 0
  const bandwidth = step * (1 - padding)
  const index = new Map(keys.map((key, i) => [key, i]))
  return {
    position(key) {
      const i = index.get(key)
      return i === undefined ? null : r0 + i * step + (step - bandwidth) / 2
    },
    bandwidth,
    step,
  }
}

/// Ticks on 1-2-5 multiples of a power of ten, from zero through the first
/// "nice" value at or above `max`. This is what stops an axis from reading
/// $0 / $974.60 / $1,949.20 — the ticks are the values a reader can do
/// arithmetic with, and the last one becomes the scale's domain maximum so the
/// tallest mark lands exactly on the top gridline.
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0]
  const rough = max / Math.max(1, count)
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const normalized = rough / magnitude
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude
  const steps = Math.ceil(max / step)
  // Built by multiplication rather than by accumulating `+= step`, which drifts
  // and produces ticks like 2999.9999999999995.
  return Array.from({ length: steps + 1 }, (_, i) => i * step)
}

/// The domain maximum implied by `niceTicks` — the top gridline.
export function niceMax(max: number, count = 4): number {
  const ticks = niceTicks(max, count)
  return ticks[ticks.length - 1] || 1
}

/// Straight-line path through points already in plot coordinates. Returns an
/// empty string for fewer than two points, which callers use to skip the mark
/// rather than emitting a degenerate `<path d="">`.
export function linePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ""
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")
}

/// The same line closed down to `baseline` and back, for an area fill.
export function areaPath(points: { x: number; y: number }[], baseline: number): string {
  if (points.length < 2) return ""
  const first = points[0]
  const last = points[points.length - 1]
  return `${linePath(points)} L${last.x.toFixed(2)},${baseline.toFixed(2)} L${first.x.toFixed(2)},${baseline.toFixed(2)} Z`
}

/// Splits a series that may contain gaps into runs of consecutive real values, so
/// a line with a `null` hole is drawn as two strokes rather than one that leaps
/// the gap. `rollingAverage` produces exactly this shape at its leading edge.
export function segments<T>(values: (T | null)[]): { start: number; values: T[] }[] {
  const runs: { start: number; values: T[] }[] = []
  let current: { start: number; values: T[] } | null = null
  values.forEach((value, i) => {
    if (value === null) {
      current = null
      return
    }
    if (current === null) {
      current = { start: i, values: [] }
      runs.push(current)
    }
    current.values.push(value)
  })
  return runs
}

/// Every nth label, chosen so no more than `maxLabels` are shown. Twelve months
/// fit on a wide card and collide on a narrow one; rather than measure text, the
/// callers pass the count they know fits and the rest are dropped from the axis
/// (never from the tooltip or the table, which stay complete).
export function labelStride(count: number, maxLabels: number): number {
  if (count <= maxLabels || maxLabels <= 0) return 1
  return Math.ceil(count / maxLabels)
}
