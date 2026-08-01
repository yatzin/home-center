"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, Pencil, Trash2, ShieldCheck } from "lucide-react"
import { deleteWarranty } from "@/lib/actions/warranties"
import { WarrantyFormDialog } from "./warranty-form-dialog"
import { AttachmentList } from "@/components/attachments/attachment-list"
import type { Attachment, Warranty } from "@/app/generated/prisma/client"

type WarrantyWithAttachments = Warranty & { attachments: Attachment[] }

interface Props {
  warranties: WarrantyWithAttachments[]
  assetId: string
  assetType: "PROPERTY" | "VEHICLE"
}

function warrantyStatus(expirationDate: Date | null) {
  if (!expirationDate) return null
  const now = new Date()
  const exp = new Date(expirationDate)
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return { label: "Expired", variant: "destructive" as const }
  if (daysLeft <= 60) return { label: `Expires in ${daysLeft}d`, variant: "secondary" as const }
  return { label: `Expires ${exp.toLocaleDateString()}`, variant: "outline" as const }
}

export function WarrantyList({ warranties, assetId, assetType }: Props) {
  const [editing, setEditing] = useState<Warranty | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function handleDelete(w: Warranty) {
    if (!confirm(`Delete warranty for "${w.productName}"?`)) return
    await deleteWarranty(w.id, w.assetType, w.assetId)
    toast.success("Warranty deleted.")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{warranties.length} warrant{warranties.length !== 1 ? "ies" : "y"}</p>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>Add Warranty</Button>
      </div>

      {warranties.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No warranties yet.
        </div>
      ) : (
        <div className="space-y-2">
          {warranties.map((w) => {
            const status = warrantyStatus(w.expirationDate)
            return (
              <Collapsible key={w.id}>
                <div className="rounded-lg border bg-card">
                  <div className="flex items-start gap-3 p-3">
                    <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{w.productName}</span>
                        {status && <Badge variant={status.variant}>{status.label}</Badge>}
                        {w.attachments.length > 0 && (
                          <Badge variant="outline">{w.attachments.length} file{w.attachments.length !== 1 ? "s" : ""}</Badge>
                        )}
                      </div>
                      {w.vendor && <p className="text-xs text-muted-foreground mt-0.5">{w.vendor}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditing(w); setDialogOpen(true) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(w)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <CollapsibleTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </CollapsibleTrigger>
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="border-t px-3 py-3 space-y-3 text-sm text-muted-foreground">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {w.purchaseDate && <span>Purchased: {new Date(w.purchaseDate).toLocaleDateString()}</span>}
                        {w.expirationDate && <span>Expires: {new Date(w.expirationDate).toLocaleDateString()}</span>}
                        {w.vendorPhone && <span>Phone: {w.vendorPhone}</span>}
                        {w.vendorEmail && <span>Email: {w.vendorEmail}</span>}
                      </div>
                      {w.notes && <p className="whitespace-pre-wrap">{w.notes}</p>}
                      <AttachmentList recordId={w.id} recordType="WARRANTY" attachments={w.attachments} />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )
          })}
        </div>
      )}

      <WarrantyFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        assetId={assetId}
        assetType={assetType}
        warranty={editing}
      />
    </>
  )
}
