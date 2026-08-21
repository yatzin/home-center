"use client"

import { Fragment, useCallback, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ChevronDown, Pencil, Trash2 } from "lucide-react"
import { deleteServiceRecord } from "@/lib/actions/service-records"
import { ServiceRecordFormDialog } from "./service-record-form-dialog"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { AttachmentCount } from "@/components/attachments/attachment-count"
import type { Attachment, ServiceRecord } from "@/app/generated/prisma/client"

type RecordWithAttachments = ServiceRecord & { attachments: Attachment[] }

interface Props {
  records: RecordWithAttachments[]
  assetId: string
  assetType: "PROPERTY" | "VEHICLE"
}

export function ServiceRecordList({ records: initialRecords, assetId, assetType }: Props) {
  const [records, setRecords] = useState(initialRecords)
  const [prevInitialRecords, setPrevInitialRecords] = useState(initialRecords)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (initialRecords !== prevInitialRecords) {
    setPrevInitialRecords(initialRecords)
    setRecords(initialRecords)
  }

  const editing = editingId ? records.find((r) => r.id === editingId) ?? null : null

  const handleAttachmentDeleted = useCallback((recordId: string, attachmentId: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId
          ? { ...r, attachments: r.attachments.filter((a) => a.id !== attachmentId) }
          : r
      )
    )
  }, [])

  async function handleDelete(record: ServiceRecord) {
    if (!confirm(`Delete "${record.title}"?`)) return
    await deleteServiceRecord(record.id, record.assetType, record.assetId)
    toast.success("Record deleted.")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{records.length} record{records.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={() => { setEditingId(null); setDialogOpen(true) }}>Add Service Record</Button>
      </div>

      {records.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No service records yet.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Cost</TableHead>
                {assetType === "VEHICLE" && <TableHead>Mileage</TableHead>}
                <TableHead>Files</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => {
                const expanded = expandedId === record.id
                return (
                  <Fragment key={record.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => { setEditingId(record.id); setDialogOpen(true) }}
                    >
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {new Date(record.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{record.title}</div>
                        {record.vendor && <div className="text-xs text-muted-foreground">{record.vendor}</div>}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        {record.description ? (
                          <Tooltip>
                            <TooltipTrigger className="block w-full truncate border-0 bg-transparent p-0 text-left text-muted-foreground">
                              {record.description}
                            </TooltipTrigger>
                            <TooltipContent align="start" className="whitespace-pre-wrap">{record.description}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {record.cost != null ? `$${record.cost.toLocaleString()}` : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      {assetType === "VEHICLE" && (
                        <TableCell className="whitespace-nowrap">
                          {record.mileageAtService != null ? `${record.mileageAtService.toLocaleString()} mi` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <AttachmentCount
                          attachments={record.attachments}
                          onClick={() => setExpandedId(expanded ? null : record.id)}
                        />
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => { setEditingId(record.id); setDialogOpen(true) }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(record)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setExpandedId(expanded ? null : record.id)}>
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={assetType === "VEHICLE" ? 7 : 6} className="bg-muted/30 whitespace-normal">
                          <AttachmentList
                            recordId={record.id}
                            recordType="SERVICE"
                            attachments={record.attachments}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ServiceRecordFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        assetId={assetId}
        assetType={assetType}
        record={editing}
        attachments={editing?.attachments ?? []}
        onAttachmentDeleted={handleAttachmentDeleted}
      />
    </>
  )
}
