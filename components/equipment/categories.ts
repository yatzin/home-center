import type { EquipmentCategory } from "@/app/generated/prisma/client"

export const EQUIPMENT_CATEGORIES: { value: EquipmentCategory; label: string }[] = [
  { value: "APPLIANCE", label: "Appliance" },
  { value: "HVAC", label: "Heating & Cooling" },
  { value: "WATER", label: "Water & Plumbing" },
  { value: "ELECTRONICS", label: "Electronics" },
  { value: "TOOL", label: "Tools" },
  { value: "OUTDOOR", label: "Outdoor & Lawn" },
  { value: "SECURITY", label: "Security" },
  { value: "OTHER", label: "Other" },
]

const labels = Object.fromEntries(EQUIPMENT_CATEGORIES.map((c) => [c.value, c.label])) as Record<EquipmentCategory, string>

export function categoryLabel(category: EquipmentCategory) {
  return labels[category] ?? "Other"
}
