"use client"

// Whether the dashboard is in edit mode, shared between the "Edit dashboard"
// button in the page header and the canvas below it. The page renders both
// inside DashboardEditProvider; the server only renders the button for admins,
// and the actions check again.

import { createContext, useContext, useMemo, useState } from "react"
import { LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"

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

/** "Edit dashboard", top right of the dashboard header. While editing, Done lives in the edit bar instead. */
export function EditDashboardButton() {
  const { editing, setEditing } = useDashboardEditMode()
  if (editing) return null
  return (
    <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="shrink-0">
      <LayoutGrid aria-hidden />
      Edit dashboard
    </Button>
  )
}
