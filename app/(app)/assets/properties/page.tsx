import { prisma } from "@/lib/prisma"
import { PropertyList } from "@/components/properties/property-list"

export default async function PropertiesPage() {
  const properties = await prisma.property.findMany({ orderBy: { name: "asc" } })
  return (
    <div className="space-y-6">
      <PropertyList properties={properties} />
    </div>
  )
}
