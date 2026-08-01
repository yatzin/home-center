import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MapPin, Calendar, DollarSign, Maximize, Download } from "lucide-react"
import { ServiceRecordList } from "@/components/service-records/service-record-list"
import { WarrantyList } from "@/components/warranties/warranty-list"
import { MaintenanceList } from "@/components/maintenance/maintenance-list"
import { AssetImageUploader } from "@/components/asset-image-uploader"

const typeLabel: Record<string, string> = {
  HOUSE: "House", CONDO: "Condo", TOWNHOUSE: "Townhouse", LOT: "Lot / Land", OTHER: "Other",
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const property = await prisma.property.findUnique({ where: { id } })
  if (!property) notFound()

  const [serviceRecords, warranties, maintenanceSchedules] = await Promise.all([
    prisma.serviceRecord.findMany({ where: { assetId: id, assetType: "PROPERTY" }, include: { attachments: true }, orderBy: { date: "desc" } }),
    prisma.warranty.findMany({ where: { assetId: id, assetType: "PROPERTY" }, include: { attachments: true }, orderBy: { expirationDate: "asc" } }),
    prisma.maintenanceSchedule.findMany({ where: { assetId: id, assetType: "PROPERTY", isActive: true }, orderBy: { nextDueDate: "asc" } }),
  ])

  return (
    <div className="space-y-6">
      <AssetImageUploader assetType="PROPERTY" assetId={id} imageFilename={property.imageFilename} alt={property.name} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{property.name}</h1>
            <Badge variant="secondary">{typeLabel[property.type]}</Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {property.address}
          </div>
        </div>
        <a
          href={`/api/assets/properties/${id}/download`}
          download
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" /> Download all files
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {property.yearBuilt && <Stat icon={Calendar} label="Year Built" value={property.yearBuilt.toString()} />}
        {property.sqFt && <Stat icon={Maximize} label="Sq Footage" value={`${property.sqFt.toLocaleString()} ft²`} />}
        {property.purchasePrice && <Stat icon={DollarSign} label="Purchase Price" value={`$${property.purchasePrice.toLocaleString()}`} />}
        {property.purchaseDate && <Stat icon={Calendar} label="Purchased" value={new Date(property.purchaseDate).toLocaleDateString()} />}
      </div>

      {property.notes && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground whitespace-pre-wrap">
          {property.notes}
        </div>
      )}

      <Tabs defaultValue="service">
        <TabsList>
          <TabsTrigger value="service">Service ({serviceRecords.length})</TabsTrigger>
          <TabsTrigger value="warranties">Warranties ({warranties.length})</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance ({maintenanceSchedules.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="service" className="mt-4">
          <ServiceRecordList records={serviceRecords} assetId={id} assetType="PROPERTY" />
        </TabsContent>
        <TabsContent value="warranties" className="mt-4">
          <WarrantyList warranties={warranties} assetId={id} assetType="PROPERTY" />
        </TabsContent>
        <TabsContent value="maintenance" className="mt-4">
          <MaintenanceList schedules={maintenanceSchedules} assetId={id} assetType="PROPERTY" />
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
