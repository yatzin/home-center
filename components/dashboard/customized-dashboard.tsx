import { loadFeatures } from "@/lib/features-server"
import { getFormat } from "@/lib/regional-server"
import { cardType } from "@/lib/dashboard/card-types"
import { loadConfigItemOptions } from "@/lib/dashboard/config-options-server"
import { loadDashboardLayout } from "@/lib/dashboard/layout-server"
import { loadCard } from "@/lib/dashboard/load-cards-server"
import { LOADERS, type LoaderContext } from "@/lib/dashboard/loaders"
import { DashboardCanvas } from "./canvas/dashboard-canvas"

/**
 * The admin-arranged dashboard (features.customizedDashboards). Loads the saved
 * layout and runs a loader for each placed card. Cards of an unknown type, for
 * a feature that is off, or without a loader yet are skipped here but stay in
 * the stored layout.
 */
export async function CustomizedDashboard({ isAdmin }: { isAdmin: boolean }) {
  const features = await loadFeatures()
  const [{ layout, revision }, fmt] = await Promise.all([loadDashboardLayout(features), getFormat()])
  const ctx: LoaderContext = { now: new Date(), features, fmt }

  const placed = layout.cards.filter((c) => {
    const def = cardType(c.type)
    return def !== undefined && (!def.requires || features[def.requires]) && Object.hasOwn(LOADERS, c.type)
  })
  const [cards, itemOptions] = await Promise.all([
    Promise.all(placed.map((c) => loadCard(c, ctx))),
    // Only admins can open card settings, so only they get the item lists.
    isAdmin ? loadConfigItemOptions(features) : null,
  ])

  return (
    <DashboardCanvas
      cards={cards}
      layout={layout}
      revision={revision}
      features={features}
      isAdmin={isAdmin}
      itemOptions={itemOptions}
    />
  )
}
