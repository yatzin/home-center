"use client"

import Link from "next/link"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { InboxDropZone } from "@/components/inbox/inbox-drop-zone"
import { IntakeTip } from "@/components/dashboard/intake-tip"
import { CHIP } from "@/components/dashboard/intake-chip"
import type { IntakeCardData } from "@/lib/dashboard/loaders"
import { CardShell } from "./card-shell"
import type { CardViewProps } from "./types"

// Intake fills its frame at any size: a header, the waiting items in a region
// that scrolls (never grows the card), and the drop target pinned underneath.
// The smallest tier shows just the count and the drop target; the tip appears
// only with room to spare (the detailed tier).

const TIER_COUNT = 0
const TIER_DETAILED = 2

function isIntakeData(data: unknown): data is IntakeCardData {
  return typeof data === "object" && data !== null && "count" in data && typeof data.count === "number" && "items" in data && Array.isArray(data.items)
}

export function IntakeView({ data, tier }: CardViewProps) {
  if (!isIntakeData(data)) throw new Error("Unexpected Intake card data")
  const { count, items } = data
  const countLine = count === 0 ? (tier === TIER_COUNT ? "Drop files here." : "Drop receipts, invoices and manuals here.") : `${count} to review`
  const showList = tier !== TIER_COUNT && items.length > 0

  return (
    <CardShell title="Intake" href="/intake">
      <div className={`flex h-full min-h-0 flex-col gap-2 pb-4 ${tier === TIER_COUNT ? "px-3" : "px-5"}`}>
        <p className={count === 0 ? "shrink-0 px-2 text-sm text-muted-foreground" : "shrink-0 px-2 text-sm font-medium"}>{countLine}</p>
        {showList ? (
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {items.map((item) => {
              const chip = CHIP[item.readiness]
              return (
                <li key={item.id}>
                  <Link
                    href="/intake"
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors duration-150 hover:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1 truncate">{item.headline}</span>
                    <Badge className={`h-5 shrink-0 px-1.5 text-[11px] ${chip.className}`}>
                      {item.readiness === "reading" && <Loader2 className="animate-spin" />}
                      {item.readiness === "failed" && <AlertTriangle />}
                      {chip.label}
                    </Badge>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="min-h-0 flex-1" />
        )}
        <div className="shrink-0 space-y-2">
          <InboxDropZone variant="compact" />
          {tier === TIER_DETAILED && <IntakeTip />}
        </div>
      </div>
    </CardShell>
  )
}
