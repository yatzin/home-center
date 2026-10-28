"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import { loadFeatures } from "@/lib/features-server"
import { getFormat } from "@/lib/regional-server"
import { loadPropertyScope } from "@/lib/property-filter-server"
import { DASHBOARD_LAYOUT_ID, loadDashboardLayout } from "@/lib/dashboard/layout-server"
import { loadCard } from "@/lib/dashboard/load-cards-server"
import { LOADERS, type CardResult, type LoaderContext } from "@/lib/dashboard/loaders"
import { cardType, defaultLayout, invalidCardConfig, limitsMap, normalizeCardConfigs } from "@/lib/dashboard/card-types"
import { parseLayout, validateLayout, type DashboardLayout } from "@/lib/dashboard/layout"

const MAX_BYTES = 256 * 1024
const CONFLICT = { error: "The dashboard was changed somewhere else. Reload to see the latest.", conflict: true } as const

type Result = { success: true; revision: number } | { error: string; conflict?: true }

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002"
}

export async function saveDashboardLayout(input: { layout: DashboardLayout; baseRevision: number }): Promise<Result> {
  await requireAdmin()
  const baseRevision = input?.baseRevision
  if (!Number.isInteger(baseRevision) || baseRevision < 0) return { error: "Invalid layout." }
  // Cheap early reject, before any parsing.
  if (JSON.stringify(input.layout ?? null)?.length > MAX_BYTES) return { error: "The layout is too large." }
  const parsedLayout = parseLayout(input.layout)
  if (!parsedLayout) return { error: "Invalid layout." }
  const message = validateLayout(parsedLayout, limitsMap()) ?? invalidCardConfig(parsedLayout)
  if (message) return { error: message }
  // Store what each card's schema parsed, not the raw config (unknown keys dropped).
  const layout = normalizeCardConfigs(parsedLayout)
  const data = JSON.stringify(layout)
  if (data.length > MAX_BYTES) return { error: "The layout is too large." }

  const { count } = await prisma.dashboardLayout.updateMany({
    where: { id: DASHBOARD_LAYOUT_ID, revision: baseRevision },
    data: { data, revision: { increment: 1 } },
  })
  if (count === 0) {
    if (baseRevision !== 0) return CONFLICT
    try {
      await prisma.dashboardLayout.create({ data: { id: DASHBOARD_LAYOUT_ID, data, revision: 1 } })
    } catch (e) {
      if (isUniqueViolation(e)) return CONFLICT
      throw e
    }
  }
  // No revalidatePath here: it would re-run every card's queries on each
  // autosave. The editor calls router.refresh() when editing is done.
  return { success: true, revision: baseRevision + 1 }
}

/**
 * Data for some cards of the saved layout, with the layout revision it was
 * read from (the editor never lets older data replace newer). For the editor: cards added or
 * reconfigured since the page loaded have none until their save lands. Loads
 * by id from the stored layout (with its saved config, never one sent by the
 * client); ids not in it, or of a type that is not shown, are skipped. The
 * editor merges the results into the data it has, so nothing else on the
 * page re-renders (a full page refresh here was seen to stall now and then).
 */
export async function loadDashboardCards(ids: string[]): Promise<{ revision: number; cards: CardResult[] }> {
  const session = await requireAdmin()
  if (!Array.isArray(ids)) return { revision: 0, cards: [] }
  const wanted = new Set(ids.slice(0, 100).filter((id): id is string => typeof id === "string"))
  const features = await loadFeatures()
  // The scope comes from this request's cookie, so the editor's reloaded cards
  // follow the same device's property filter as the page did.
  const [{ layout, revision }, fmt, scope] = await Promise.all([loadDashboardLayout(features), getFormat(), loadPropertyScope()])
  const ctx: LoaderContext = { now: new Date(), features, fmt, scope, userName: session.user.name ?? null }
  const cards = layout.cards.filter((c) => {
    const def = cardType(c.type)
    return wanted.has(c.id) && def !== undefined && (!def.requires || features[def.requires]) && Object.hasOwn(LOADERS, c.type)
  })
  return { revision, cards: await Promise.all(cards.map((c) => loadCard(c, ctx))) }
}

/** Back to the default layout (both layouts). Returns it so the editor can show it without a reload. */
export async function resetDashboardLayout(): Promise<
  { success: true; revision: number; layout: DashboardLayout } | { error: string }
> {
  await requireAdmin()
  const layout = defaultLayout(await loadFeatures())
  const data = JSON.stringify(layout)
  const row = await prisma.dashboardLayout.upsert({
    where: { id: DASHBOARD_LAYOUT_ID },
    create: { id: DASHBOARD_LAYOUT_ID, data, revision: 1 },
    update: { data, revision: { increment: 1 } },
  })
  revalidatePath("/")
  return { success: true, revision: row.revision, layout }
}
