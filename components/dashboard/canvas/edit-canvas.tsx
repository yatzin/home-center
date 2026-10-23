"use client"

// The dashboard in edit mode on a large canvas (>= LARGE_MIN_WIDTH): cards are
// absolutely positioned on the 12-column grid so they can glide between cells.
//
// All geometry goes through the reducer: while a card is dragged or resized,
// the preview is `editReducer(state, <the action a drop would dispatch>)`, so
// what you see while dragging is exactly what you get on release, and no
// preview can overlap or leave the grid. Pointer pixels become cells with the
// pure helpers in lib/dashboard/grid-pointer.ts.
//
// Dragging uses @dnd-kit/core only for input (mouse, long-press touch,
// keyboard) and the dragged card's transform; the drop target is the grid cell
// under the card, not a sortable order. Resizing uses ResizeHandle.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type Modifier,
  type PointerActivationConstraint,
  type PointerSensorOptions,
} from "@dnd-kit/core"
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsDownUp,
  ChevronsLeftRight,
  ChevronsRightLeft,
  ChevronsUpDown,
  GripHorizontal,
  MonitorSmartphone,
  X,
  type LucideIcon,
} from "lucide-react"
import { compact, LARGE_COLS, type Placement, type Size } from "@/lib/dashboard/grid"
import { editReducer, type EditAction, type EditState } from "@/lib/dashboard/edit-state"
import {
  drawnToStored,
  gridPitch,
  moveKeyStep,
  snapMove,
  snapResize,
  stepMove,
  type Pitch,
  type Point,
  type ResizeEdge,
} from "@/lib/dashboard/grid-pointer"
import type { Features } from "@/lib/features"
import { cn } from "@/lib/utils"
import { CardAdjustMenu, type AdjustGroup } from "./card-adjust-menu"
import { CardFrame } from "./card-frame"
import { GAP, LARGE_MIN_WIDTH, ROW_HEIGHT } from "./grid-metrics"
import { ResizeHandle } from "./resize-handle"
import { useCardTier } from "./use-card-tier"
import { CardView, cardTitle, ViewGrid, type CanvasCardData } from "./view-grid"

/** Mouse and pen only: touch goes through TouchSensor's long press, so a swipe still scrolls the page. */
class MouseSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent: event }: React.PointerEvent, { onActivation }: PointerSensorOptions) => {
        if (!event.isPrimary || event.button !== 0 || event.pointerType === "touch") return false
        onActivation?.({ event })
        return true
      },
    },
  ]
}

const MOUSE_CONSTRAINT: PointerActivationConstraint = { distance: 4 }
// Hold ~200 ms to pick a card up; moving more than 8 px first is a scroll.
const TOUCH_CONSTRAINT: PointerActivationConstraint = { delay: 200, tolerance: 8 }
const EXTRA_ROWS = 2

type Gesture =
  /** `origin`/`drawnTo` are drawn cells; `stored`/`to` the stored layout's (they differ when hidden cards were compacted out). */
  | { kind: "move"; id: string; origin: Placement; stored: Placement; drawnTo: Point; to: Point }
  | { kind: "resize"; id: string; edge: ResizeEdge; origin: Placement; size: Size }

function gestureAction(g: Gesture | null): EditAction | null {
  if (!g) return null
  return g.kind === "move" ? { type: "move", id: g.id, to: g.to } : { type: "resize", id: g.id, size: g.size }
}

/** The large placements as drawn: shown cards only, floated up (as the page draws them). */
function displayed(state: EditState, ids: ReadonlySet<string>): Map<string, Placement> {
  return new Map(
    compact(
      state.layout.large.filter((p) => ids.has(p.id)),
      LARGE_COLS,
    ).map((p) => [p.id, p]),
  )
}

const bottomOf = (ps: Iterable<Placement>): number => {
  let max = 0
  for (const p of ps) max = Math.max(max, p.y + p.h)
  return max
}

function boxStyle(p: Placement, pitch: Pitch): React.CSSProperties {
  return {
    left: `calc((100% + ${GAP}px) * ${p.x} / ${LARGE_COLS})`,
    width: `calc((100% + ${GAP}px) * ${p.w} / ${LARGE_COLS} - ${GAP}px)`,
    top: p.y * pitch.y,
    height: p.h * pitch.y - GAP,
  }
}

const where = (p: Placement) => `column ${p.x + 1}, row ${p.y + 1}`

