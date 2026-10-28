"use client"

// The dashboard in edit mode on a narrow canvas (< LARGE_MIN_WIDTH): it edits
// the phone layout only (the reducer runs in "phone" mode; the first edit
// stores the derived phone layout, and the large layout is never touched).
//
// Each card gets a strip of thumb-sized controls above it: a grip on the left,
// and Move & resize, settings and remove on the right. The card body is not a
// drag surface, so a swipe anywhere but the grip scrolls the page. A long
// press on the grip picks the card up (TouchSensor's delay; moving first is a
// scroll), and the Move & resize menu (Move up / Move down, Small / Medium /
// Large) does everything without dragging.
//
// As in the large editor, a drag previews `editReducer(state, move)`, so what
// you see while dragging is what you get on release. Cards are absolutely
// positioned so they glide when the order changes; the strips push each row
// down (lib/dashboard/grid-pointer.ts: stripRowTop / nearestStripRow).

import { useCallback, useEffect, useMemo, useRef, type Dispatch } from "react"
import {
  DndContext,
  useDraggable,
  type Announcements,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type PointerActivationConstraint,
} from "@dnd-kit/core"
import { ArrowDown, ArrowUp, GripVertical, Move, RectangleHorizontal, RectangleVertical, Square, type LucideIcon } from "lucide-react"
import { isMissingData } from "@/lib/dashboard/card-data"
import { cardType, configFieldsFor, phoneSizePresets, type PhoneSizePreset } from "@/lib/dashboard/card-types"
import { editReducer, phonePlacements, type EditAction, type EditState } from "@/lib/dashboard/edit-state"
import { collapseHidden, MAX_GAP_ROWS, PHONE_COLS, type Placement, type Size } from "@/lib/dashboard/grid"
import {
  drawnToStored,
  gridPitch,
  nearestStripRow,
  snapMove,
  stripRows,
  stripRowTop,
  type Pitch,
  type Point,
} from "@/lib/dashboard/grid-pointer"
import { resolvePhoneLayout } from "@/lib/dashboard/resolve-phone"
import { isBareCard } from "@/lib/dashboard/text-card"
import { cn } from "@/lib/utils"
import { CardConfigureProvider } from "@/components/dashboard/cards/card-configure"
import { CardAdjustMenu, type AdjustGroup } from "./card-adjust-menu"
import { CardFrame } from "./card-frame"
import { shouldOpenSettings } from "@/lib/dashboard/open-settings"
import { CardGear, CardRemoveButton } from "./card-gear"
import { useDragCancel, inReadingOrder, useKeepInCanvas, useCommit, useEditorSensors, useGestureRef, useLatest } from "./drag-sensors"
import { GAP, ROW_HEIGHT } from "./grid-metrics"
import { reveal } from "./reveal"
import { useCardTier } from "./use-card-tier"
import { CardView, cardLabel, cardTitle, isBusy, type CanvasCardData } from "./view-grid"

/** Height of a card's control strip (44px targets) plus the space between it and its card. */
const STRIP = 52
// Hold the grip a quarter second to pick a card up; moving more than 8 px first is a scroll.
const TOUCH_CONSTRAINT: PointerActivationConstraint = { delay: 250, tolerance: 8 }
// After a menu move or resize: let the card glide to its new place (200 ms), then scroll it into view.
const SETTLE_MS = 220

const SIZE_ICONS: Record<PhoneSizePreset["name"], LucideIcon> = {
  Small: RectangleHorizontal,
  Medium: Square,
  Large: RectangleVertical,
}

type MoveGesture = {
  id: string
  /** Drawn cell where the drag began. */
  origin: Placement
  /** The stored phone placement (differs from the drawn one when hidden cards' rows were closed). */
  stored: Placement
  /** Strip rows and the last row of the drawing the drag began on (kept steady while the preview reflows). */
  strips: number[]
  maxRow: number
  drawnTo: Point
  to: Point
}

