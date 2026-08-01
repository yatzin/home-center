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
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form"
import { createMaintenanceSchedule, updateMaintenanceSchedule } from "@/lib/actions/maintenance"
import type { MaintenanceSchedule } from "@/app/generated/prisma/client"

const schema = z.object({
  assetId: z.string(),
  assetType: z.enum(["PROPERTY", "VEHICLE"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  intervalDays: z.string().optional(),
  intervalMiles: z.string().optional(),
  nextDueDate: z.string().optional(),
  nextDueMileage: z.string().optional(),
  reminderDaysBefore: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  assetId: string
  assetType: "PROPERTY" | "VEHICLE"
  schedule?: MaintenanceSchedule | null
}

export function MaintenanceFormDialog({ open, onClose, assetId, assetType, schedule }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { assetId, assetType, title: "", description: "", intervalDays: "", intervalMiles: "", nextDueDate: "", nextDueMileage: "", reminderDaysBefore: "14" },
  })

  useEffect(() => {
    form.reset(schedule ? {
      assetId, assetType,
      title: schedule.title,
      description: schedule.description ?? "",
      intervalDays: schedule.intervalDays?.toString() ?? "",
      intervalMiles: schedule.intervalMiles?.toString() ?? "",
      nextDueDate: schedule.nextDueDate ? new Date(schedule.nextDueDate).toISOString().split("T")[0] : "",
      nextDueMileage: schedule.nextDueMileage?.toString() ?? "",
      reminderDaysBefore: schedule.reminderDaysBefore.toString(),
    } : {
      assetId, assetType, title: "", description: "", intervalDays: "", intervalMiles: "", nextDueDate: "", nextDueMileage: "", reminderDaysBefore: "14",
    })
  }, [schedule, open, form, assetId, assetType])

  async function onSubmit(values: FormValues) {
    const payload = values as unknown as Parameters<typeof createMaintenanceSchedule>[0]
    const result = schedule
      ? await updateMaintenanceSchedule(schedule.id, payload)
      : await createMaintenanceSchedule(payload)
    if (result?.error) { toast.error("Please fix the errors and try again."); return }
    toast.success(schedule ? "Schedule updated." : "Maintenance schedule added.")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{schedule ? "Edit Schedule" : "Add Maintenance Schedule"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Title *</FormLabel>
                  <FormControl><Input placeholder="Oil Change" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="intervalDays" render={({ field }) => (
                <FormItem>
                  <FormLabel>Repeat Every (days)</FormLabel>
                  <FormControl><Input type="number" placeholder="90" {...field} /></FormControl>
                  <FormDescription className="text-xs">e.g. 90 for quarterly</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              {assetType === "VEHICLE" && (
                <FormField control={form.control} name="intervalMiles" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repeat Every (miles)</FormLabel>
                    <FormControl><Input type="number" placeholder="5000" {...field} /></FormControl>
                    <FormDescription className="text-xs">e.g. 5000 for oil change</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="nextDueDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Next Due Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {assetType === "VEHICLE" && (
                <FormField control={form.control} name="nextDueMileage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Next Due Mileage</FormLabel>
                    <FormControl><Input type="number" placeholder="50000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="reminderDaysBefore" render={({ field }) => (
                <FormItem>
                  <FormLabel>Remind (days before)</FormLabel>
                  <FormControl><Input type="number" placeholder="14" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea rows={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : schedule ? "Save Changes" : "Add Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
