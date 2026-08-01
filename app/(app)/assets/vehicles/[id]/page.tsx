import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calendar, Gauge, Palette, Download } from "lucide-react"
import { ServiceRecordList } from "@/components/service-records/service-record-list"
import { WarrantyList } from "@/components/warranties/warranty-list"
import { MaintenanceList } from "@/components/maintenance/maintenance-list"

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const vehicle = await prisma.vehicle.findUnique({ where: { id } })
  if (!vehicle) notFound()

  const [serviceRecords, warranties, maintenanceSchedules] = await Promise.all([
    prisma.serviceRecord.findMany({ where: { assetId: id, assetType: "VEHICLE" }, include: { attachments: true }, orderBy: { date: "desc" } }),
    prisma.warranty.findMany({ where: { assetId: id, assetType: "VEHICLE" }, include: { attachments: true }, orderBy: { expirationDate: "asc" } }),
    prisma.maintenanceSchedule.findMany({ where: { assetId: id, assetType: "VEHICLE", isActive: true }, orderBy: { nextDueDate: "asc" } }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{vehicle.name}</h1>
            <Badge variant="secondary">{vehicle.year} {vehicle.make} {vehicle.model}</Badge>
          </div>
          {vehicle.vin && <p className="font-mono text-xs text-muted-foreground mt-1">VIN: {vehicle.vin}</p>}
        </div>
        <a
          href={`/api/assets/vehicles/${id}/download`}
          download
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" /> Download all files
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {vehicle.currentMileage != null && <Stat icon={Gauge} label="Mileage" value={`${vehicle.currentMileage.toLocaleString()} mi`} />}
        {vehicle.color && <Stat icon={Palette} label="Color" value={vehicle.color} />}
        {vehicle.purchaseDate && <Stat icon={Calendar} label="Purchased" value={new Date(vehicle.purchaseDate).toLocaleDateString()} />}
      </div>

      {vehicle.notes && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground whitespace-pre-wrap">
          {vehicle.notes}
        </div>
      )}

      <Tabs defaultValue="service">
        <TabsList>
          <TabsTrigger value="service">Service ({serviceRecords.length})</TabsTrigger>
          <TabsTrigger value="warranties">Warranties ({warranties.length})</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance ({maintenanceSchedules.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="service" className="mt-4">
          <ServiceRecordList records={serviceRecords} assetId={id} assetType="VEHICLE" />
        </TabsContent>
        <TabsContent value="warranties" className="mt-4">
          <WarrantyList warranties={warranties} assetId={id} assetType="VEHICLE" />
        </TabsContent>
        <TabsContent value="maintenance" className="mt-4">
          <MaintenanceList schedules={maintenanceSchedules} assetId={id} assetType="VEHICLE" currentMileage={vehicle.currentMileage} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  )
}
