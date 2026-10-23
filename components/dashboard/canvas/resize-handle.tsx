"use client"

// One resize handle on a card in edit mode: the right edge, the bottom edge or
// the bottom-right corner. Pointer drags are captured on the handle (so the
// drag keeps going outside it and never scrolls the page: touch-action is none
// here only); arrow keys resize by one grid unit. The handle reports raw pixel
// movement and key steps; the canvas snaps them to the grid and the reducer
// clamps them to the card's limits.

import { useRef } from "react"
import type { Point, ResizeEdge } from "@/lib/dashboard/grid-pointer"
import { resizeKeyStep } from "@/lib/dashboard/grid-pointer"
import type { Size } from "@/lib/dashboard/grid"
import { cn } from "@/lib/utils"

const EDGE_NAME: Record<ResizeEdge, string> = { right: "width", bottom: "height", corner: "size" }

const EDGE_CLASS: Record<ResizeEdge, string> = {
  // Each hit area straddles the card's edge, reaching half the 16px gap.
  right: "top-4 bottom-6 -right-2 w-4 cursor-ew-resize pointer-coarse:-right-3 pointer-coarse:w-6",
  bottom: "left-10 right-6 -bottom-2 h-4 cursor-ns-resize pointer-coarse:left-12 pointer-coarse:-bottom-3 pointer-coarse:h-6",
  corner: "-right-2 -bottom-2 size-6 cursor-nwse-resize pointer-coarse:size-8",
}

// The visible grip inside each hit area: a short pill on the edges, a quarter
// arc on the corner. Quiet until hovered, focused or in use.
const GRIP_CLASS: Record<ResizeEdge, string> = {
  right: "left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
  bottom: "left-1/2 top-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full",
  corner: "right-2 bottom-2 size-3 rounded-br-md border-r-[3px] border-b-[3px] bg-transparent",
}

export function ResizeHandle({
  edge,
  cardTitle,
  active,
  onStart,
  onMove,
  onEnd,
  onCancel,
  onKeyStep,
}: {
  edge: ResizeEdge
  cardTitle: string
  /** This handle is being dragged. */
  active: boolean
  onStart: () => void
  /** Pixels the pointer has moved since the drag began. */
  onMove: (delta: Point) => void
  onEnd: () => void
  onCancel: () => void
  /** Arrow key: grow or shrink by one unit (`w`/`h` are -1, 0 or 1). */
  onKeyStep: (step: Size) => void
}) {
  const start = useRef<{ pointerId: number; x: number; y: number } | null>(null)

  const finish = (el: HTMLElement, commit: boolean) => {
    const s = start.current
    if (!s) return
    start.current = null
    if (el.hasPointerCapture(s.pointerId)) el.releasePointerCapture(s.pointerId)
    if (commit) onEnd()
    else onCancel()
  }

  return (
    <button
      type="button"
      aria-label={`Resize ${cardTitle} ${EDGE_NAME[edge]}`}
      title={edge === "corner" ? "Drag to resize" : undefined}
      data-active={active || undefined}
      className={cn(
        "group/handle absolute z-20 touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        EDGE_CLASS[edge],
      )}
      onPointerDown={(e) => {
        if (e.button !== 0 || start.current) return
        e.preventDefault()
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY }
        onStart()
      }}
      onPointerMove={(e) => {
        const s = start.current
        if (!s || s.pointerId !== e.pointerId) return
        onMove({ x: e.clientX - s.x, y: e.clientY - s.y })
      }}
      onPointerUp={(e) => {
        if (start.current?.pointerId === e.pointerId) finish(e.currentTarget, true)
      }}
      onPointerCancel={(e) => {
        if (start.current?.pointerId === e.pointerId) finish(e.currentTarget, false)
      }}
      onLostPointerCapture={(e) => {
        if (start.current?.pointerId === e.pointerId) finish(e.currentTarget, true)
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && start.current) {
          e.preventDefault()
          finish(e.currentTarget, false)
          return
        }
        const step = resizeKeyStep(edge, e.key)
        if (!step || start.current) return
        e.preventDefault()
        onKeyStep(step)
      }}
    >
      <span
        aria-hidden
        className={cn(
          // Faint until the card is hovered, so the handles read as part of the frame, not as scrollbars.
          "absolute bg-muted-foreground/25 opacity-70 transition-[color,background-color,border-color,opacity] duration-150 group-hover/card:opacity-100 group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100 group-data-[active]/handle:opacity-100",
          edge === "corner" ? "border-muted-foreground/50" : "",
          "group-hover/handle:bg-primary group-focus-visible/handle:bg-primary group-data-[active]/handle:bg-primary",
          edge === "corner" &&
            "bg-transparent group-hover/handle:border-primary group-hover/handle:bg-transparent group-focus-visible/handle:border-primary group-focus-visible/handle:bg-transparent group-data-[active]/handle:border-primary group-data-[active]/handle:bg-transparent",
          GRIP_CLASS[edge],
        )}
      />
    </button>
  )
}