export function EditCanvas({
  state,
  dispatch,
  cards,
  features,
  readOnly,
  announce,
  onRemove,
}: {
  state: EditState
  dispatch: Dispatch<EditAction>
  /** Shown cards, in layout order, with whatever data the page has for them. */
  cards: readonly CanvasCardData[]
  /** The page's current features (which cards show, how phone is derived). */
  features: Features
  /** No arranging (after a conflict, until Reload): changes could not be saved. */
  readOnly: boolean
  announce: (message: string) => void
  onRemove: (id: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  // The layout mode follows the canvas's own width, like the view's container query.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => setWidth(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const measuredMode = width === 0 ? null : width >= LARGE_MIN_WIDTH ? "large" : "phone"
  useEffect(() => {
    if (measuredMode) dispatch({ type: "mode", mode: measuredMode })
  }, [measuredMode, dispatch])

  const editable = !readOnly && measuredMode === "large" && state.mode === "large"

  return (
    <div ref={rootRef} className="@container/dash">
      {measuredMode === "phone" && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <MonitorSmartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Editing on small screens is coming next. To arrange cards, use a wider window or turn your tablet sideways.
          </p>
        </div>
      )}
      {editable ? (
        <LargeEditor
          state={state}
          dispatch={dispatch}
          cards={cards}
          width={width}
          canvasRef={canvasRef}
          announce={announce}
          onRemove={onRemove}
        />
      ) : (
        <ViewGrid cards={cards} layout={state.layout} features={features} />
      )}
    </div>
  )
}

function LargeEditor({
  state,
  dispatch,
  cards,
  width,
  canvasRef,
  announce,
  onRemove,
}: {
  state: EditState
  dispatch: Dispatch<EditAction>
  cards: readonly CanvasCardData[]
  width: number
  canvasRef: React.RefObject<HTMLDivElement | null>
  announce: (message: string) => void
  onRemove: (id: string) => void
}) {
  const pitch = useMemo(() => gridPitch(width, LARGE_COLS, ROW_HEIGHT, GAP), [width])
  const pitchRef = useRef(pitch)
  const canvasBoxRef = useRef<DOMRect | null>(null)
  useLayoutEffect(() => {
    pitchRef.current = pitch
  }, [pitch])

  const [gesture, setGestureState] = useState<Gesture | null>(null)
  // Handlers read the latest gesture between renders (a drop can follow a move immediately).
  const gestureRef = useRef<Gesture | null>(null)
  const setGesture = useCallback((g: Gesture | null) => {
    gestureRef.current = g
    setGestureState(g)
  }, [])

  const ids = useMemo(() => new Set(cards.map((c) => c.id)), [cards])
  const base = useMemo(() => displayed(state, ids), [state, ids])
  const previewState = useMemo(() => {
    const action = gestureAction(gesture)
    return action ? editReducer(state, action) : state
  }, [state, gesture])
  const preview = useMemo(() => (previewState === state ? base : displayed(previewState, ids)), [previewState, state, base, ids])

  const title = (id: string) => cardTitle(cards.find((c) => c.id === id)?.type ?? "")
  const storedOf = (id: string) => state.layout.large.find((p) => p.id === id)

  /** Applies an action now and announces where the card ended up. */
  const commit = (action: EditAction, id: string, describe: (p: Placement) => string, unchanged: string) => {
    const next = editReducer(state, action)
    if (next === state) {
      announce(unchanged)
      return
    }
    dispatch(action)
    const p = displayed(next, ids).get(id)
    if (p) announce(describe(p))
  }

  // ---- Drag (dnd-kit) ----

  const keyboardCoordinates: KeyboardCoordinateGetter = useCallback((event, { currentCoordinates }) => {
    const step = moveKeyStep(event.code)
    if (!step) return undefined
    const { x, y } = pitchRef.current
    return { x: currentCoordinates.x + step.x * x, y: currentCoordinates.y + step.y * y }
  }, [])
  const sensors = useSensors(
    useSensor(MouseSensor, useMemo(() => ({ activationConstraint: MOUSE_CONSTRAINT }), [])),
    useSensor(TouchSensor, useMemo(() => ({ activationConstraint: TOUCH_CONSTRAINT }), [])),
    useSensor(KeyboardSensor, useMemo(() => ({ coordinateGetter: keyboardCoordinates }), [keyboardCoordinates])),
  )

  // Keep the dragged card over the canvas horizontally (and not above its top).
  const keepInCanvas: Modifier = useCallback(({ transform, draggingNodeRect }) => {
    const box = canvasBoxRef.current
    if (!box || !draggingNodeRect) return transform
    const minX = box.left - draggingNodeRect.left
    const maxX = box.right - draggingNodeRect.right
    return {
      ...transform,
      x: Math.min(Math.max(transform.x, minX), Math.max(minX, maxX)),
      y: Math.max(transform.y, box.top - draggingNodeRect.top),
    }
  }, [])
  const modifiers = useMemo(() => [keepInCanvas], [keepInCanvas])

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id)
    const origin = base.get(id)
    const stored = storedOf(id)
    if (!origin || !stored) return
    canvasBoxRef.current = canvasRef.current?.getBoundingClientRect() ?? null
    const at = { x: origin.x, y: origin.y }
    setGesture({ kind: "move", id, origin, stored, drawnTo: at, to: { x: stored.x, y: stored.y } })
  }
  const onDragMove = ({ delta }: DragMoveEvent) => {
    const g = gestureRef.current
    if (g?.kind !== "move") return
    const drawnTo = snapMove(g.origin, delta, pitchRef.current, LARGE_COLS)
    if (drawnTo.x !== g.drawnTo.x || drawnTo.y !== g.drawnTo.y)
      setGesture({ ...g, drawnTo, to: drawnToStored(drawnTo, g.origin, g.stored) })
  }
  const onDragEnd = ({ delta }: DragEndEvent) => {
    const g = gestureRef.current
    setGesture(null)
    if (g?.kind !== "move") return
    const drawnTo = snapMove(g.origin, delta, pitchRef.current, LARGE_COLS)
    if (drawnTo.x === g.origin.x && drawnTo.y === g.origin.y) {
      announce(`${title(g.id)} dropped where it was.`)
      return
    }
    const to = drawnToStored(drawnTo, g.origin, g.stored)
    commit({ type: "move", id: g.id, to }, g.id, (p) => `${title(g.id)} moved to ${where(p)}.`, `${title(g.id)} stayed where it was.`)
  }
  const onDragCancel = () => {
    const g = gestureRef.current
    setGesture(null)
    if (g) announce(`Move cancelled. ${title(g.id)} is back where it was.`)
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${title(String(active.id))}. Use the arrow keys to move it, Space to drop, Escape to cancel.`,
    onDragMove: () => undefined,
    onDragOver: () => undefined,
    // The canvas announces the result itself (it knows the cell).
    onDragEnd: () => undefined,
    onDragCancel: () => undefined,
  }

  // ---- Keyboard move on the grip (arrow keys, no pick-up needed) ----

  /** The move one step makes (picked on the drawn grid, applied to the stored one), or null when it can't move. */
  const planMove = (id: string, step: Point): EditAction | null => {
    const drawn = base.get(id)
    const stored = storedOf(id)
    const drawnTo = drawn && stepMove([...base.values()], id, step, LARGE_COLS)
    if (!drawn || !stored || !drawnTo) return null
    const action: EditAction = { type: "move", id, to: drawnToStored(drawnTo, drawn, stored) }
    return editReducer(state, action) === state ? null : action
  }
  const keyMove = (id: string, step: Point) => {
    const edge = step.x < 0 ? "left" : step.x > 0 ? "right" : step.y < 0 ? "up" : "down"
    const unchanged = `${title(id)} can't move further ${edge}.`
    const action = planMove(id, step)
    if (!action) {
      announce(unchanged)
      return
    }
    commit(action, id, (p) => `${title(id)} moved to ${where(p)}.`, unchanged)
  }

  // ---- Resize ----

  const resizeStart = (id: string, edge: ResizeEdge) => {
    const origin = base.get(id)
    if (!origin) return
    setGesture({ kind: "resize", id, edge, origin, size: { w: origin.w, h: origin.h } })
  }
  const resizeMove = (delta: Point) => {
    const g = gestureRef.current
    if (g?.kind !== "resize") return
    const size = snapResize(g.origin, delta, g.edge, pitchRef.current)
    if (size.w !== g.size.w || size.h !== g.size.h) setGesture({ ...g, size })
  }
  const resizeEnd = () => {
    const g = gestureRef.current
    setGesture(null)
    if (g?.kind !== "resize" || (g.size.w === g.origin.w && g.size.h === g.origin.h)) return
    commit({ type: "resize", id: g.id, size: g.size }, g.id, (p) => `${title(g.id)} resized to ${p.w} by ${p.h}.`, `${title(g.id)} is already as large or small as it can be.`)
  }
  const resizeCancel = () => setGesture(null)

  /** The resize one step makes, or null at a limit or the grid edge. */
  const planResize = (id: string, step: Size): EditAction | null => {
    const p = storedOf(id)
    if (!p) return null
    const action: EditAction = { type: "resize", id, size: { w: p.w + step.w, h: p.h + step.h } }
    return editReducer(state, action) === state ? null : action
  }
  const keyResize = (id: string, step: Size) => {
    const limit =
      step.w > 0 ? "can't get any wider" : step.w < 0 ? "can't get any narrower" : step.h > 0 ? "can't get any taller" : "can't get any shorter"
    const unchanged = `${title(id)} ${limit}.`
    const action = planResize(id, step)
    if (!action) {
      announce(unchanged)
      return
    }
    commit(action, id, (q) => `${title(id)} resized to ${q.w} by ${q.h}.`, unchanged)
  }

  /** "Move & resize" choices for a card: the keyboard's paths, offered as buttons. */
  const adjustGroups = (id: string): AdjustGroup[] => {
    const move = (key: string, label: string, icon: LucideIcon, step: Point) => ({
      key,
      label,
      icon,
      disabled: planMove(id, step) === null,
      onSelect: () => keyMove(id, step),
    })
    const size = (key: string, label: string, icon: LucideIcon, step: Size) => ({
      key,
      label,
      icon,
      disabled: planResize(id, step) === null,
      onSelect: () => keyResize(id, step),
    })
    return [
      {
        label: "Move",
        items: [
          move("left", "Move left", ArrowLeft, { x: -1, y: 0 }),
          move("right", "Move right", ArrowRight, { x: 1, y: 0 }),
          move("up", "Move up", ArrowUp, { x: 0, y: -1 }),
          move("down", "Move down", ArrowDown, { x: 0, y: 1 }),
        ],
      },
      {
        label: "Size",
        items: [
          size("wider", "Wider", ChevronsLeftRight, { w: 1, h: 0 }),
          size("narrower", "Narrower", ChevronsRightLeft, { w: -1, h: 0 }),
          size("taller", "Taller", ChevronsUpDown, { w: 0, h: 1 }),
          size("shorter", "Shorter", ChevronsDownUp, { w: 0, h: -1 }),
        ],
      },
    ]
  }

  // Escape cancels a pointer resize (the handle may not have focus).
  const resizing = gesture?.kind === "resize"
  useEffect(() => {
    if (!resizing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGesture(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [resizing, setGesture])

  const rows = Math.max(bottomOf(base.values()), bottomOf(preview.values())) + EXTRA_ROWS
  const height = rows * pitch.y - GAP
  const moving = gesture?.kind === "move" ? gesture : null
  const target = moving ? preview.get(moving.id) : undefined

  return (
    <DndContext
      sensors={sensors}
      modifiers={modifiers}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Press an arrow key to move this card one cell. Or press Space to pick it up, move it with the arrow keys, then press Space to drop it or Escape to cancel.",
        },
      }}
    >
      <div
        ref={canvasRef}
        className={cn("relative w-full", "motion-safe:transition-[height] motion-safe:duration-200")}
        style={{ height }}
      >
        <GridUnderlay rows={rows} active={gesture !== null} />
        {target && (
          <div
            aria-hidden
            className="absolute rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 motion-safe:transition-[left,top,width,height] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
            style={boxStyle(target, pitch)}
          />
        )}
        {cards.map((card) => {
          const at = (moving?.id === card.id ? moving.origin : preview.get(card.id)) ?? base.get(card.id)
          if (!at) return null
          return (
            <EditableCard
              key={card.id}
              card={card}
              placement={at}
              pitch={pitch}
              busy={gesture !== null && gesture.id !== card.id}
              resizingEdge={gesture?.kind === "resize" && gesture.id === card.id ? gesture.edge : null}
              keyboardMoveDisabled={gesture !== null}
              onKeyMove={(step) => keyMove(card.id, step)}
              onRemove={() => onRemove(card.id)}
              onResizeStart={(edge) => resizeStart(card.id, edge)}
              onResizeMove={resizeMove}
              onResizeEnd={resizeEnd}
              onResizeCancel={resizeCancel}
              onKeyResize={(step) => keyResize(card.id, step)}
              adjustGroups={() => adjustGroups(card.id)}
            />
          )
        })}
      </div>
    </DndContext>
  )
}

