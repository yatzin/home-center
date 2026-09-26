import { Building2, Car, HeartPulse, Refrigerator } from "lucide-react"
import type { AssetType } from "@/app/generated/prisma/client"

// Shared, client-safe helpers for the asset kinds. Anything needing the
// database lives in lib/assets-server.ts instead.

/// Tuple form of the enum, for z.enum() in forms and actions.
export const ASSET_TYPES = ["PROPERTY", "VEHICLE", "EQUIPMENT", "PERSON"] as const satisfies readonly AssetType[]

export const assetSegment: Record<AssetType, string> = {
  PROPERTY: "properties",
  VEHICLE: "vehicles",
  EQUIPMENT: "equipment",
  PERSON: "people",
}

export const assetIcon: Record<AssetType, React.ElementType> = {
  PROPERTY: Building2,
  VEHICLE: Car,
  EQUIPMENT: Refrigerator,
  PERSON: HeartPulse,
}

export const assetLabel: Record<AssetType, string> = {
  PROPERTY: "Property",
  VEHICLE: "Vehicle",
  EQUIPMENT: "Equipment",
  PERSON: "Person",
}

export function assetHref(assetType: AssetType, assetId: string) {
  return `/assets/${assetSegment[assetType]}/${assetId}`
}
