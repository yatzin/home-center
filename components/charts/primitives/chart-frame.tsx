import { YGrid, YTickLabels } from "./axis"

// The coordinate system every chart draws into.
//
// Deliberately HTML and CSS rather than a scaled SVG viewBox. The previous
// generation of these charts learned this the hard way twice: text inside a
// viewBox distorts with the container's aspect, and `preserveAspectRatio="none"`
// (which the old sparkline used) silently reshapes the data itself. Percentage
// heights inside a flex column have neither problem, need no measurement pass,
// and are correct on the very first server-rendered paint.
//
// Charts that genuinely need a curve — lines, areas — nest an aspect-locked SVG
// inside the plot area and keep their text out here in HTML.

export function ChartFrame({
  plotHeight,
  ticks,
  domainMax,
  formatTick,
  yAxisWidth = 46,
  children,
  xAxis,
}: {
  plotHeight: number
  ticks: number[]
  domainMax: number
  formatTick: (value: number) => string
  yAxisWidth?: number
  /// The plot content, absolutely filling the plot rect.
  children: React.ReactNode
  /// Rendered below the plot, inset to line up with it. Outside the fixed plot
  /// height on purpose — a container sized to exclude its own axis band is what
  /// produces a card with a tiny nested scrollbar.
  xAxis?: React.ReactNode
}) {
  return (
    // pt-2 gives the topmost tick label, which is centred on the top gridline,
    // room to sit without overflowing the card above it.
    <div className="pt-2">
      <div className="flex" style={{ height: plotHeight }}>
        <div className="shrink-0" style={{ width: yAxisWidth }}>
          <YTickLabels ticks={ticks} domainMax={domainMax} format={formatTick} />
        </div>
        <div className="relative min-w-0 flex-1">
          <YGrid ticks={ticks} domainMax={domainMax} />
          {children}
        </div>
      </div>
      {xAxis ? (
        <div className="flex">
          <div className="shrink-0" style={{ width: yAxisWidth }} />
          <div className="min-w-0 flex-1">{xAxis}</div>
        </div>
      ) : null}
    </div>
  )
}
