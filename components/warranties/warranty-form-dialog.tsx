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
import { createWarranty, updateWarranty } from "@/lib/actions/warranties"
import type { Warranty } from "@/app/generated/prisma/client"

const schema = z.object({
  assetId: z.string(),
  assetType: z.enum(["PROPERTY", "VEHICLE"]),
  productName: z.string().min(1, "Product name is required"),
  purchaseDate: z.string().optional(),
  expirationDate: z.string().optional(),
  vendor: z.string().optional(),
  vendorPhone: z.string().optional(),
  vendorEmail: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  assetId: string
  assetType: "PROPERTY" | "VEHICLE"
  warranty?: Warranty | null
}

function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toISOString().split("T")[0] : ""
}

export function WarrantyFormDialog({ open, onClose, assetId, assetType, warranty }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { assetId, assetType, productName: "", purchaseDate: "", expirationDate: "", vendor: "", vendorPhone: "", vendorEmail: "", notes: "" },
  })

  useEffect(() => {
    form.reset(
      warranty
        ? { assetId, assetType, productName: warranty.productName, purchaseDate: fmt(warranty.purchaseDate), expirationDate: fmt(warranty.expirationDate), vendor: warranty.vendor ?? "", vendorPhone: warranty.vendorPhone ?? "", vendorEmail: warranty.vendorEmail ?? "", notes: warranty.notes ?? "" }
        : { assetId, assetType, productName: "", purchaseDate: "", expirationDate: "", vendor: "", vendorPhone: "", vendorEmail: "", notes: "" }
    )
  }, [warranty, open, form, assetId, assetType])

  async function onSubmit(values: FormValues) {
    const payload = values as unknown as Parameters<typeof createWarranty>[0]
    const result = warranty
      ? await updateWarranty(warranty.id, payload)
      : await createWarranty(payload)

    if (result?.error) { toast.error("Please fix the errors and try again."); return }
    toast.success(warranty ? "Warranty updated." : "Warranty added.")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{warranty ? "Edit Warranty" : "Add Warranty"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="productName" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Product / Coverage *</FormLabel>
                  <FormControl><Input placeholder="Roof — GAF Timberline" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="vendor" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Vendor / Manufacturer</FormLabel>
                  <FormControl><Input placeholder="GAF" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="purchaseDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="expirationDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiration Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="vendorPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor Phone</FormLabel>
                  <FormControl><Input type="tel" placeholder="555-555-5555" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="vendorEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor Email</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
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
                {form.formState.isSubmitting ? "Saving…" : warranty ? "Save Changes" : "Add Warranty"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
