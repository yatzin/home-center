"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Pencil, Trash2, CheckCircle2, Calendar, Gauge, AlertTriangle, Clock } from "lucide-react"
import { deleteMaintenanceSchedule, completeMaintenanceSchedule } from "@/lib/actions/maintenance"
import { MaintenanceFormDialog } from "./maintenance-form-dialog"
import type { MaintenanceSchedule } from "@/app/generated/prisma/client"

interface Props {
  schedules: MaintenanceSchedule[]
  assetId: string
  assetType: "PROPERTY" | "VEHICLE"
  currentMileage?: number | null
}

function getStatus(s: MaintenanceSchedule, currentMileage?: number | null) {
  const now = new Date()
  const overdueByDate = s.nextDueDate && new Date(s.nextDueDate) < now
  const overdueByMiles = s.nextDueMileage != null && currentMileage != null && currentMileage >= s.nextDueMileage
  if (overdueByDate || overdueByMiles) return { label: "Overdue", variant: "destructive" as const }

  const soonByDate = s.nextDueDate && Math.ceil((new Date(s.nextDueDate).getTime() - now.getTime()) / 86400000) <= s.reminderDaysBefore
  const soonByMiles = s.nextDueMileage != null && currentMileage != null && (s.nextDueMileage - currentMileage) <= 500
  if (soonByDate || soonByMiles) return { label: "Due soon", variant: "secondary" as const }

  if (s.nextDueDate || s.nextDueMileage) return { label: "OK", variant: "outline" as const }
  return null
}

export function MaintenanceList({ schedules, assetId, assetType, currentMileage }: Props) {
  const [editing, setEditing] = useState<MaintenanceSchedule | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [completing, setCompleting] = useState<MaintenanceSchedule | null>(null)

  async function handleDelete(s: MaintenanceSchedule) {
    if (!confirm(`Delete "${s.title}"?`)) return
    await deleteMaintenanceSchedule(s.id, s.assetType, s.assetId)
    toast.success("Schedule deleted.")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{schedules.length} schedule{schedules.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>Add Schedule</Button>
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No maintenance schedules yet.
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => {
            const status = getStatus(s, currentMileage)
            return (
              <div key={s.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {status?.variant === "destructive"
                      ? <AlertTriangle className="h-4 w-4 text-destructive" />
                      : status?.variant === "secondary"
                        ? <Clock className="h-4 w-4 text-amber-500" />
                        : <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{s.title}</span>
                      {status && <Badge variant={status.variant}>{status.label}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      {s.nextDueDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Due {new Date(s.nextDueDate).toLocaleDateString()}
                        </span>
                      )}
                      {s.nextDueMileage != null && (
                        <span className="flex items-center gap-1">
                          <Gauge className="h-3 w-3" />
                          Due at {s.nextDueMileage.toLocaleString()} mi
                        </span>
                      )}
                      {s.intervalDays && <span>Every {s.intervalDays}d</span>}
                      {s.intervalMiles && <span>Every {s.intervalMiles.toLocaleString()} mi</span>}
                      {s.lastCompletedDate && (
                        <span>Last done {new Date(s.lastCompletedDate).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                      onClick={() => setCompleting(s)}>
                      Complete
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setEditing(s); setFormOpen(true) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(s)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <MaintenanceFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        assetId={assetId}
        assetType={assetType}
        schedule={editing}
      />

      {completing && (
        <CompleteDialog
          schedule={completing}
          assetType={assetType}
          currentMileage={currentMileage}
          onClose={() => setCompleting(null)}
        />
      )}
    </>
  )
}

function CompleteDialog({ schedule, assetType, currentMileage, onClose }: {
  schedule: MaintenanceSchedule
  assetType: "PROPERTY" | "VEHICLE"
  currentMileage?: number | null
  onClose: () => void
}) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      completedDate: new Date().toISOString().split("T")[0],
      completedMileage: currentMileage?.toString() ?? "",
    },
  })

  async function onSubmit(values: { completedDate: string; completedMileage: string }) {
    const result = await completeMaintenanceSchedule(schedule.id, values as Parameters<typeof completeMaintenanceSchedule>[1])
    if (result?.error) { toast.error("Something went wrong."); return }
    toast.success(`"${schedule.title}" marked complete.`)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark Complete: {schedule.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Completion Date</label>
            <Input type="date" {...register("completedDate")} />
          </div>
          {assetType === "VEHICLE" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Mileage at Completion</label>
              <Input type="number" placeholder="45230" {...register("completedMileage")} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Mark Complete"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
