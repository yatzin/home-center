import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { PropertyList } from "@/components/properties/property-list"
import { assetViewCookieName, parseAssetView } from "@/lib/asset-view"

export default async function PropertiesPage() {
  const [properties, cookieStore] = await Promise.all([
    prisma.property.findMany({ orderBy: { name: "asc" } }),
    cookies(),
  ])

  const initialView = parseAssetView(cookieStore.get(assetViewCookieName("properties"))?.value)

  return (
    <div className="space-y-6">
      <PropertyList properties={properties} initialView={initialView} />
    </div>
  )
}
