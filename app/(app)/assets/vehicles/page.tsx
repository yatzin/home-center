import { prisma } from "@/lib/prisma"
import { VehicleList } from "@/components/vehicles/vehicle-list"

export default async function VehiclesPage() {
  const vehicles = await prisma.vehicle.findMany({ orderBy: { name: "asc" } })
  return (
    <div className="space-y-6">
      <VehicleList vehicles={vehicles} />
    </div>
  )
}
