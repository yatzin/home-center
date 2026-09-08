"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"

// One tooltip implementation for every chart, replacing the native `title`
// attributes the first generation of these components used. Those had a delay of
// roughly a second, no styling, no keyboard path, and nothing at all on touch.
//
// A tooltip enhances; it never gates. Every value it shows is also in the chart's
// table view, so nothing here is the only way to read a number.

export type TooltipRow = { label: string; value: string; color?: string; muted?: boolean }
export type TooltipContent = { title: string; rows: TooltipRow[]; total?: string }

type Placed = { content: TooltipContent; x: number; y: number }

const GAP = 10
const EDGE = 4

export function useChartTooltip() {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Placed | null>(null)
  const [offset, setOffset] = useState(0)

  const show = useCallback((content: TooltipContent, anchor: Element) => {
    const container = containerRef.current
    if (!container) return
    const a = anchor.getBoundingClientRect()
    const c = container.getBoundingClientRect()
    setTip({ content, x: a.left - c.left + a.width / 2, y: a.top - c.top })
  }, [])

  const hide = useCallback(() => setTip(null), [])

  // The card is centred on the mark, then nudged back inside the plot once its
  // real width is known. Measuring after paint rather than guessing keeps a wide
  // tooltip on a first or last column from hanging off the card.
  useLayoutEffect(() => {
    if (!tip || !cardRef.current || !containerRef.current) {
      setOffset(0)
      return
    }
    const half = cardRef.current.offsetWidth / 2
    const width = containerRef.current.offsetWidth
    const left = tip.x - half
    const right = tip.x + half
    if (left < EDGE) setOffset(EDGE - left)
    else if (right > width - EDGE) setOffset(width - EDGE - right)
    else setOffset(0)
  }, [tip])

  /// Spread onto any mark to make it a tooltip anchor. Focus and blur are wired
  /// alongside pointer events so keyboard users get exactly what hover gives.
  const anchorProps = useCallback(
    (content: TooltipContent) => ({
      onPointerEnter: (e: React.PointerEvent) => show(content, e.currentTarget),
      onPointerDown: (e: React.PointerEvent) => show(content, e.currentTarget),
      onPointerLeave: hide,
      onFocus: (e: React.FocusEvent) => show(content, e.currentTarget),
      onBlur: hide,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") hide()
      },
    }),
    [show, hide]
  )

  return { containerRef, cardRef, tip, offset, show, hide, anchorProps }
}

export function TooltipCard({
  tip,
  cardRef,
  offset,
}: {
  tip: { content: TooltipContent; x: number; y: number } | null
  cardRef: React.RefObject<HTMLDivElement | null>
  offset: number
}) {
  if (!tip) return null
  return (
    <div
      ref={cardRef}
      role="tooltip"
      className="chart-fade pointer-events-none absolute z-20 min-w-40 max-w-64 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md"
      style={{
        left: tip.x + offset,
        top: tip.y - GAP,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="text-xs font-medium">{tip.content.title}</div>
      <dl className="mt-1.5 space-y-1">
        {tip.content.rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {row.color ? (
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            ) : null}
            <dt className={row.muted ? "flex-1 truncate text-muted-foreground" : "flex-1 truncate"}>
              {row.label}
            </dt>
            <dd className="shrink-0 tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
      {tip.content.total ? (
        <div className="mt-1.5 flex items-center justify-between border-t pt-1.5 text-xs font-medium">
          <span>Total</span>
          <span className="tabular-nums">{tip.content.total}</span>
        </div>
      ) : null}
    </div>
  )
}