/** The phone placements as drawn: shown cards only, hidden cards' rows closed, the admin's gaps kept (as the page draws them). */
function displayed(state: EditState, ids: ReadonlySet<string>): Map<string, Placement> {
  return new Map(collapseHidden(resolvePhoneLayout(state.layout, state.features), ids, PHONE_COLS).map((p) => [p.id, p]))
}

const bottomOf = (ps: Iterable<Placement>): number => {
  let max = 0
  for (const p of ps) max = Math.max(max, p.y + p.h)
  return max
}

/** 1-based position in reading order (top to bottom, then left to right), and the count. */
function positionOf(ps: ReadonlyMap<string, Placement>, id: string): { n: number; of: number } | null {
  const order = [...ps.values()].sort((a, b) => a.y - b.y || a.x - b.x)
  const i = order.findIndex((p) => p.id === id)
  return i < 0 ? null : { n: i + 1, of: order.length }
}

const cardHeight = (h: number, pitch: Pitch) => h * pitch.y - GAP

export function PhoneEditor({
  state,
  dispatch,
  cards,
  width,
  frozen,
  announce,
  onRemove,
  onConfigure,
}: {
  state: EditState
  dispatch: Dispatch<EditAction>
  /** Shown cards, in layout order, with whatever data the page has for them. */
  cards: readonly CanvasCardData[]
  /** The canvas's width in px. */
  width: number
  /** Done is finishing: controls disabled. */
  frozen: boolean
  announce: (message: string) => void
  onRemove: (id: string) => void
  onConfigure: (id: string) => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const pitch = useMemo(() => gridPitch(width, PHONE_COLS, ROW_HEIGHT, GAP), [width])
  const pitchRef = useLatest(pitch)
  const [gesture, gestureRef, setGesture] = useGestureRef<MoveGesture>()

  const ids = useMemo(() => new Set(cards.map((c) => c.id)), [cards])
  const base = useMemo(() => displayed(state, ids), [state, ids])
  const previewState = useMemo(
    () => (gesture ? editReducer(state, { type: "move", id: gesture.id, to: gesture.to }) : state),
    [state, gesture],
  )
  const preview = useMemo(() => (previewState === state ? base : displayed(previewState, ids)), [previewState, state, base, ids])
  const strips = useMemo(() => stripRows([...preview.values()]), [preview])
  const topOf = (p: Placement) => stripRowTop(p.y, strips, pitch.y, STRIP)

  const title = (id: string) => {
    const card = cards.find((c) => c.id === id)
    return card ? cardLabel(card, cards) : cardTitle("")
  }
  const storedOf = (id: string) => phonePlacements(state).find((p) => p.id === id)

  /** Scrolls a card back into view once it has glided to its new place. */
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
  }, [])
  const revealSoon = (id: string) => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      const el = canvasRef.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)
      if (el) reveal(el)
    }, SETTLE_MS)
  }

  const commit = useCommit(state, dispatch, announce, canvasRef)
  const placeText = (id: string, next: EditState) => {
    const pos = positionOf(displayed(next, ids), id)
    return pos ? `${title(id)} is now ${pos.n} of ${pos.of}.` : `${title(id)} moved.`
  }

  // ---- Move up / down (menu and arrow keys on the grip) ----

  const orderAction = (id: string, delta: -1 | 1): EditAction | null => {
    const action: EditAction = { type: "moveOrder", id, delta }
    return editReducer(state, action) === state ? null : action
  }
  const moveOrder = (id: string, delta: -1 | 1) => {
    const unchanged = delta < 0 ? `${title(id)} is already first.` : `${title(id)} is already last.`
    if (commit({ type: "moveOrder", id, delta }, (next) => placeText(id, next), unchanged)) revealSoon(id)
  }

  // ---- Size presets ----

  const sizeAction = (id: string, size: Size): EditAction | null => {
    const action: EditAction = { type: "resize", id, size }
    return editReducer(state, action) === state ? null : action
  }
  const resize = (id: string, preset: PhoneSizePreset) => {
    const done = commit(
      { type: "resize", id, size: { w: preset.w, h: preset.h } },
      () => `${title(id)} is now ${preset.name.toLowerCase()}.`,
      `${title(id)} is already ${preset.name.toLowerCase()}.`,
    )
    if (done) revealSoon(id)
  }

  const adjustGroups = (id: string, type: string): AdjustGroup[] => {
    const def = cardType(type)
    const now = storedOf(id)
    const presets = def ? phoneSizePresets(def) : []
    return [
      {
        label: "Move",
        items: [
          { key: "up", label: "Move up", icon: ArrowUp, disabled: orderAction(id, -1) === null, onSelect: () => moveOrder(id, -1) },
          { key: "down", label: "Move down", icon: ArrowDown, disabled: orderAction(id, 1) === null, onSelect: () => moveOrder(id, 1) },
        ],
      },
      ...(presets.length > 1
        ? [
            {
              label: "Size",
              items: presets.map((p) => ({
                key: p.name,
                label: p.name,
                icon: SIZE_ICONS[p.name],
                checked: now !== undefined && now.w === p.w && now.h === p.h,
                disabled: sizeAction(id, p) === null,
                onSelect: () => resize(id, p),
              })),
            },
          ]
        : []),
    ]
  }

  // ---- Drag (long press on the grip; mouse; Space on the grip) ----

  const keyboardCoordinates: KeyboardCoordinateGetter = useCallback((event, { currentCoordinates }) => {
    const { x, y } = pitchRef.current
    switch (event.code) {
      case "ArrowUp":
        return { ...currentCoordinates, y: currentCoordinates.y - y - STRIP }
      case "ArrowDown":
        return { ...currentCoordinates, y: currentCoordinates.y + y + STRIP }
      case "ArrowLeft":
        return { ...currentCoordinates, x: currentCoordinates.x - x }
      case "ArrowRight":
        return { ...currentCoordinates, x: currentCoordinates.x + x }
      default:
        return undefined
    }
  }, [pitchRef])
  const sensors = useEditorSensors(TOUCH_CONSTRAINT, keyboardCoordinates)
  const [modifiers, canvasBoxRef] = useKeepInCanvas()

  /** The drawn cell a drag `delta` px from the start lands on. */
  const target = (g: MoveGesture, delta: Point): Point => {
    const p = pitchRef.current
    const top = stripRowTop(g.origin.y, g.strips, p.y, STRIP) + delta.y
    return {
      x: snapMove(g.origin, { x: delta.x, y: 0 }, p, PHONE_COLS).x,
      y: nearestStripRow(top, g.strips, p.y, STRIP, g.maxRow),
    }
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id)
    const origin = base.get(id)
    const stored = storedOf(id)
    if (!origin || !stored) return
    canvasBoxRef.current = canvasRef.current?.getBoundingClientRect() ?? null
    const others = [...base.values()].filter((p) => p.id !== id)
    setGesture({
      id,
      origin,
      stored,
      strips: stripRows([...base.values()]),
      // Up to the gap cap below the others: a card can be dropped with empty rows above it.
      maxRow: bottomOf(others) + MAX_GAP_ROWS,
      drawnTo: { x: origin.x, y: origin.y },
      to: { x: stored.x, y: stored.y },
    })
    // A little buzz says "picked up" where the device can (Android).
    try {
      navigator.vibrate?.(10)
    } catch {
      // Not allowed here; the lift and shadow say it too.
    }
  }
  const onDragMove = ({ delta }: DragMoveEvent) => {
    const g = gestureRef.current
    if (!g) return
    const drawnTo = target(g, delta)
    if (drawnTo.x !== g.drawnTo.x || drawnTo.y !== g.drawnTo.y)
      setGesture({ ...g, drawnTo, to: drawnToStored(drawnTo, g.origin, g.stored) })
  }
  const onDragEnd = ({ delta }: DragEndEvent) => {
    const g = gestureRef.current
    setGesture(null)
    if (!g) return
    const drawnTo = target(g, delta)
    if (drawnTo.x === g.origin.x && drawnTo.y === g.origin.y) {
      announce(`${title(g.id)} dropped where it was.`)
      return
    }
    commit(
      { type: "move", id: g.id, to: drawnToStored(drawnTo, g.origin, g.stored) },
      (next) => placeText(g.id, next),
      `${title(g.id)} stayed where it was.`,
    )
  }
  const onDragCancel = useDragCancel(gestureRef, setGesture, announce, title)

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${title(String(active.id))}. Use the up and down arrow keys to move it, Space to drop, Escape to cancel.`,
    onDragMove: () => undefined,
    onDragOver: () => undefined,
    // The editor announces the result itself (it knows the new position).
    onDragEnd: () => undefined,
    onDragCancel: () => undefined,
  }

  // ---- Drawing ----

  const moving = gesture
  const placeholder = moving ? preview.get(moving.id) : undefined
  let height = 0
  for (const p of preview.values()) height = Math.max(height, topOf(p) + cardHeight(p.h, pitch))
  // While dragging, keep the drag start's height too, so the page does not jump under the finger.
  if (moving) {
    for (const p of base.values()) height = Math.max(height, stripRowTop(p.y, moving.strips, pitch.y, STRIP) + cardHeight(p.h, pitch))
  }

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
            "Press the up or down arrow key to move this card one place. Or press Space to pick it up, move it with the arrow keys, then press Space to drop it or Escape to cancel.",
        },
      }}
    >
      <p className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          Hold
          <GripVertical className="size-3.5" aria-hidden />
          <span className="sr-only">the grip</span>
          to drag a card, or tap
          <Move className="size-3.5" aria-hidden />
          <span className="sr-only">Move and resize</span>
          to move and resize it.
        </span>
      </p>
      <div
        ref={canvasRef}
        className="relative w-full motion-safe:transition-[height] motion-safe:duration-200"
        style={{ height }}
      >
        {placeholder && (
          <div
            aria-hidden
            className="absolute rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 motion-safe:transition-[left,top,width,height] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
            style={{
              left: `calc((100% + ${GAP}px) * ${placeholder.x} / ${PHONE_COLS})`,
              width: `calc((100% + ${GAP}px) * ${placeholder.w} / ${PHONE_COLS} - ${GAP}px)`,
              top: topOf(placeholder),
              height: cardHeight(placeholder.h, pitch),
            }}
          />
        )}
        {/* In the reading order of the layout as it stands (not the drag preview), so Tab order matches the screen and holds still mid-drag. */}
        {inReadingOrder(cards, base).map((card) => {
          const dragged = moving?.id === card.id
          const at = dragged ? moving.origin : (preview.get(card.id) ?? base.get(card.id))
          if (!at) return null
          const top = dragged ? stripRowTop(at.y, moving.strips, pitch.y, STRIP) : topOf(at)
          return (
            <PhoneCard
              key={card.id}
              card={card}
              label={title(card.id)}
              placement={at}
              top={top}
              pitch={pitch}
              busy={moving !== null && !dragged}
              frozen={frozen}
              onKeyMove={(delta) => moveOrder(card.id, delta)}
              onRemove={() => onRemove(card.id)}
              onConfigure={configFieldsFor(card.type).length > 0 ? () => onConfigure(card.id) : undefined}
              adjustGroups={() => adjustGroups(card.id, card.type)}
            />
          )
        })}
      </div>
    </DndContext>
  )
}

/** A round 44px control in a card's strip; the visible chip is a little smaller. */
const chip =
  "flex size-9 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-sm transition-colors duration-150"

function PhoneCard({
  card,
  label,
  placement,
  top,
  pitch,
  busy,
  frozen,
  onKeyMove,
  onRemove,
  onConfigure,
  adjustGroups,
}: {
  card: CanvasCardData
  /** What the controls call it (numbered when the type repeats). */
  label: string
  placement: Placement
  /** Pixel top of the card itself (its strip sits above it). */
  top: number
  pitch: Pitch
  /** Another card is being dragged: this one only makes room. */
  busy: boolean
  frozen: boolean
  onKeyMove: (delta: -1 | 1) => void
  onRemove: () => void
  onConfigure?: () => void
  adjustGroups: () => AdjustGroup[]
}) {
  const title = cardTitle(card.type)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: frozen,
  })
  const size: Size = { w: placement.w, h: placement.h }
  const tier = useCardTier(card.type, size, "phone")
  // A card whose item is gone keeps its "Choose another" button usable (not while Done is finishing).
  const missing = card.status === "ok" && isMissingData(card.data) && !frozen

  return (
    <div
      ref={setNodeRef}
      data-card-id={card.id}
      onDoubleClick={(e) => {
        if (shouldOpenSettings({ target: e.target instanceof Element ? e.target : null, hasSettings: !!onConfigure, disabled: frozen })) {
          e.preventDefault()
          onConfigure?.()
        }
      }}
      className={cn(
        "absolute flex flex-col",
        isDragging
          ? "z-30 motion-safe:transition-[scale] motion-safe:duration-150"
          : "motion-safe:transition-[left,top,width,height,transform,scale] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]",
        busy && "pointer-events-none",
      )}
      style={{
        left: `calc((100% + ${GAP}px) * ${placement.x} / ${PHONE_COLS})`,
        width: `calc((100% + ${GAP}px) * ${placement.w} / ${PHONE_COLS} - ${GAP}px)`,
        top: top - STRIP,
        height: STRIP + cardHeight(placement.h, pitch),
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        scale: isDragging ? "1.02" : "1",
      }}
    >
      <div className="flex h-11 shrink-0 items-center gap-0.5" style={{ marginBottom: STRIP - 44 }}>
        {/* Grip: a long press (touch) or a drag (mouse) moves the card; arrow keys move it one place. */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          data-grip
          aria-label={`Move ${label}`}
          disabled={frozen}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            const delta = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0
            if (delta !== 0 && !isDragging && !frozen && !e.altKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              onKeyMove(delta)
              return
            }
            listeners?.onKeyDown?.(e)
          }}
          className={cn(
            "group/grip flex h-11 min-w-11 touch-manipulation items-center justify-center rounded-full outline-none select-none [-webkit-touch-callout:none]",
            "focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-ring disabled:opacity-50",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <span
            className={cn(
              chip,
              "w-11 group-hover/grip:border-primary/50 group-hover/grip:text-primary",
              isDragging && "border-primary/60 text-primary",
            )}
          >
            <GripVertical className="size-4" aria-hidden />
          </span>
        </button>
        <span className="min-w-0 flex-1" />
        {!isDragging && (
          <>
            <CardAdjustMenu cardTitle={label} getGroups={adjustGroups} disabled={frozen} align="end" className="size-11" />
            {onConfigure && <CardGear cardTitle={label} onClick={onConfigure} disabled={frozen} className="size-11" />}
            <CardRemoveButton label={label} onClick={onRemove} disabled={frozen} className="size-11" />
          </>
        )}
      </div>
      {/* touch-manipulation: a double tap opens settings instead of zooming the page. */}
      <div className="min-h-0 flex-1 touch-manipulation">
        <CardConfigureProvider value={missing ? (onConfigure ?? null) : null}>
          <CardFrame
            title={title}
            failed={card.status === "error"}
            busy={isBusy(card)}
            editing
            interactive={missing}
            bare={isBareCard(card)}
            className={cn(
              isBareCard(card) ? "transition-[outline-color,background-color] duration-200" : "ring-1 ring-primary/25 transition-shadow duration-200",
              isDragging && (isBareCard(card) ? "outline-primary/70 bg-primary/10" : "shadow-xl ring-2 ring-primary/50"),
            )}
          >
            <CardView card={card} tier={tier} size={size} mode="phone" editing />
          </CardFrame>
        </CardConfigureProvider>
      </div>
    </div>
  )
}
