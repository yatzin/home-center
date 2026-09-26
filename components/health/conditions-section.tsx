"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { AttachmentCount } from "@/components/attachments/attachment-count"
import { createCondition, deleteCondition, updateCondition } from "@/lib/actions/health"
import { CONDITION_STATUSES, formatDay, labelFor, toDateInput } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Attachment, HealthCondition } from "@/app/generated/prisma/client"

export type ConditionRow = HealthCondition & { attachments: Attachment[]; provider: { name: string } | null }

const STATUS_VARIANT = { ACTIVE: "destructive", MANAGED: "secondary", RESOLVED: "outline" } as const

const COLUMNS: EntityColumn<ConditionRow>[] = [
  { key: "name", label: "Condition", cell: (c) => <span className="font-medium">{c.name}</span> },
  { key: "status", label: "Status", cell: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{labelFor(CONDITION_STATUSES, c.status)}</Badge> },
  { key: "diagnosed", label: "Diagnosed", className: "whitespace-nowrap text-muted-foreground", cell: (c) => formatDay(c.diagnosedDate) },
  { key: "provider", label: "Provider", className: "text-muted-foreground", cell: (c) => c.provider?.name ?? "—" },
  { key: "files", label: "Files", cell: (c) => <AttachmentCount attachments={c.attachments} /> },
]

function initialFor(c: ConditionRow | null): FormValues {
  return {
    name: c?.name ?? "",
    status: c?.status ?? "ACTIVE",
    providerId: c?.providerId ?? "",
    diagnosedDate: toDateInput(c?.diagnosedDate),
    resolvedDate: toDateInput(c?.resolvedDate),
    notes: c?.notes ?? "",
  }
}

interface Props {
  personId: string
  conditions: ConditionRow[]
  providers: { id: string; name: string }[]
}

export function ConditionsSection({ personId, conditions, providers }: Props) {
  const [editing, setEditing] = useState<ConditionRow | null>(null)
  const [open, setOpen] = useState(false)

  const fields: FieldConfig[] = [
    { name: "name", label: "Condition", kind: "text", required: true, placeholder: "Type 2 diabetes", wide: true },
    { name: "status", label: "Status", kind: "select", required: true, options: CONDITION_STATUSES },
    { name: "providerId", label: "Treating provider", kind: "select", options: providers.map((p) => ({ value: p.id, label: p.name })) },
    { name: "diagnosedDate", label: "Diagnosed", kind: "date" },
    { name: "resolvedDate", label: "Resolved", kind: "date" },
    { name: "notes", label: "Notes", kind: "textarea", wide: true },
  ]

  async function handleDelete(c: ConditionRow) {
    if (!confirm(`Delete "${c.name}" and its files? Visits and medications linked to it are kept.`)) return
    const result = await deleteCondition(c.id)
    if (result.error) { toast.error("Delete failed."); return }
    toast.success("Condition deleted.")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{conditions.length} condition{conditions.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>Add Condition</Button>
      </div>

      <EntityTable
        rows={conditions}
        columns={COLUMNS}
        describe={(c) => c.name}
        onEdit={(c) => { setEditing(c); setOpen(true) }}
        onDelete={handleDelete}
        empty="No conditions recorded."
        renderExpanded={(c) => (
          <div className="space-y-3">
            {c.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{c.notes}</p>}
            {c.resolvedDate && <p className="text-sm text-muted-foreground">Resolved {formatDay(c.resolvedDate)}</p>}
            <AttachmentList recordId={c.id} recordType="CONDITION" attachments={c.attachments} />
          </div>
        )}
      />

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Condition" : "Add Condition"}
        submitLabel={editing ? "Save Changes" : "Add Condition"}
        successMessage={editing ? "Condition updated." : "Condition added. Expand its row to attach files."}
        fields={fields}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateCondition(editing.id, values) : createCondition(personId, values))}
      />
    </>
  )
}
