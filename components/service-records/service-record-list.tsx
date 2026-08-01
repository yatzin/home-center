"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, Pencil, Trash2, Wrench } from "lucide-react"
import { deleteServiceRecord } from "@/lib/actions/service-records"
import { ServiceRecordFormDialog } from "./service-record-form-dialog"
import { AttachmentList } from "@/components/attachments/attachment-list"
import type { Attachment, ServiceRecord } from "@/app/generated/prisma/client"

type RecordWithAttachments = ServiceRecord & { attachments: Attachment[] }

interface Props {
  records: RecordWithAttachments[]
  assetId: string
  assetType: "PROPERTY" | "VEHICLE"
}

export function ServiceRecordList({ records, assetId, assetType }: Props) {
  const [editing, setEditing] = useState<ServiceRecord | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function handleDelete(record: ServiceRecord) {
    if (!confirm(`Delete "${record.title}"?`)) return
    await deleteServiceRecord(record.id, record.assetType, record.assetId)
    toast.success("Record deleted.")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{records.length} record{records.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>Add Service Record</Button>
      </div>

      {records.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No service records yet.
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <Collapsible key={record.id}>
              <div className="rounded-lg border bg-card">
                <div className="flex items-start gap-3 p-3">
                  <Wrench className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{record.title}</span>
                      <span className="text-xs text-muted-foreground">{new Date(record.date).toLocaleDateString()}</span>
                      {record.cost != null && <Badge variant="secondary">${record.cost.toLocaleString()}</Badge>}
                      {record.mileageAtService != null && (
                        <Badge variant="outline">{record.mileageAtService.toLocaleString()} mi</Badge>
                      )}
                      {record.attachments.length > 0 && (
                        <Badge variant="outline">{record.attachments.length} file{record.attachments.length !== 1 ? "s" : ""}</Badge>
                      )}
                    </div>
                    {record.vendor && <p className="text-xs text-muted-foreground mt-0.5">{record.vendor}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setEditing(record); setDialogOpen(true) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(record)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <CollapsibleTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </CollapsibleTrigger>
                  </div>
                </div>

                <CollapsibleContent>
                  <div className="border-t px-3 py-3 space-y-3">
                    {record.description && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{record.description}</p>
                    )}
                    <AttachmentList
                      recordId={record.id}
                      recordType="SERVICE"
                      attachments={record.attachments}
                    />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      )}

      <ServiceRecordFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        assetId={assetId}
        assetType={assetType}
        record={editing}
      />
    </>
  )
}
