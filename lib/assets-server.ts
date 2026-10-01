import { prisma } from "@/lib/prisma"
import type { AssetType } from "@/app/generated/prisma/client"

// Loads every asset's display name so cross-asset pages (records, warranties,
// maintenance, dashboard) can resolve `assetType` + `assetId` without repeating
// a per-type ternary at each call site.
export async function loadAssetIndex() {
  const [properties, vehicles, equipment, people] = await Promise.all([
    prisma.property.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({ select: { id: true, name: true, currentMileage: true }, orderBy: { name: "asc" } }),
    prisma.equipment.findMany({ select: { id: true, name: true, propertyId: true }, orderBy: { name: "asc" } }),
    prisma.person.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])

  const names: Record<AssetType, Record<string, string>> = {
    PROPERTY: Object.fromEntries(properties.map((p) => [p.id, p.name])),
    VEHICLE: Object.fromEntries(vehicles.map((v) => [v.id, v.name])),
    EQUIPMENT: Object.fromEntries(equipment.map((e) => [e.id, e.name])),
    PERSON: Object.fromEntries(people.map((p) => [p.id, p.name])),
  }

  const mileage: Record<string, number | null> = Object.fromEntries(
    vehicles.map((v) => [v.id, v.currentMileage])
  )

  const options = [...properties, ...vehicles, ...equipment, ...people].map((a) => ({ value: a.id, label: a.name }))

  const equipmentProperty = new Map(
    equipment.filter((e) => e.propertyId).map((e) => [e.id, e.propertyId!])
  )

  return {
    names,
    mileage,
    equipmentProperty,
    options,
    assetName: (assetType: AssetType, assetId: string): string | undefined => names[assetType]?.[assetId],
  }
}
