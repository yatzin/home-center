"use client"

import { Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * A card's settings button in edit mode. A 44px touch target on touch screens;
 * the visible chip is smaller (like the Move & resize chip).
 */
export function CardGear({ cardTitle, onClick, className }: { cardTitle: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      data-gear
      aria-label={`${cardTitle} settings`}
      title="Card settings"
      onClick={onClick}
      className={cn(
        "group/gear flex size-7 touch-manipulation items-center justify-center rounded-full outline-none pointer-coarse:size-11",
        "focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-ring",
        className,
      )}
    >
      <span className="flex size-6 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-sm transition-colors duration-150 group-hover/gear:border-primary/50 group-hover/gear:text-primary pointer-coarse:size-8">
        <Settings2 className="size-3.5" aria-hidden />
      </span>
    </button>
  )
}
