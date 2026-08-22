import { prisma } from "@/lib/prisma"
import type { AssetType } from "@/app/generated/prisma/client"

// Loads every asset's display name so cross-asset pages (records, warranties,
// maintenance, dashboard) can resolve `assetType` + `assetId` without repeating
// a per-type ternary at each call site.
export async function loadAssetIndex() {
  const [properties, vehicles, equipment] = await Promise.all([
    prisma.property.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({ select: { id: true, name: true, currentMileage: true }, orderBy: { name: "asc" } }),
    prisma.equipment.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])

  const names: Record<AssetType, Record<string, string>> = {
    PROPERTY: Object.fromEntries(properties.map((p) => [p.id, p.name])),
    VEHICLE: Object.fromEntries(vehicles.map((v) => [v.id, v.name])),
    EQUIPMENT: Object.fromEntries(equipment.map((e) => [e.id, e.name])),
  }

  const mileage: Record<string, number | null> = Object.fromEntries(
    vehicles.map((v) => [v.id, v.currentMileage])
  )

  const options = [...properties, ...vehicles, ...equipment].map((a) => ({ value: a.id, label: a.name }))

  return {
    names,
    mileage,
    options,
    assetName: (assetType: AssetType, assetId: string): string | undefined => names[assetType]?.[assetId],
  }
}
