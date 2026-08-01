"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { createServiceRecord, updateServiceRecord } from "@/lib/actions/service-records"
import type { ServiceRecord } from "@/app/generated/prisma/client"

const schema = z.object({
  assetId: z.string(),
  assetType: z.enum(["PROPERTY", "VEHICLE"]),
  date: z.string().min(1, "Date is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  vendor: z.string().optional(),
  cost: z.string().optional(),
  mileageAtService: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  assetId: string
  assetType: "PROPERTY" | "VEHICLE"
  record?: ServiceRecord | null
}

export function ServiceRecordFormDialog({ open, onClose, assetId, assetType, record }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      assetId, assetType,
      date: new Date().toISOString().split("T")[0],
      title: "", description: "", vendor: "", cost: "", mileageAtService: "",
    },
  })

  useEffect(() => {
    if (record) {
      form.reset({
        assetId, assetType,
        date: new Date(record.date).toISOString().split("T")[0],
        title: record.title,
        description: record.description ?? "",
        vendor: record.vendor ?? "",
        cost: record.cost?.toString() ?? "",
        mileageAtService: record.mileageAtService?.toString() ?? "",
      })
    } else {
      form.reset({ assetId, assetType, date: new Date().toISOString().split("T")[0], title: "", description: "", vendor: "", cost: "", mileageAtService: "" })
    }
  }, [record, open, form, assetId, assetType])

  async function onSubmit(values: FormValues) {
    const payload = values as unknown as Parameters<typeof createServiceRecord>[0]
    const result = record
      ? await updateServiceRecord(record.id, payload)
      : await createServiceRecord(payload)

    if (result?.error) { toast.error("Please fix the errors and try again."); return }
    toast.success(record ? "Record updated." : "Service record added.")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{record ? "Edit Service Record" : "Add Service Record"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

              {assetType === "VEHICLE" && (
                <FormField control={form.control} name="mileageAtService" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mileage at Service</FormLabel>
                    <FormControl><Input type="number" placeholder="45230" {...field} /></FormControl>
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
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
