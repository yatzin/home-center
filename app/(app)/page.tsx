import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { checkAndNotify } from "@/lib/notifications/checker"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Car, Wrench, ShieldCheck, Calendar, AlertTriangle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

export default async function DashboardPage() {
  const session = await auth()

  // Fire-and-forget: generate notifications for due items without blocking render
  checkAndNotify().catch(() => {})

  const now = new Date()
  const in30 = new Date(Date.now() + 30 * 86400000)
  const in60 = new Date(Date.now() + 60 * 86400000)

  const [
    propertyCount, vehicleCount, recordCount,
    warrantyCount, maintenanceCount,
    recentRecords, urgentMaintenance, expiringWarranties,
    properties, vehicles,
  ] = await Promise.all([
    prisma.property.count(),
    prisma.vehicle.count(),
    prisma.serviceRecord.count(),
    prisma.warranty.count({ where: { expirationDate: { gt: now } } }),
    prisma.maintenanceSchedule.count({ where: { isActive: true, nextDueDate: { lte: in30 } } }),
    prisma.serviceRecord.findMany({ orderBy: { date: "desc" }, take: 5 }),
    prisma.maintenanceSchedule.findMany({
      where: { isActive: true, nextDueDate: { lte: in30 } },
      orderBy: { nextDueDate: "asc" },
      take: 6,
    }),
    prisma.warranty.findMany({
      where: { expirationDate: { gte: now, lte: in60 } },
      orderBy: { expirationDate: "asc" },
      take: 6,
    }),
    prisma.property.findMany({ select: { id: true, name: true } }),
    prisma.vehicle.findMany({ select: { id: true, name: true } }),
  ])

  const propMap = Object.fromEntries(properties.map((p) => [p.id, p.name]))
  const vehMap = Object.fromEntries(vehicles.map((v) => [v.id, v.name]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome back{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">Here&apos;s an overview of your homes and vehicles.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard icon={Building2} label="Properties" value={propertyCount} href="/assets/properties" />
        <SummaryCard icon={Car} label="Vehicles" value={vehicleCount} href="/assets/vehicles" />
        <SummaryCard icon={Wrench} label="Service Records" value={recordCount} href="/records" />
        <SummaryCard icon={ShieldCheck} label="Active Warranties" value={warrantyCount} href="/warranties" />
        <SummaryCard icon={Calendar} label="Due (30d)" value={maintenanceCount} href="/maintenance" urgent={maintenanceCount > 0} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Upcoming maintenance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Upcoming Maintenance
              <Link href="/maintenance" className="text-xs text-muted-foreground hover:text-foreground font-normal">View all →</Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {urgentMaintenance.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due in the next 30 days.</p>
            ) : urgentMaintenance.map((s) => {
              const assetName = s.assetType === "PROPERTY" ? propMap[s.assetId] : vehMap[s.assetId]
              const daysLeft = s.nextDueDate ? Math.ceil((new Date(s.nextDueDate).getTime() - now.getTime()) / 86400000) : null
              const overdue = daysLeft !== null && daysLeft < 0
              return (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  {overdue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" /> : <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{assetName}</span>
                  <Badge variant={overdue ? "destructive" : "secondary"} className="shrink-0 text-xs">
                    {daysLeft === null ? "—" : daysLeft < 0 ? `${Math.abs(daysLeft)}d late` : daysLeft === 0 ? "Today" : `${daysLeft}d`}
                  </Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Expiring warranties */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Expiring Warranties
              <Link href="/warranties" className="text-xs text-muted-foreground hover:text-foreground font-normal">View all →</Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {expiringWarranties.length === 0 ? (
              <p className="text-sm text-muted-foreground">No warranties expiring in the next 60 days.</p>
            ) : expiringWarranties.map((w) => {
              const assetName = w.assetType === "PROPERTY" ? propMap[w.assetId] : vehMap[w.assetId]
              const daysLeft = w.expirationDate ? Math.ceil((new Date(w.expirationDate).getTime() - now.getTime()) / 86400000) : null
              return (
                <div key={w.id} className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{w.productName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{assetName}</span>
                  <Badge variant="secondary" className="shrink-0 text-xs">{daysLeft}d</Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Recent service */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Recent Service
              <Link href="/records" className="text-xs text-muted-foreground hover:text-foreground font-normal">View all →</Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">No service records yet.</p>
            ) : recentRecords.map((r) => {
              const assetName = r.assetType === "PROPERTY" ? propMap[r.assetId] : vehMap[r.assetId]
              return (
                <div key={r.id} className="flex items-center gap-2 text-sm">
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{r.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{assetName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{new Date(r.date).toLocaleDateString()}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, href, urgent }: {
  icon: React.ElementType; label: string; value: number; href: string; urgent?: boolean
}) {
  return (
    <Link href={href} className="block">
      <Card className="py-5 transition-all duration-150 hover:-translate-y-px hover:shadow-md">
        <CardContent className="flex flex-col gap-3 px-5">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              urgent ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div>
            <div className={cn("text-[28px] font-semibold leading-none tabular-nums", urgent && "text-destructive")}>
              {value}
            </div>
            <div className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

