import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { VehicleList } from "@/components/vehicles/vehicle-list"
import { assetViewCookieName, parseAssetView } from "@/lib/asset-view"

export default async function VehiclesPage() {
  const [vehicles, cookieStore] = await Promise.all([
    prisma.vehicle.findMany({ orderBy: { name: "asc" } }),
    cookies(),
  ])

  const initialView = parseAssetView(cookieStore.get(assetViewCookieName("vehicles"))?.value)

  return (
    <div className="space-y-6">
      <VehicleList vehicles={vehicles} initialView={initialView} />
    </div>
  )
}
