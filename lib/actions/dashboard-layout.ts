"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import { loadFeatures } from "@/lib/features-server"
import { DASHBOARD_LAYOUT_ID } from "@/lib/dashboard/layout-server"
import { defaultLayout, limitsMap } from "@/lib/dashboard/card-types"
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
  const layout = parseLayout(input.layout)
  if (!layout) return { error: "Invalid layout." }
  const message = validateLayout(layout, limitsMap())
  if (message) return { error: message }
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

export async function resetDashboardLayout(): Promise<{ success: true; revision: number } | { error: string }> {
  await requireAdmin()
  const data = JSON.stringify(defaultLayout(await loadFeatures()))
  const row = await prisma.dashboardLayout.upsert({
    where: { id: DASHBOARD_LAYOUT_ID },
    create: { id: DASHBOARD_LAYOUT_ID, data, revision: 1 },
    update: { data, revision: { increment: 1 } },
  })
  revalidatePath("/")
  return { success: true, revision: row.revision }
}
