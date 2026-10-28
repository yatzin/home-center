"use client"

// Whether the dashboard is in edit mode, shared between the corner tab that
// starts it and the canvas. The page renders both inside DashboardEditProvider.
// Only admins get the tab, and the actions check again.

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Wrench } from "lucide-react"
import { cn } from "@/lib/utils"

type EditMode = {
  editing: boolean
  setEditing: (editing: boolean) => void
  /**
   * True once after editing ends: the Edit button that gets it takes focus
   * back (a button shown again after Done is a new one, mounted after the
   * edit canvas goes away).
   */
  claimFocusReturn: () => boolean
}

const EditModeContext = createContext<EditMode>({ editing: false, setEditing: () => {}, claimFocusReturn: () => false })

export function DashboardEditProvider({ children }: { children: React.ReactNode }) {
  const [editing, setEditingState] = useState(false)
  const editingRef = useRef(editing)
  useLayoutEffect(() => {
    editingRef.current = editing
  }, [editing])
  const focusReturn = useRef(false)
  const setEditing = useCallback((next: boolean) => {
    if (editingRef.current && !next) focusReturn.current = true
    if (next) focusReturn.current = false
    setEditingState(next)
  }, [])
  const claimFocusReturn = useCallback(() => {
    const claimed = focusReturn.current
    focusReturn.current = false
    return claimed
  }, [])
  const value = useMemo(() => ({ editing, setEditing, claimFocusReturn }), [editing, setEditing, claimFocusReturn])
  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>
}

export function useDashboardEditMode(): EditMode {
  return useContext(EditModeContext)
}

/**
 * The corner tab that starts editing: a triangle in the page's top-right
 * corner with a wrench in it. Hovered or focused, it slides out into a band
 * that reads "Edit dashboard". On touch there is no hover, so the triangle is
 * the whole control and a tap starts editing. Hidden while editing (Done is in
 * the edit bar); when editing ends it takes focus back.
 *
 * Render it once, outside the page's spacing wrapper, at the top of the page
 * content. It sits at the corner of the scrolling <main> (flush with its
 * top and right edges, touching the header) and stays there as the page
 * scrolls: `sticky`, measured from <main>'s content edge (browsers add the
 * padding to a sticky offset), so `top-0` plus the -translate-y-6 that cancels
 * the page's 1.5rem padding lands on <main>'s top edge.
 */
export function EditCorner() {
  const { editing, setEditing, claimFocusReturn } = useDashboardEditMode()
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const el = ref.current
    if (editing || !el) return
    if (claimFocusReturn()) el.focus()
  }, [editing, claimFocusReturn])
  const label = "Edit dashboard"
  return (
    <div className="pointer-events-none sticky top-0 z-30 h-0 -translate-y-6" data-edit-corner>
      {/* Anchored to the corner of <main> (past its right padding). */}
      <div className="absolute top-0 -right-6 drop-shadow-sm">
        <button
          ref={ref}
          type="button"
          onClick={() => setEditing(true)}
          aria-label={label}
          aria-hidden={editing || undefined}
          tabIndex={editing ? -1 : undefined}
          className={cn(
            "group/corner pointer-events-auto relative block h-14 w-[13rem] cursor-pointer bg-primary text-primary-foreground outline-none",
            // The clip is the shape: a triangle (its three points are the two top corners' near side and the bottom of the right edge) …
            "[clip-path:polygon(calc(100%_-_3.5rem)_0,100%_0,100%_100%,calc(100%_-_3.5rem)_0)]",
            // … that widens into a slanted band. Same four points, so the change slides.
            "motion-safe:transition-[clip-path] motion-safe:duration-300 motion-safe:ease-out",
            "hover:[clip-path:polygon(0_0,100%_0,100%_100%,0_2.5rem)] focus-visible:[clip-path:polygon(0_0,100%_0,100%_100%,0_2.5rem)]",
            editing && "pointer-events-none opacity-0 motion-safe:transition-opacity",
          )}
        >
          <span
            aria-hidden
            className="absolute top-2.5 left-5 text-[13px] leading-none font-medium whitespace-nowrap opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-300 -translate-x-3 group-hover/corner:translate-x-0 group-hover/corner:opacity-100 group-focus-visible/corner:translate-x-0 group-focus-visible/corner:opacity-100"
          >
            {label}
          </span>
          <Wrench className="absolute top-2 right-2 size-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  )
}
