import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Car, Wrench, ShieldCheck, Calendar, AlertTriangle, Clock, Refrigerator } from "lucide-react"
import { SummaryCard } from "@/components/dashboard/summary-card"
import { loadAssetIndex } from "@/lib/assets-server"
import { loadActivityIndex, mostRecentlyActive } from "@/lib/asset-activity"
import { assetHref } from "@/lib/assets"
import { scheduleDue, dueCandidateFilter, type Due } from "@/lib/maintenance-due"
import { loadVehicleMileage } from "@/lib/maintenance-due-server"

// Thumbnails per summary card.
const THUMBNAILS_LARGE = 7
// Equipment's card spans the full width of its column, so it fits many more.
const THUMBNAILS_COMPACT = 18

export default async function DashboardPage() {
  const session = await auth()

  const now = new Date()
  const in60 = new Date(now.getTime() + 60 * 86400000)

  const [
    propertyCount, vehicleCount, equipmentCount, recordCount,
    warrantyCount,
    recentRecords, maintenanceCandidates, mileage, expiringWarranties,
    properties, vehicles, equipment, assets, activity,
  ] = await Promise.all([
    prisma.property.count(),
    prisma.vehicle.count(),
    prisma.equipment.count(),
    prisma.serviceRecord.count(),
    prisma.warranty.count({ where: { expirationDate: { gt: now } } }),
    prisma.serviceRecord.findMany({ orderBy: { date: "desc" }, take: 5 }),
    // Everything that could be due either way; narrowed to what actually is,
    // and counted, below — mileage can't be filtered in SQL.
    prisma.maintenanceSchedule.findMany({
      where: dueCandidateFilter(30, now),
      orderBy: { nextDueDate: "asc" },
    }),
    loadVehicleMileage(),
    prisma.warranty.findMany({
      where: { expirationDate: { gte: now, lte: in60 } },
      orderBy: { expirationDate: "asc" },
      take: 6,
    }),
    prisma.property.findMany({ select: { id: true, name: true, imageFilename: true, updatedAt: true } }),
    prisma.vehicle.findMany({ select: { id: true, name: true, imageFilename: true, updatedAt: true } }),
    prisma.equipment.findMany({ select: { id: true, name: true, imageFilename: true, updatedAt: true } }),
    loadAssetIndex(),
    loadActivityIndex(),
  ])

  // A schedule counts as due when its own date window says so (the card's "30d"
  // headline), or when the vehicle has reached its due mileage.
  const dueMaintenance = maintenanceCandidates
    .map((s) => ({ s, due: scheduleDue(s, mileage, now) }))
    .filter(({ due }) => due.overdue || due.dueSoon || (due.daysLeft != null && due.daysLeft <= 30))

  const maintenanceCount = dueMaintenance.length

  // Rank by severity before taking the top few. Ordering by date alone would
  // hide a truck that's 300 miles past an oil change but whose due date is two
  // years out — it would be counted above and then never shown.
  const severity = (d: Due) => (d.overdue ? 0 : d.dueSoon ? 1 : 2)
  const urgentMaintenance = dueMaintenance
    .sort((a, b) =>
      severity(a.due) - severity(b.due) ||
      (a.due.daysLeft ?? Infinity) - (b.due.daysLeft ?? Infinity) ||
      a.s.id.localeCompare(b.s.id)
    )
    .slice(0, 6)

  const propertyThumbnails = mostRecentlyActive(properties, "PROPERTY", activity, THUMBNAILS_LARGE)
  const vehicleThumbnails = mostRecentlyActive(vehicles, "VEHICLE", activity, THUMBNAILS_LARGE)
  const equipmentThumbnails = mostRecentlyActive(equipment, "EQUIPMENT", activity, THUMBNAILS_COMPACT)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Welcome back{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">Here&apos;s an overview of your homes, vehicles, and equipment.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[1.3fr_1.3fr_2fr]">
        <SummaryCard icon={<Building2 />} label="Properties" value={propertyCount} href="/assets/properties" thumbnails={propertyThumbnails} />
        <SummaryCard icon={<Car />} label="Vehicles" value={vehicleCount} href="/assets/vehicles" thumbnails={vehicleThumbnails} />
        {/* The four small cards share the third column: three across the top,
            with Due and Warranties splitting one cell between them, and
            Equipment spanning the full width underneath so it has room for
            its thumbnail strip. */}
        <div className="col-span-2 grid grid-cols-2 content-start gap-4 sm:col-span-3 lg:col-span-1">
          <SummaryCard icon={<Wrench />} label="Service Records" value={recordCount} href="/records" compact />
          <div className="grid grid-cols-2 gap-4">
            <SummaryCard icon={<ShieldCheck />} label="Active Warranties" value={warrantyCount} href="/warranties" compact />
            <SummaryCard icon={<Calendar />} label="Due (30d)" value={maintenanceCount} href="/maintenance" urgent={maintenanceCount > 0} compact />
          </div>
          <div className="col-span-2">
            <SummaryCard icon={<Refrigerator />} label="Equipment" value={equipmentCount} href="/assets/equipment" thumbnails={equipmentThumbnails} compact />
          </div>
        </div>
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
            ) : urgentMaintenance.map(({ s, due }) => {
              const assetName = assets.assetName(s.assetType, s.assetId)
              const href = assetHref(s.assetType, s.assetId)
              const overdue = due.overdue
              return (
                <Link
                  key={s.id}
                  href={href}
                  className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm transition-colors duration-150 hover:bg-muted/60"
                >
                  {overdue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" /> : <Clock className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />}
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{assetName}</span>
                  <Badge variant={overdue ? "destructive" : "secondary"} className="shrink-0 text-xs">
                    {dueLabel(due)}
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
              const assetName = assets.assetName(w.assetType, w.assetId)
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
              const assetName = assets.assetName(r.assetType, r.assetId)
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

// Mileage-driven rows have no meaningful day count, so they report miles.
function dueLabel(due: Due) {
  if (due.reason === "mileage" && due.milesLeft != null) {
    return due.milesLeft < 0
      ? `${Math.abs(due.milesLeft).toLocaleString()} mi over`
      : `${due.milesLeft.toLocaleString()} mi`
  }
  const d = due.daysLeft
  if (d === null) return "—"
  return d < 0 ? `${Math.abs(d)}d late` : d === 0 ? "Today" : `${d}d`
}

function EmptyPanel({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Icon className="h-5 w-5 text-muted-foreground/40" strokeWidth={1.5} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

