import { cache } from "react"
import { prisma } from "@/lib/prisma"
import type { Features } from "@/lib/features"
import type { DashboardLayout } from "./layout"
import { reconcile } from "./reconcile"

export const DASHBOARD_LAYOUT_ID = "singleton"

/** The saved layout (repaired) and its revision; the default at revision 0 when none is saved. Once per request. */
export const loadDashboardLayout = cache(
  async (features: Features): Promise<{ layout: DashboardLayout; revision: number }> => {
    const row = await prisma.dashboardLayout.findUnique({ where: { id: DASHBOARD_LAYOUT_ID } })
    return { layout: reconcile(row?.data ?? null, features), revision: row?.revision ?? 0 }
  },
)
