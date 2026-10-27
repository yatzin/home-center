"use client"

// A card whose configured item was deleted says so, and in edit mode offers
// admins "Choose another", which opens that card's settings. The editor
// provides the opener per card; without it (view mode, non-admins) the card
// shows a note instead.

import { createContext, useContext } from "react"
import { Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ConfigureContext = createContext<(() => void) | null>(null)

/** Gives the cards inside it a way to open their settings (edit mode, admins). */
export const CardConfigureProvider = ConfigureContext.Provider

const ViewerIsAdminContext = createContext(false)

/** Whether the person looking at the dashboard is an admin (for hints only admins can act on). */
export const ViewerIsAdminProvider = ViewerIsAdminContext.Provider
export const useViewerIsAdmin = () => useContext(ViewerIsAdminContext)

const NOTE = "An admin can choose another one for this card."

/** Under a "no longer exists" message: the "Choose another" button, or a note. */
export function ChooseAnother({ compact, className }: { compact?: boolean; className?: string }) {
  const configure = useContext(ConfigureContext)
  if (!configure) {
    return <p className={cn("text-muted-foreground", compact ? "line-clamp-2 text-[11px] leading-snug" : "text-xs", className)}>{NOTE}</p>
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={configure}
      // Above the editor's drag surface (see EditableCard); a 44px target on touch.
      className={cn("relative z-20 pointer-coarse:h-11 pointer-coarse:px-4", compact ? "mt-1 self-start" : "mt-1.5", className)}
    >
      <Settings2 aria-hidden />
      Choose another
    </Button>
  )
}
