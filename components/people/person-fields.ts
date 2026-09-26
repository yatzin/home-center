import { RELATIONSHIPS, toDateInput } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Person } from "@/app/generated/prisma/client"

export function personFields(providers: { id: string; name: string }[]): FieldConfig[] {
  return [
    { name: "name", label: "Name", kind: "text", required: true, placeholder: "Jordan Rivera", wide: true },
    { name: "relationship", label: "Relationship", kind: "select", required: true, options: RELATIONSHIPS },
    { name: "dateOfBirth", label: "Date of birth", kind: "date" },
    { name: "sex", label: "Sex", kind: "text", placeholder: "F" },
    { name: "bloodType", label: "Blood type", kind: "text", placeholder: "O+" },
    {
      name: "primaryProviderId", label: "Primary care provider", kind: "select", wide: true,
      options: providers.map((p) => ({ value: p.id, label: p.name })),
    },
    { name: "notes", label: "Notes", kind: "textarea", wide: true },
  ]
}

export function personInitial(person?: Person | null): FormValues {
  return {
    name: person?.name ?? "",
    relationship: person?.relationship ?? "SELF",
    dateOfBirth: toDateInput(person?.dateOfBirth),
    sex: person?.sex ?? "",
    bloodType: person?.bloodType ?? "",
    primaryProviderId: person?.primaryProviderId ?? "",
    notes: person?.notes ?? "",
  }
}
