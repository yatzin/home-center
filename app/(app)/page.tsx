import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { checkAndNotify } from "@/lib/notifications/checker"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Car, Wrench, ShieldCheck, Calendar, AlertTriangle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AssetType } from "@/app/generated/prisma/client"

function assetHref(assetType: AssetType, assetId: string) {
  return assetType === "PROPERTY" ? `/assets/properties/${assetId}` : `/assets/vehicles/${assetId}`
}

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
        <Card className="py-5">
          <CardHeader className="px-5 pb-1">
            <CardTitle className="flex items-center justify-between text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              Upcoming Maintenance
              <Link
                href="/maintenance"
                className="rounded-md px-2 py-1 text-xs font-medium normal-case tracking-normal text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
              >
                View all →
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-5">
            {urgentMaintenance.length === 0 ? (
              <EmptyPanel icon={Clock} message="Nothing due in the next 30 days." />
            ) : urgentMaintenance.map((s) => {
              const assetName = s.assetType === "PROPERTY" ? propMap[s.assetId] : vehMap[s.assetId]
              const href = assetHref(s.assetType, s.assetId)
              const daysLeft = s.nextDueDate ? Math.ceil((new Date(s.nextDueDate).getTime() - now.getTime()) / 86400000) : null
              const overdue = daysLeft !== null && daysLeft < 0
              return (
                <Link
                  key={s.id}
                  href={href}
                  className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm transition-colors duration-150 hover:bg-muted/60"
                >
                  {overdue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" /> : <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{assetName}</span>
                  <Badge variant={overdue ? "destructive" : "secondary"} className="shrink-0 text-xs">
                    {daysLeft === null ? "—" : daysLeft < 0 ? `${Math.abs(daysLeft)}d late` : daysLeft === 0 ? "Today" : `${daysLeft}d`}
                  </Badge>
                </Link>
              )
            })}
          </CardContent>
        </Card>

        {/* Expiring warranties */}
        <Card className="py-5">
          <CardHeader className="px-5 pb-1">
            <CardTitle className="flex items-center justify-between text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              Expiring Warranties
              <Link
                href="/warranties"
                className="rounded-md px-2 py-1 text-xs font-medium normal-case tracking-normal text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
              >
                View all →
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-5">
            {expiringWarranties.length === 0 ? (
              <EmptyPanel icon={ShieldCheck} message="No warranties expiring in the next 60 days." />
            ) : expiringWarranties.map((w) => {
              const assetName = w.assetType === "PROPERTY" ? propMap[w.assetId] : vehMap[w.assetId]
              const href = assetHref(w.assetType, w.assetId)
              const daysLeft = w.expirationDate ? Math.ceil((new Date(w.expirationDate).getTime() - now.getTime()) / 86400000) : null
              return (
                <Link
                  key={w.id}
                  href={href}
                  className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm transition-colors duration-150 hover:bg-muted/60"
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{w.productName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{assetName}</span>
                  <Badge variant="secondary" className="shrink-0 text-xs">{daysLeft}d</Badge>
                </Link>
              )
            })}
          </CardContent>
        </Card>

        {/* Recent service */}
        <Card className="py-5">
          <CardHeader className="px-5 pb-1">
            <CardTitle className="flex items-center justify-between text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              Recent Service
              <Link
                href="/records"
                className="rounded-md px-2 py-1 text-xs font-medium normal-case tracking-normal text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
              >
                View all →
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-5">
            {recentRecords.length === 0 ? (
              <EmptyPanel icon={Wrench} message="No service records yet." />
            ) : recentRecords.map((r) => {
              const assetName = r.assetType === "PROPERTY" ? propMap[r.assetId] : vehMap[r.assetId]
              const href = assetHref(r.assetType, r.assetId)
              return (
                <Link
                  key={r.id}
                  href={href}
                  className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm transition-colors duration-150 hover:bg-muted/60"
                >
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{r.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{assetName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{new Date(r.date).toLocaleDateString()}</span>
                </Link>
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
      <Card className="border-t-2 border-t-primary py-5 transition-all duration-150 hover:-translate-y-1 hover:bg-muted hover:shadow-md">
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

function EmptyPanel({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Icon className="h-5 w-5 text-muted-foreground/40" strokeWidth={1.5} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

