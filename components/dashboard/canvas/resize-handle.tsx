"use client"

// One resize handle on a card in edit mode: the right edge, the bottom edge or
// the bottom-right corner. Pointer drags are captured on the handle (so the
// drag keeps going outside it and never scrolls the page: touch-action is none
// here only); arrow keys resize by one grid unit. The handle reports raw pixel
// movement and key steps; the canvas snaps them to the grid and the reducer
// clamps them to the card's limits. The movement counts the page's scroll too,
// and holding the pointer near the top or bottom of the scrolling area scrolls
// it, so a card can grow past what is on screen.

import { useEffect, useRef } from "react"
import type { Point, ResizeEdge } from "@/lib/dashboard/grid-pointer"
import { resizeKeyStep } from "@/lib/dashboard/grid-pointer"
import type { Size } from "@/lib/dashboard/grid"
import { cn } from "@/lib/utils"
import { scrollParent } from "./reveal"

/** Within this many px of the scroller's top or bottom edge, a resize scrolls it. */
const EDGE_ZONE = 48
/** Fastest auto-scroll, in px per frame (at the very edge). */
const MAX_SCROLL_STEP = 14

type Drag = {
  pointerId: number
  x: number
  y: number
  scroller: HTMLElement | null
  scrollTop: number
  /** The latest pointer position (client px). */
  lastX: number
  lastY: number
  /** The scroll position the last report counted. */
  reportedScroll: number
  frame: number
}

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
  const start = useRef<Drag | null>(null)

  // Pixels moved since the drag began, counting what the page scrolled meanwhile.
  const report = (s: Drag) => {
    s.reportedScroll = s.scroller?.scrollTop ?? 0
    const scrolled = s.reportedScroll - s.scrollTop
    onMove({ x: s.lastX - s.x, y: s.lastY - s.y + scrolled })
  }

  // Near the scroller's top or bottom edge, scroll it a little each frame.
  const autoScroll = () => {
    const s = start.current
    if (!s) return
    s.frame = requestAnimationFrame(autoScroll)
    if (!s.scroller) return
    const box = s.scroller.getBoundingClientRect()
    const below = s.lastY - (box.bottom - EDGE_ZONE)
    const above = box.top + EDGE_ZONE - s.lastY
    const step =
      below > 0 ? Math.ceil((Math.min(below, EDGE_ZONE) / EDGE_ZONE) * MAX_SCROLL_STEP)
      : above > 0 ? -Math.ceil((Math.min(above, EDGE_ZONE) / EDGE_ZONE) * MAX_SCROLL_STEP)
      : 0
    if (step === 0) {
      // Scrolled some other way (a wheel): the card follows.
      if (s.scroller.scrollTop !== s.reportedScroll) report(s)
      return
    }
    const before = s.scroller.scrollTop
    s.scroller.scrollTop = before + step
    if (s.scroller.scrollTop !== before) report(s)
  }

  // Unmounted mid-drag: stop the frame loop.
  useEffect(() => () => {
    if (start.current) cancelAnimationFrame(start.current.frame)
  }, [])

  const finish = (el: HTMLElement, commit: boolean) => {
    const s = start.current
    if (!s) return
    cancelAnimationFrame(s.frame)
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
        const scroller = scrollParent(e.currentTarget)
        start.current = {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          scroller,
          scrollTop: scroller?.scrollTop ?? 0,
          lastX: e.clientX,
          lastY: e.clientY,
          reportedScroll: scroller?.scrollTop ?? 0,
          frame: 0,
        }
        onStart()
        start.current.frame = requestAnimationFrame(autoScroll)
      }}
      onPointerMove={(e) => {
        const s = start.current
        if (!s || s.pointerId !== e.pointerId) return
        s.lastX = e.clientX
        s.lastY = e.clientY
        report(s)
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
