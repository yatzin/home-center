import { loadFeatures } from "@/lib/features-server"
import { getFormat } from "@/lib/regional-server"
import { cardType } from "@/lib/dashboard/card-types"
import { loadDashboardLayout } from "@/lib/dashboard/layout-server"
import { LOADERS, type CardResult, type LoaderContext } from "@/lib/dashboard/loaders"
import type { CardInstance } from "@/lib/dashboard/layout"
import { DashboardCanvas } from "./canvas/dashboard-canvas"

async function loadCard(card: CardInstance, ctx: LoaderContext): Promise<CardResult> {
  const base = { id: card.id, type: card.type, config: card.config }
  try {
    return { ...base, status: "ok", data: await LOADERS[card.type](card.config, ctx) }
  } catch (error) {
    // One failing card must not take down the page: it renders its own error state.
    console.error(`[dashboard] card "${card.id}" (${card.type}) failed to load`, error)
    return { ...base, status: "error" }
  }
}

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
  const cards = await Promise.all(placed.map((c) => loadCard(c, ctx)))

  return (
    <DashboardCanvas cards={cards} layout={layout} revision={revision} features={features} isAdmin={isAdmin} />
  )
}
