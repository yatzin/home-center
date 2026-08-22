import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Suspense } from "react"
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react"
import { loadAssetIndex } from "@/lib/assets-server"
import { assetHref, assetIcon } from "@/lib/assets"
import { UrlSortHead, UrlPaginationBar } from "@/components/ui/url-table"
import { parseTableParams, pageCountOf, withParams, type SortMap } from "@/lib/table-params"
import type { Prisma } from "@/app/generated/prisma/client"

const DEFAULT_SORT = "nextDue"
const DEFAULT_DIR = "asc"

// As on the warranties page, "status" is derived from the due date and orders
// identically, so the token maps onto nextDueDate.
const SORTABLE: SortMap<Prisma.MaintenanceScheduleOrderByWithRelationInput> = {
  task: (dir) => [{ title: dir }],
  nextDue: (dir) => [{ nextDueDate: { sort: dir, nulls: "last" } }],
  lastDone: (dir) => [{ lastCompletedDate: { sort: dir, nulls: "last" } }],
  status: (dir) => [{ nextDueDate: { sort: dir, nulls: "last" } }],
}

function getStatus(nextDueDate: Date | null, reminderDaysBefore: number) {
  const now = Date.now()
  if (nextDueDate && new Date(nextDueDate).getTime() < now) {
    return { label: "Overdue", variant: "destructive" as const, icon: AlertTriangle }
  }
  if (nextDueDate) {
    const days = Math.ceil((new Date(nextDueDate).getTime() - now) / 86400000)
    if (days <= reminderDaysBefore) return { label: `${days}d`, variant: "secondary" as const, icon: Clock }
  }
  return { label: "Active", variant: "outline" as const, icon: CheckCircle2 }
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const now = new Date()

  const { page, per, skip, take, orderBy } = parseTableParams({
    searchParams: params,
    sortable: SORTABLE,
    defaultSort: DEFAULT_SORT,
    defaultDir: DEFAULT_DIR,
    tiebreaker: { id: "asc" },
  })

  const where: Prisma.MaintenanceScheduleWhereInput = { isActive: true }

  const [schedules, total, overdue, dueSoonCandidates, assets] = await Promise.all([
    prisma.maintenanceSchedule.findMany({ where, orderBy, skip, take }),
    prisma.maintenanceSchedule.count({ where }),
    prisma.maintenanceSchedule.count({ where: { ...where, nextDueDate: { lt: now } } }),
    // "Due soon" compares nextDueDate against each row's own reminderDaysBefore,
    // which is a column-to-column date comparison SQL can't express here. Pull
    // just those two columns for anything due within a year and finish in JS —
    // the headline count has to reflect every row, not the current page.
    prisma.maintenanceSchedule.findMany({
      where: { ...where, nextDueDate: { gte: now, lte: new Date(now.getTime() + 365 * 86400000) } },
      select: { nextDueDate: true, reminderDaysBefore: true },
    }),
    loadAssetIndex(),
  ])

  const dueSoon = dueSoonCandidates.filter((s) => {
    const days = Math.ceil((new Date(s.nextDueDate!).getTime() - now.getTime()) / 86400000)
    return days >= 0 && days <= s.reminderDaysBefore
  }).length

  const pageCount = pageCountOf(total, per)
  if (page > pageCount) redirect(`/maintenance${withParams(params, { page: pageCount === 1 ? undefined : pageCount })}`)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Maintenance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {total} active schedule{total !== 1 ? "s" : ""}
          {overdue > 0 && <span className="ml-2 text-destructive font-medium">· {overdue} overdue</span>}
          {dueSoon > 0 && <span className="ml-2 text-amber-700 dark:text-amber-400 font-medium">· {dueSoon} due soon</span>}
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">No maintenance schedules</p>
          <p className="text-sm mt-1">Add schedules from a property, vehicle, or equipment detail page.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <Suspense>
                    <UrlSortHead column="status" label="Status" defaultSort={DEFAULT_SORT} defaultDir={DEFAULT_DIR} />
                  </Suspense>
                  <th scope="col" className="text-left font-medium px-4 py-2.5">Asset</th>
                  <Suspense>
                    <UrlSortHead column="task" label="Task" defaultSort={DEFAULT_SORT} defaultDir={DEFAULT_DIR} />
                  </Suspense>
                  <Suspense>
                    <UrlSortHead column="nextDue" label="Next Due" className="hidden sm:table-cell" defaultSort={DEFAULT_SORT} defaultDir={DEFAULT_DIR} />
                  </Suspense>
                  <Suspense>
                    <UrlSortHead column="lastDone" label="Last Done" className="hidden md:table-cell" initialDir="desc" defaultSort={DEFAULT_SORT} defaultDir={DEFAULT_DIR} />
                  </Suspense>
                </tr>
              </thead>
              <tbody className="divide-y">
                {schedules.map((s) => {
                  const assetName = assets.assetName(s.assetType, s.assetId)
                  const AssetIcon = assetIcon[s.assetType]
                  const status = getStatus(s.nextDueDate, s.reminderDaysBefore)
                  const StatusIcon = status.icon

                  return (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={assetHref(s.assetType, s.assetId)} className="flex items-center gap-1.5 hover:underline">
                          <AssetIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {assetName ?? <span className="text-muted-foreground italic">Unknown</span>}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{s.title}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {s.nextDueDate ? new Date(s.nextDueDate).toLocaleDateString() : "—"}
                        {s.nextDueMileage != null && <span className="block text-xs">{s.nextDueMileage.toLocaleString()} mi</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {s.lastCompletedDate ? new Date(s.lastCompletedDate).toLocaleDateString() : "Never"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Suspense>
            <UrlPaginationBar page={page} pageCount={pageCount} total={total} per={per} label="schedules" />
          </Suspense>
        </div>
      )}
    </div>
  )
}
