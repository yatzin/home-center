import { Building2, Car, Refrigerator } from "lucide-react"
import type { AssetType } from "@/app/generated/prisma/client"

// Shared, client-safe helpers for the three asset kinds. Anything needing the
// database lives in lib/assets-server.ts instead.

export const assetSegment: Record<AssetType, string> = {
  PROPERTY: "properties",
  VEHICLE: "vehicles",
  EQUIPMENT: "equipment",
}

export const assetIcon: Record<AssetType, React.ElementType> = {
  PROPERTY: Building2,
  VEHICLE: Car,
  EQUIPMENT: Refrigerator,
}

export const assetLabel: Record<AssetType, string> = {
  PROPERTY: "Property",
  VEHICLE: "Vehicle",
  EQUIPMENT: "Equipment",
}

export function assetHref(assetType: AssetType, assetId: string) {
  return `/assets/${assetSegment[assetType]}/${assetId}`
}
