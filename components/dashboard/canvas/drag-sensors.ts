"use client"

// Plumbing shared by the large and phone editors: drag input (@dnd-kit/core),
// the in-flight gesture, and applying an edit with its announcement. The
// geometry (which cell a drag lands on) stays in each editor.

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type RefObject } from "react"
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
  type Modifier,
  type PointerActivationConstraint,
  type PointerSensorOptions,
} from "@dnd-kit/core"
import { editReducer, type EditAction, type EditState } from "@/lib/dashboard/edit-state"

/** Mouse and pen only: touch goes through TouchSensor's long press, so a swipe still scrolls the page. */
export class MouseSensor extends PointerSensor {
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

export const MOUSE_CONSTRAINT: PointerActivationConstraint = { distance: 4 }

/** Mouse (4 px), touch (long press, `touch`), and keyboard (Space to pick up, arrows via `coordinateGetter`). */
export function useEditorSensors(touch: PointerActivationConstraint, coordinateGetter: KeyboardCoordinateGetter) {
  return useSensors(
    useSensor(MouseSensor, useMemo(() => ({ activationConstraint: MOUSE_CONSTRAINT }), [])),
    useSensor(TouchSensor, useMemo(() => ({ activationConstraint: touch }), [touch])),
    useSensor(KeyboardSensor, useMemo(() => ({ coordinateGetter }), [coordinateGetter])),
  )
}

/**
 * A dnd-kit modifier that keeps the dragged card over the canvas horizontally
 * (and not above its top), and the ref it reads: set it to the canvas's rect
 * when a drag starts.
 */
export function useKeepInCanvas(): [Modifier[], RefObject<DOMRect | null>] {
  const canvasBoxRef = useRef<DOMRect | null>(null)
  const modifiers = useMemo<Modifier[]>(
    () => [
      ({ transform, draggingNodeRect }) => {
        const box = canvasBoxRef.current
        if (!box || !draggingNodeRect) return transform
        const minX = box.left - draggingNodeRect.left
        const maxX = box.right - draggingNodeRect.right
        return {
          ...transform,
          x: Math.min(Math.max(transform.x, minX), Math.max(minX, maxX)),
          y: Math.max(transform.y, box.top - draggingNodeRect.top),
        }
      },
    ],
    [],
  )
  return [modifiers, canvasBoxRef]
}

/** A ref that always holds the latest `value` (for handlers that run between renders). */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

/**
 * The gesture in progress, as state (to render) and as a ref (handlers read
 * the latest between renders: a drop can follow a move immediately).
 */
export function useGestureRef<T>(): [T | null, RefObject<T | null>, (g: T | null) => void] {
  const [gesture, setGestureState] = useState<T | null>(null)
  const ref = useRef<T | null>(null)
  const set = useCallback((g: T | null) => {
    ref.current = g
    setGestureState(g)
  }, [])
  return [gesture, ref, set]
}

/**
 * Applies edits with an announcement, and keeps focus: a card that moves is
 * re-ordered in the DOM (cards render in reading order), which can blur the
 * control that moved it; focus goes back to that control.
 */
export function useCommit(
  state: EditState,
  dispatch: Dispatch<EditAction>,
  announce: (message: string) => void,
  rootRef: RefObject<HTMLElement | null>,
) {
  const keep = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const el = keep.current
    keep.current = null
    const active = document.activeElement
    if (el && el.isConnected && active !== el && (!active || active === document.body)) el.focus({ preventScroll: true })
  }, [state])

  /** Applies `action` now; announces `describe(next)`, or `unchanged` when nothing would change. False then. */
  return (action: EditAction, describe: (next: EditState) => string, unchanged: string): boolean => {
    const next = editReducer(state, action)
    if (next === state) {
      announce(unchanged)
      return false
    }
    const active = document.activeElement
    keep.current = active instanceof HTMLElement && rootRef.current?.contains(active) ? active : null
    dispatch(action)
    announce(describe(next))
    return true
  }
}

/** dnd-kit's onDragCancel for an editor: drop the gesture and say the card is back. */
export function useDragCancel(
  gestureRef: RefObject<{ id: string } | null>,
  setGesture: (g: null) => void,
  announce: (message: string) => void,
  label: (id: string) => string,
) {
  return () => {
    const g = gestureRef.current
    setGesture(null)
    if (g) announce(`Move cancelled. ${label(g.id)} is back where it was.`)
  }
}

/** Cards in reading order (top to bottom, then left to right) of `at`, so Tab order follows the screen. */
export function inReadingOrder<C extends { id: string }>(cards: readonly C[], at: ReadonlyMap<string, { x: number; y: number }>): C[] {
  const key = (c: C) => at.get(c.id) ?? { x: Infinity, y: Infinity }
  return [...cards].sort((a, b) => key(a).y - key(b).y || key(a).x - key(b).x)
}