/** The grid's cells, faintly, behind the cards; a little stronger while something is moving. */
function GridUnderlay({ rows, active }: { rows: number; active: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 grid grid-cols-12 content-start gap-(--g) transition-opacity duration-200",
        active ? "opacity-100" : "opacity-60",
      )}
      style={{ "--g": `${GAP}px`, gridAutoRows: `${ROW_HEIGHT}px` } as React.CSSProperties}
    >
      {Array.from({ length: rows * LARGE_COLS }, (_, i) => (
        <div key={i} className="rounded-lg bg-muted/50 ring-1 ring-border/40 ring-inset" />
      ))}
    </div>
  )
}

function EditableCard({
  card,
  placement,
  pitch,
  busy,
  resizingEdge,
  keyboardMoveDisabled,
  onKeyMove,
  onRemove,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onResizeCancel,
  onKeyResize,
  adjustGroups,
}: {
  card: CanvasCardData
  placement: Placement
  pitch: Pitch
  /** Another card is being moved or resized: this one only makes room. */
  busy: boolean
  resizingEdge: ResizeEdge | null
  keyboardMoveDisabled: boolean
  onKeyMove: (step: Point) => void
  onRemove: () => void
  onResizeStart: (edge: ResizeEdge) => void
  onResizeMove: (delta: Point) => void
  onResizeEnd: () => void
  onResizeCancel: () => void
  onKeyResize: (step: Size) => void
  adjustGroups: () => AdjustGroup[]
}) {
  const title = cardTitle(card.type)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: card.id })
  const size: Size = { w: placement.w, h: placement.h }
  // The live (preview) size: content changes tier as a resize crosses a threshold.
  const tier = useCardTier(card.type, size, "large")
  const resizing = resizingEdge !== null

  const style: React.CSSProperties = {
    ...boxStyle(placement, pitch),
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    scale: isDragging ? "1.02" : "1",
  }

  return (
    <div
      ref={setNodeRef}
      data-card-id={card.id}
      className={cn(
        "group/card absolute",
        isDragging
          ? "z-30 motion-safe:transition-[scale] motion-safe:duration-150"
          : "motion-safe:transition-[left,top,width,height,transform,scale] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]",
        resizing && "z-20",
        busy && "pointer-events-none",
      )}
      style={style}
    >
      <CardFrame
        title={title}
        failed={card.status === "error"}
        editing
        className={cn(
          "ring-1 ring-primary/25 transition-shadow duration-200 group-hover/card:ring-primary/45",
          (isDragging || resizing) && "shadow-xl ring-2 ring-primary/50",
        )}
      >
        <CardView card={card} tier={tier} size={size} mode="large" editing />
      </CardFrame>

      {/* The whole card is the drag surface (mouse, or a long press on touch). */}
      <div
        {...listeners}
        onKeyDown={undefined}
        onContextMenu={(e) => e.preventDefault()}
        aria-hidden
        className={cn(
          "absolute inset-0 z-10 touch-manipulation rounded-xl [-webkit-touch-callout:none] select-none",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
      />

      {/* Grip: the keyboard handle (arrows move one cell; Space picks up). */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        data-grip
        aria-label={`Move ${title}`}
        onKeyDown={(e) => {
          const step = moveKeyStep(e.key)
          if (step && !keyboardMoveDisabled && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            onKeyMove(step)
            return
          }
          listeners?.onKeyDown?.(e)
        }}
        className={cn(
          "absolute -top-2.5 left-1/2 z-20 flex h-5 w-10 -translate-x-1/2 touch-manipulation items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-sm outline-none transition-colors duration-150",
          "hover:border-primary/50 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring",
          isDragging ? "cursor-grabbing border-primary/60 text-primary" : "cursor-grab",
          "pointer-coarse:h-7 pointer-coarse:w-12 pointer-coarse:-top-3.5",
        )}
      >
        <GripHorizontal className="size-4" aria-hidden />
      </button>

      {!isDragging && (
        <>
          <CardAdjustMenu
            cardTitle={title}
            getGroups={adjustGroups}
            className="absolute -bottom-3.5 left-1.5 z-20 pointer-coarse:-bottom-5.5 pointer-coarse:left-0"
          />
          <button
            type="button"
            aria-label={`Remove ${title}`}
            title="Remove card"
            onClick={onRemove}
            className={cn(
              "absolute -top-2.5 -right-2.5 z-20 flex size-6 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-sm outline-none transition-colors duration-150",
              "hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring",
              "pointer-coarse:size-8 pointer-coarse:-top-3.5 pointer-coarse:-right-3.5",
            )}
          >
            <X className="size-3.5" aria-hidden />
          </button>
          {(["right", "bottom", "corner"] as const).map((edge) => (
            <ResizeHandle
              key={edge}
              edge={edge}
              cardTitle={title}
              active={resizingEdge === edge}
              onStart={() => onResizeStart(edge)}
              onMove={onResizeMove}
              onEnd={onResizeEnd}
              onCancel={onResizeCancel}
              onKeyStep={onKeyResize}
            />
          ))}
        </>
      )}
    </div>
  )
}
