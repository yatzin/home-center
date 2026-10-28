"use client"

// "Move & resize" for one card in edit mode: the non-drag way to arrange the
// dashboard (touch tablets without precise dragging, switch users, anyone who
// prefers tapping). It only shows the choices it is given; the editor builds
// them from the same reducer paths as the keyboard, so there is no geometry
// here. The menu stays open after a choice, so "Wider, Wider" is two taps and
// the card can be watched changing.

import type { LucideIcon } from "lucide-react"
import { Check, Move } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type AdjustItem = {
  key: string
  label: string
  icon: LucideIcon
  /** Nothing would change (an edge or a size limit). */
  disabled?: boolean
  /** The card is at this choice now (a size preset): shown with a check. */
  checked?: boolean
  onSelect: () => void
}

export type AdjustGroup = { label: string; items: AdjustItem[] }

function Groups({ getGroups }: { getGroups: () => AdjustGroup[] }) {
  // Built only while the menu is open, and again after each choice.
  const groups = getGroups()
  return groups.map((group, i) => (
    <div key={group.label}>
      {i > 0 && <DropdownMenuSeparator />}
      <DropdownMenuGroup>
        <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
        {group.items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            disabled={item.disabled}
            closeOnClick={false}
            onClick={item.onSelect}
            className="pointer-coarse:min-h-11 pointer-coarse:px-2.5"
          >
            <item.icon aria-hidden />
            {item.label}
            {item.checked && (
              <>
                <Check className="ml-auto text-primary" aria-hidden />
                <span className="sr-only">(current)</span>
              </>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </div>
  ))
}

export function CardAdjustMenu({
  cardTitle,
  getGroups,
  disabled,
  align = "start",
  className,
}: {
  cardTitle: string
  getGroups: () => AdjustGroup[]
  disabled?: boolean
  /** Which edge of the trigger the menu lines up with. */
  align?: "start" | "end"
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`Move and resize ${cardTitle}`}
        title="Move & resize"
        className={cn(
          // A 44px touch target on touch screens; the visible chip is smaller.
          "group/adjust flex size-7 items-center justify-center rounded-full pointer-coarse:size-11",
          "focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-ring data-[disabled]:opacity-50",
          className,
        )}
      >
        <span className="flex size-6 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-sm transition-colors duration-150 group-hover/adjust:border-primary/50 group-hover/adjust:text-primary group-data-[popup-open]/adjust:border-primary/60 group-data-[popup-open]/adjust:text-primary pointer-coarse:size-8">
          <Move className="size-3.5" aria-hidden />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-auto min-w-44">
        <Groups getGroups={getGroups} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
