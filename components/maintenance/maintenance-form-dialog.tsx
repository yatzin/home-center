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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createMaintenanceSchedule, updateMaintenanceSchedule } from "@/lib/actions/maintenance"
import { meterUnitNoun, meterUnitShort } from "@/lib/maintenance-due"
import { ASSET_TYPES } from "@/lib/assets"
import type { MaintenanceSchedule, MeterUnit, AssetType } from "@/app/generated/prisma/client"

const schema = z.object({
  assetId: z.string(),
  assetType: z.enum(ASSET_TYPES),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  intervalDays: z.string().optional(),
  intervalMiles: z.string().optional(),
  nextDueDate: z.string().optional(),
  nextDueMileage: z.string().optional(),
  reminderDaysBefore: z.string().optional(),
  reminderMilesBefore: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  assetId: string
  assetType: AssetType
  schedule?: MaintenanceSchedule | null
  /** When set (property view), shows a target picker: this property or one of its equipment. */
  equipmentOptions?: { id: string; name: string }[]
  propertyName?: string
  /** Vehicle's odometer unit, for the mileage field labels. Defaults to miles. */
  meterUnit?: MeterUnit
}

function targetKey(assetType: AssetType, assetId: string) {
  return `${assetType}:${assetId}`
}

export function MaintenanceFormDialog({ open, onClose, assetId, assetType, schedule, equipmentOptions, propertyName = "This property", meterUnit = "MILES" }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { assetId, assetType, title: "", description: "", intervalDays: "", intervalMiles: "", nextDueDate: "", nextDueMileage: "", reminderDaysBefore: "14", reminderMilesBefore: "500" },
  })

  useEffect(() => {
    form.reset(schedule ? {
      assetId: schedule.assetId, assetType: schedule.assetType,
      title: schedule.title,
      description: schedule.description ?? "",
      intervalDays: schedule.intervalDays?.toString() ?? "",
      intervalMiles: schedule.intervalMiles?.toString() ?? "",
      nextDueDate: schedule.nextDueDate ? new Date(schedule.nextDueDate).toISOString().split("T")[0] : "",
      nextDueMileage: schedule.nextDueMileage?.toString() ?? "",
      reminderDaysBefore: schedule.reminderDaysBefore.toString(),
      reminderMilesBefore: schedule.reminderMilesBefore.toString(),
    } : {
      assetId, assetType, title: "", description: "", intervalDays: "", intervalMiles: "", nextDueDate: "", nextDueMileage: "", reminderDaysBefore: "14", reminderMilesBefore: "500",
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{schedule ? "Edit Schedule" : "Add Maintenance Schedule"}</DialogTitle>
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
                    <FormLabel>Repeat Every ({meterUnitShort(meterUnit)})</FormLabel>
                    <FormControl><Input type="number" placeholder={meterUnit === "HOURS" ? "50" : "5000"} {...field} /></FormControl>
                    <FormDescription className="text-xs">{meterUnit === "HOURS" ? "e.g. 50 for an oil change" : "e.g. 5000 for oil change"}</FormDescription>
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
                    <FormLabel>Next Due {meterUnitNoun(meterUnit)}</FormLabel>
                    <FormControl><Input type="number" placeholder={meterUnit === "HOURS" ? "1300" : "50000"} {...field} /></FormControl>
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

              {assetType === "VEHICLE" && (
                <FormField control={form.control} name="reminderMilesBefore" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Remind ({meterUnitShort(meterUnit)} before)</FormLabel>
                    <FormControl><Input type="number" placeholder={meterUnit === "HOURS" ? "10" : "500"} {...field} /></FormControl>
                    <FormDescription className="text-xs">How close to the due {meterUnit === "HOURS" ? "hour count" : "mileage"} to start warning</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

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
