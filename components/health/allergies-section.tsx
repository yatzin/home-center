"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { createAllergy, deleteAllergy, updateAllergy } from "@/lib/actions/health"
import { ALLERGY_SEVERITIES, labelFor } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Allergy } from "@/app/generated/prisma/client"

const FIELDS: FieldConfig[] = [
  { name: "substance", label: "Substance", kind: "text", required: true, placeholder: "Penicillin" },
  { name: "severity", label: "Severity", kind: "select", required: true, options: ALLERGY_SEVERITIES },
  { name: "reaction", label: "Reaction", kind: "text", placeholder: "Hives, swelling", wide: true },
  { name: "notes", label: "Notes", kind: "textarea", wide: true },
]

const SEVERITY_VARIANT = { MILD: "outline", MODERATE: "secondary", SEVERE: "destructive" } as const

const COLUMNS: EntityColumn<Allergy>[] = [
  { key: "substance", label: "Substance", cell: (a) => <span className="font-medium">{a.substance}</span> },
  { key: "severity", label: "Severity", cell: (a) => <Badge variant={SEVERITY_VARIANT[a.severity]}>{labelFor(ALLERGY_SEVERITIES, a.severity)}</Badge> },
  { key: "reaction", label: "Reaction", className: "text-muted-foreground", cell: (a) => a.reaction ?? "—" },
]

function initialFor(a: Allergy | null): FormValues {
  return { substance: a?.substance ?? "", severity: a?.severity ?? "MODERATE", reaction: a?.reaction ?? "", notes: a?.notes ?? "" }
}

export function AllergiesSection({ personId, allergies }: { personId: string; allergies: Allergy[] }) {
  const [editing, setEditing] = useState<Allergy | null>(null)
  const [open, setOpen] = useState(false)

  async function handleDelete(a: Allergy) {
    if (!confirm(`Delete the ${a.substance} allergy?`)) return
    const result = await deleteAllergy(a.id)
    if (result.error) { toast.error("Delete failed."); return }
    toast.success("Allergy deleted.")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{allergies.length} allerg{allergies.length === 1 ? "y" : "ies"}</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>Add Allergy</Button>
      </div>

      <EntityTable
        rows={allergies}
        columns={COLUMNS}
        describe={(a) => `${a.substance} allergy`}
        onEdit={(a) => { setEditing(a); setOpen(true) }}
        onDelete={handleDelete}
        empty="No allergies recorded."
      />

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Allergy" : "Add Allergy"}
        submitLabel={editing ? "Save Changes" : "Add Allergy"}
        successMessage={editing ? "Allergy updated." : "Allergy added."}
        fields={FIELDS}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateAllergy(editing.id, values) : createAllergy(personId, values))}
      />
    </>
  )
}
