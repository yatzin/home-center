// Spending on a property includes spending on the equipment installed there —
// "what did the house cost us" means the furnace too. Equipment rows are
// re-attributed to their property, keeping the equipment id for display.

export function rollUpToProperty<T extends { assetType: string; assetId: string }>(
  rows: T[],
  equipmentProperty: Map<string, string>,
  wanted: (propertyId: string) => boolean
): (T & { viaEquipmentId?: string })[] {
  return rows.map((row) => {
    if (row.assetType !== "EQUIPMENT") return row
    const propertyId = equipmentProperty.get(row.assetId)
    return propertyId && wanted(propertyId)
      ? { ...row, assetType: "PROPERTY", assetId: propertyId, viaEquipmentId: row.assetId }
      : row
  })
}
