"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createServiceRecord, updateServiceRecord } from "@/lib/actions/service-records"
import { deleteAttachment } from "@/lib/actions/attachments"
import { meterUnitNoun } from "@/lib/maintenance-due"
import { ASSET_CATEGORIES } from "@/lib/costs"
import { ASSET_TYPES } from "@/lib/assets"
import { Paperclip, Upload, X, Trash2, FileText, Image } from "lucide-react"
import type { Attachment, ServiceRecord, MeterUnit, AssetType } from "@/app/generated/prisma/client"

// Base UI Select has no empty-string option, so "no category" needs a sentinel.
const NO_CATEGORY = "__none__"

const schema = z.object({
  assetId: z.string(),
  assetType: z.enum(ASSET_TYPES),
  date: z.string().min(1, "Date is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  vendor: z.string().optional(),
  cost: z.string().optional(),
  category: z.string().optional(),
  mileageAtService: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  assetId: string
  assetType: AssetType
  record?: ServiceRecord | null
  attachments?: Attachment[]
  onAttachmentDeleted?: (recordId: string, attachmentId: string) => void
  /** When set (property view), shows a target picker: this property or one of its equipment. */
  equipmentOptions?: { id: string; name: string }[]
  propertyName?: string
  /** Vehicle's odometer unit, for the mileage field's label. Defaults to miles. */
  meterUnit?: MeterUnit
}

function targetKey(assetType: AssetType, assetId: string) {
  return `${assetType}:${assetId}`
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image
  return FileText
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ServiceRecordFormDialog({ open, onClose, assetId, assetType, record, attachments: initialAttachments = [], onAttachmentDeleted, equipmentOptions, propertyName = "This property", meterUnit = "MILES" }: Props) {
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(null)
  const [filePickerOpen, setFilePickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function openFilePicker() {
    // The native OS file picker moves focus outside the dialog's DOM, which would
    // otherwise trigger Base UI's modal focus-out dismissal and close the dialog
    // before the file selection is even processed.
    setFilePickerOpen(true)
    window.addEventListener("focus", () => setFilePickerOpen(false), { once: true })
    inputRef.current?.click()
  }

  const existingAttachments = initialAttachments.filter((a) => !removedIds.has(a.id))

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      assetId, assetType,
      date: new Date().toISOString().split("T")[0],
      title: "", description: "", vendor: "", cost: "", category: NO_CATEGORY, mileageAtService: "",
    },
  })

  useEffect(() => {
    if (record) {
      form.reset({
        assetId: record.assetId, assetType: record.assetType,
        date: new Date(record.date).toISOString().split("T")[0],
        title: record.title,
        description: record.description ?? "",
        vendor: record.vendor ?? "",
        cost: record.cost?.toString() ?? "",
        category: record.category ?? NO_CATEGORY,
        mileageAtService: record.mileageAtService?.toString() ?? "",
      })
    } else {
      form.reset({ assetId, assetType, date: new Date().toISOString().split("T")[0], title: "", description: "", vendor: "", cost: "", category: NO_CATEGORY, mileageAtService: "" })
    }
  }, [record, open, form, assetId, assetType])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    setStagedFiles((prev) => [...prev, ...Array.from(files)])
    if (inputRef.current) inputRef.current.value = ""
  }

  function removeStagedFile(index: number) {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleDeleteExisting(attachment: Attachment) {
    if (!confirm(`Remove "${attachment.originalName}"?`)) return
    if (!record) return
    const result = await deleteAttachment(attachment.id)
    if (result?.error) { toast.error(result.error); return }
    setRemovedIds((prev) => new Set(prev).add(attachment.id))
    onAttachmentDeleted?.(record.id, attachment.id)
    toast.success("Attachment removed.")
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      ...values,
      category: values.category === NO_CATEGORY ? "" : values.category,
    } as unknown as Parameters<typeof createServiceRecord>[0]
    const existingId = record?.id ?? createdRecordId
    const result = existingId
      ? await updateServiceRecord(existingId, payload)
      : await createServiceRecord(payload)

    if (result?.error) { toast.error("Please fix the errors and try again."); return }

    const recordId = existingId ?? (result as { success: boolean; id?: string }).id
    if (recordId && !existingId) setCreatedRecordId(recordId)

    if (stagedFiles.length > 0 && recordId) {
      const uploads = await Promise.allSettled(
        stagedFiles.map(async (file) => {
          const formData = new FormData()
          formData.append("file", file)
          formData.append("recordId", recordId)
          formData.append("recordType", "SERVICE")
          const res = await fetch("/api/uploads", { method: "POST", body: formData })
          if (!res.ok) {
            const json = await res.json().catch(() => ({}))
            throw new Error(json.error ?? `Failed to upload "${file.name}"`)
          }
          return file
        })
      )

      const succeeded = new Set(
        uploads.flatMap((u) => (u.status === "fulfilled" ? [u.value] : []))
      )
      setStagedFiles((prev) => prev.filter((f) => !succeeded.has(f)))

      const firstFailure = uploads.find((u): u is PromiseRejectedResult => u.status === "rejected")
      if (firstFailure) {
        toast.error(firstFailure.reason instanceof Error ? firstFailure.reason.message : "Some files failed to upload.")
        return
      }
    }

    toast.success(record ? "Record updated." : "Service record added.")
    router.refresh()
    handleClose()
  }

  function handleClose() {
    setStagedFiles([])
    setRemovedIds(new Set())
    setCreatedRecordId(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()} disablePointerDismissal={filePickerOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? "Edit Service Record" : "Add Service Record"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {equipmentOptions && equipmentOptions.length > 0 && (
              <FormItem>
                <FormLabel>For</FormLabel>
                <Select
                  value={targetKey(form.watch("assetType"), form.watch("assetId"))}
                  onValueChange={(value) => {
                    if (!value) return
                    const [type, ...rest] = value.split(":")
                    form.setValue("assetType", type as FormValues["assetType"])
                    form.setValue("assetId", rest.join(":"))
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) => v === targetKey("PROPERTY", assetId) ? propertyName : equipmentOptions.find((e) => targetKey("EQUIPMENT", e.id) === v)?.name ?? v}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={targetKey("PROPERTY", assetId)}>{propertyName}</SelectItem>
                    {equipmentOptions.map((e) => (
                      <SelectItem key={e.id} value={targetKey("EQUIPMENT", e.id)}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Title *</FormLabel>
                  <FormControl><Input placeholder="Oil Change" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="vendor" render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor / Shop</FormLabel>
                  <FormControl><Input placeholder="Jiffy Lube" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="cost" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cost ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="89.99" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v ?? NO_CATEGORY)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Uncategorized">
                          {(v: string) => ASSET_CATEGORIES.find((c) => c.value === v)?.label ?? "Uncategorized"}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
                      {ASSET_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {assetType === "VEHICLE" && (
                <FormField control={form.control} name="mileageAtService" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{meterUnitNoun(meterUnit)} at Service</FormLabel>
                    <FormControl><Input type="number" placeholder={meterUnit === "HOURS" ? "1250" : "45230"} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5" />
                  Attachments {(existingAttachments.length + stagedFiles.length) > 0 && <span className="inline-flex items-center justify-center rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium">{existingAttachments.length + stagedFiles.length}</span>}
                </div>
                <label>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openFilePicker}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Attach file
                  </Button>
                </label>
              </div>

              {existingAttachments.length > 0 && (
                <ul className="space-y-1">
                  {existingAttachments.map((a) => {
                    const Icon = fileIcon(a.mimeType)
                    const href = `/api/files/service/${record?.id}/${a.filename}`
                    return (
                      <li key={a.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 truncate hover:underline"
                        >
                          {a.originalName}
                        </a>
                        <span className="text-xs text-muted-foreground shrink-0">{formatBytes(a.sizeBytes)}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteExisting(a)}
                          aria-label={`Remove "${a.originalName}"`}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {stagedFiles.length > 0 && (
                <ul className="space-y-1">
                  {stagedFiles.map((file, index) => {
                    const Icon = fileIcon(file.type)
                    return (
                      <li key={index} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeStagedFile(index)}
                          aria-label={`Remove "${file.name}"`}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : record ? "Save Changes" : "Add Record"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
