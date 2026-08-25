import Link from "next/link"
import { formatMoney, type RankedEntry } from "@/lib/costs"

// Nominal categories — assets, vendors — so every bar wears the same hue. Bar
// length already encodes magnitude; colouring each one differently would spend
// the identity channel re-encoding what the length shows.
export function RankedBars({
  entries,
  hrefFor,
  emptyMessage = "Nothing to show yet.",
}: {
  entries: RankedEntry[]
  hrefFor?: (entry: RankedEntry) => string
  emptyMessage?: string
}) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <ul className="space-y-2.5">
      {entries.map((entry) => {
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm">{entry.label}</span>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {formatMoney(entry.total)}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                // Sub-pixel widths vanish entirely, so a real but tiny value keeps
                // a visible sliver rather than rendering as nothing.
                style={{
                  width: `${Math.max(entry.share * 100, 1.5)}%`,
                  backgroundColor: "var(--cost-bar)",
                }}
                title={`${entry.label}: ${formatMoney(entry.total)} across ${entry.count} record${entry.count === 1 ? "" : "s"}`}
              />
            </div>
          </>
        )

        const href = hrefFor?.(entry)
        return (
          <li key={entry.key}>
            {href ? (
              <Link href={href} className="block rounded-md transition-colors hover:bg-muted/40">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        )
      })}
    </ul>
  )
}
