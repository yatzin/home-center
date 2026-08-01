import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Building2, Car, AlertTriangle, Clock, CheckCircle2 } from "lucide-react"

function getStatus(nextDueDate: Date | null, nextDueMileage: number | null, reminderDaysBefore: number) {
  const now = new Date()
  if (nextDueDate && new Date(nextDueDate) < now) return { label: "Overdue", variant: "destructive" as const, icon: AlertTriangle }
  if (nextDueDate) {
    const days = Math.ceil((new Date(nextDueDate).getTime() - now.getTime()) / 86400000)
    if (days <= reminderDaysBefore) return { label: `${days}d`, variant: "secondary" as const, icon: Clock }
  }
  if (nextDueMileage != null) return { label: "Active", variant: "outline" as const, icon: CheckCircle2 }
  return { label: "Active", variant: "outline" as const, icon: CheckCircle2 }
}

export default async function MaintenancePage() {
  const [schedules, properties, vehicles] = await Promise.all([
    prisma.maintenanceSchedule.findMany({ where: { isActive: true }, orderBy: [{ nextDueDate: "asc" }] }),
    prisma.property.findMany({ select: { id: true, name: true } }),
    prisma.vehicle.findMany({ select: { id: true, name: true, currentMileage: true } }),
  ])

  const propMap = Object.fromEntries(properties.map((p) => [p.id, p.name]))
  const vehMap = Object.fromEntries(vehicles.map((v) => [v.id, { name: v.name, mileage: v.currentMileage }]))

  const overdue = schedules.filter((s) => s.nextDueDate && new Date(s.nextDueDate) < new Date()).length
  const dueSoon = schedules.filter((s) => {
    if (!s.nextDueDate) return false
    const days = Math.ceil((new Date(s.nextDueDate).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= s.reminderDaysBefore
  }).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Maintenance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {schedules.length} active schedule{schedules.length !== 1 ? "s" : ""}
          {overdue > 0 && <span className="ml-2 text-destructive font-medium">· {overdue} overdue</span>}
          {dueSoon > 0 && <span className="ml-2 text-amber-600 font-medium">· {dueSoon} due soon</span>}
        </p>
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">No maintenance schedules</p>
          <p className="text-sm mt-1">Add schedules from a property or vehicle detail page.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-left font-medium px-4 py-2.5">Asset</th>
                <th className="text-left font-medium px-4 py-2.5">Task</th>
                <th className="text-left font-medium px-4 py-2.5 hidden sm:table-cell">Next Due</th>
                <th className="text-left font-medium px-4 py-2.5 hidden md:table-cell">Last Done</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {schedules.map((s) => {
                const assetName = s.assetType === "PROPERTY" ? propMap[s.assetId] : vehMap[s.assetId]?.name
                const assetHref = s.assetType === "PROPERTY" ? `/assets/properties/${s.assetId}` : `/assets/vehicles/${s.assetId}`
                const AssetIcon = s.assetType === "PROPERTY" ? Building2 : Car
                const status = getStatus(s.nextDueDate, s.nextDueMileage, s.reminderDaysBefore)
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
                      <Link href={assetHref} className="flex items-center gap-1.5 hover:underline">
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
      )}
    </div>
  )
}
