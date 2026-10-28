import type { Features } from "@/lib/features"
import { defaultLayout, limitsMap } from "./card-types"
import { parseLayout, repairLayout, type DashboardLayout } from "./layout"

/**
 * Turns the stored JSON into a layout the page can always render: the default
 * when nothing usable is stored, otherwise the stored layout repaired against
 * the known card types. Feature-gated cards are kept (rendering filters them).
 */
export function reconcile(raw: string | null, features: Features): DashboardLayout {
  if (raw === null) return defaultLayout(features)
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return defaultLayout(features)
  }
  const parsed = parseLayout(json)
  return parsed ? repairLayout(parsed, limitsMap()) : defaultLayout(features)
}
