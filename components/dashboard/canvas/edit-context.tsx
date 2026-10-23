"use client"

// Whether the dashboard is in edit mode, shared between the "Edit dashboard"
// button in the page header and the canvas below it. The page renders both
// inside DashboardEditProvider; the server only renders the button for admins,
// and the actions check again.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type EditMode = { editing: boolean; setEditing: (editing: boolean) => void }

const EditModeContext = createContext<EditMode>({ editing: false, setEditing: () => {} })

export function DashboardEditProvider({ children }: { children: React.ReactNode }) {
  const [editing, setEditing] = useState(false)
  const value = useMemo(() => ({ editing, setEditing }), [editing])
  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>
}

export function useDashboardEditMode(): EditMode {
  return useContext(EditModeContext)
}

/**
 * "Edit dashboard", top right of the dashboard header. While editing, Done
 * lives in the edit bar instead: the button stays mounted but invisible (no
 * header jump), and takes focus back when editing ends.
 */
export function EditDashboardButton() {
  const { editing, setEditing } = useDashboardEditMode()
  const ref = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(editing)
  useEffect(() => {
    if (wasEditing.current && !editing) ref.current?.focus()
    wasEditing.current = editing
  }, [editing])
  return (
    <Button
      ref={ref}
      variant="outline"
      size="sm"
      onClick={() => setEditing(true)}
      // Not `invisible`: the button transitions all properties, and a visibility
      // transition would keep it unfocusable for a moment after editing ends.
      className={cn("shrink-0", editing && "pointer-events-none opacity-0")}
      aria-hidden={editing || undefined}
      tabIndex={editing ? -1 : undefined}
    >
      <LayoutGrid aria-hidden />
      Edit dashboard
    </Button>
  )
}
