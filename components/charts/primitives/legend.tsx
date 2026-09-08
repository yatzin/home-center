"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"

// A legend is present whenever a chart carries two or more series — it is the
// identity channel that does not depend on the reader distinguishing two hues.
// A single-series chart gets none: the panel title already names what is plotted,
// and a box with one swatch in it just restates the title.

export type LegendItem = { key: string; label: string; color: string }

/// Two modes, and which one is in play is decided by the caller passing `hrefFor`.
///
/// - **Mute** (no `hrefFor`): clicking dims a series and rescales the chart to
///   what is left. Pure view state, so it stays in the client.
/// - **Filter** (`hrefFor`): clicking navigates. Changing which rows the page is
///   about belongs in the URL, where it is shareable and survives a reload —
///   the same rule the year and asset-type filters already follow.
export function Legend({
  items,
  mutedKeys,
  onToggle,
  hrefFor,
  activeKey,
  className,
}: {
  items: LegendItem[]
  mutedKeys?: Set<string>
  onToggle?: (key: string) => void
  hrefFor?: (item: LegendItem) => string
  activeKey?: string
  className?: string
}) {
  if (items.length === 0) return null

  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => {
        const muted = mutedKeys?.has(item.key) ?? false
        const swatch = (
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-sm transition-opacity"
            style={{ backgroundColor: item.color, opacity: muted ? 0.3 : 1 }}
          />
        )
        // Muting changes opacity *and* strikes the label through, so the state is
        // never carried by colour alone.
        const label = (
          <span className={cn("truncate", muted && "line-through opacity-60")}>{item.label}</span>
        )

        return (
          <li key={item.key}>
            {hrefFor ? (
              <Link
                href={hrefFor(item)}
                aria-current={activeKey === item.key ? "true" : undefined}
                className={cn(
                  "flex min-h-6 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors",
                  activeKey === item.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {swatch}
                {label}
              </Link>
            ) : (
              <button
                type="button"
                aria-pressed={!muted}
                onClick={() => onToggle?.(item.key)}
                className="flex min-h-6 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                {swatch}
                {label}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
