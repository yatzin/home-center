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
import { createVehicle, updateVehicle } from "@/lib/actions/vehicles"
import type { Vehicle } from "@/app/generated/prisma/client"

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.string().min(1, "Year is required"),
  vin: z.string().optional(),
  color: z.string().optional(),
  purchaseDate: z.string().optional(),
  currentMileage: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  vehicle?: Vehicle | null
}

export function VehicleFormDialog({ open, onClose, vehicle }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", make: "", model: "", year: new Date().getFullYear().toString(),
      vin: "", color: "", purchaseDate: "", currentMileage: "", notes: "",
    },
  })

  useEffect(() => {
    if (vehicle) {
      form.reset({
        name: vehicle.name,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year.toString(),
        vin: vehicle.vin ?? "",
        color: vehicle.color ?? "",
        purchaseDate: vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toISOString().split("T")[0] : "",
        currentMileage: vehicle.currentMileage?.toString() ?? "",
        notes: vehicle.notes ?? "",
      })
    } else {
      form.reset({
        name: "", make: "", model: "", year: new Date().getFullYear().toString(),
        vin: "", color: "", purchaseDate: "", currentMileage: "", notes: "",
      })
    }
  }, [vehicle, open, form])

  async function onSubmit(values: FormValues) {
    const result = vehicle
      ? await updateVehicle(vehicle.id, values as unknown as Parameters<typeof updateVehicle>[1])
      : await createVehicle(values as unknown as Parameters<typeof createVehicle>[0])

    if (result?.error) {
      toast.error("Please fix the errors and try again.")
      return
    }
    toast.success(vehicle ? "Vehicle updated." : "Vehicle added.")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Nickname *</FormLabel>
                  <FormControl><Input placeholder="Family SUV" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="year" render={({ field }) => (
                <FormItem>
                  <FormLabel>Year *</FormLabel>
                  <FormControl><Input type="number" placeholder="2022" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="make" render={({ field }) => (
                <FormItem>
                  <FormLabel>Make *</FormLabel>
                  <FormControl><Input placeholder="Toyota" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="model" render={({ field }) => (
                <FormItem>
                  <FormLabel>Model *</FormLabel>
                  <FormControl><Input placeholder="RAV4" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="color" render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl><Input placeholder="Silver" {...field} /></FormControl>
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

              <FormField control={form.control} name="currentMileage" render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Mileage</FormLabel>
                  <FormControl><Input type="number" placeholder="45000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="vin" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>VIN</FormLabel>
                  <FormControl><Input placeholder="1HGCM82633A123456" className="font-mono text-sm" {...field} /></FormControl>
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
                {form.formState.isSubmitting ? "Saving…" : vehicle ? "Save Changes" : "Add Vehicle"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
