"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Pencil, Trash2, CheckCircle2, AlertTriangle, Clock } from "lucide-react"
import { deleteMaintenanceSchedule, completeMaintenanceSchedule } from "@/lib/actions/maintenance"
import { MaintenanceFormDialog } from "./maintenance-form-dialog"
import { SortableTableHead } from "@/components/ui/sortable-table-head"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { useClientTable, type Accessor } from "@/lib/use-client-table"
import type { SortDir } from "@/lib/table-params"
import type { MaintenanceSchedule } from "@/app/generated/prisma/client"

const ACCESSORS: Record<string, Accessor<MaintenanceSchedule>> = {
  title: (s) => s.title,
  status: (s) => (s.nextDueDate ? new Date(s.nextDueDate).getTime() : null),
  nextDue: (s) => (s.nextDueDate ? new Date(s.nextDueDate).getTime() : null),
  lastCompleted: (s) => (s.lastCompletedDate ? new Date(s.lastCompletedDate).getTime() : null),
}

const INITIAL_DIRS: Record<string, SortDir> = { lastCompleted: "desc" }

interface Props {
  schedules: MaintenanceSchedule[]
  assetId: string
  assetType: "PROPERTY" | "VEHICLE" | "EQUIPMENT"
  currentMileage?: number | null
}

function getStatus(s: MaintenanceSchedule, currentMileage?: number | null) {
  const now = new Date()
  const overdueByDate = s.nextDueDate && new Date(s.nextDueDate) < now
  const overdueByMiles = s.nextDueMileage != null && currentMileage != null && currentMileage >= s.nextDueMileage
  if (overdueByDate || overdueByMiles) return { label: "Overdue", variant: "destructive" as const, icon: AlertTriangle }

  const soonByDate = s.nextDueDate && Math.ceil((new Date(s.nextDueDate).getTime() - now.getTime()) / 86400000) <= s.reminderDaysBefore
  const soonByMiles = s.nextDueMileage != null && currentMileage != null && (s.nextDueMileage - currentMileage) <= 500
  if (soonByDate || soonByMiles) return { label: "Due soon", variant: "secondary" as const, icon: Clock }

  if (s.nextDueDate || s.nextDueMileage) return { label: "OK", variant: "outline" as const, icon: CheckCircle2 }
  return null
}

export function MaintenanceList({ schedules, assetId, assetType, currentMileage }: Props) {
  const [editing, setEditing] = useState<MaintenanceSchedule | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [completing, setCompleting] = useState<MaintenanceSchedule | null>(null)

  const table = useClientTable({
    rows: schedules,
    accessors: ACCESSORS,
    defaultSort: "nextDue",
    defaultDir: "asc",
    initialDirs: INITIAL_DIRS,
  })

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
        <div className="rounded-lg border overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="title" label="Title" sortState={table.sortState} onToggle={table.toggleSort} />
                <TableHead>Notes</TableHead>
                <SortableTableHead column="status" label="Status" sortState={table.sortState} onToggle={table.toggleSort} />
                <SortableTableHead column="nextDue" label="Next Due" sortState={table.sortState} onToggle={table.toggleSort} />
                <TableHead>Interval</TableHead>
                <SortableTableHead column="lastCompleted" label="Last Completed" sortState={table.sortState} onToggle={table.toggleSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((s) => {
                const status = getStatus(s, currentMileage)
                const StatusIcon = status?.icon
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => { setEditing(s); setFormOpen(true) }}
                  >
                    <TableCell className="font-medium">{s.title}</TableCell>
                    <TableCell className="max-w-[220px]">
                      {s.description ? (
                        <Tooltip>
                          <TooltipTrigger className="block w-full truncate border-0 bg-transparent p-0 text-left text-muted-foreground">
                            {s.description}
                          </TooltipTrigger>
                          <TooltipContent align="start" className="whitespace-pre-wrap">{s.description}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {status && (
                        <Badge variant={status.variant} className="gap-1">
                          {StatusIcon && <StatusIcon className="h-3 w-3" />}
                          {status.label}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {s.nextDueDate && <div>{new Date(s.nextDueDate).toLocaleDateString()}</div>}
                      {s.nextDueMileage != null && <div>{s.nextDueMileage.toLocaleString()} mi</div>}
                      {!s.nextDueDate && s.nextDueMileage == null && "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {s.intervalDays && <div>Every {s.intervalDays}d</div>}
                      {s.intervalMiles && <div>Every {s.intervalMiles.toLocaleString()} mi</div>}
                      {!s.intervalDays && !s.intervalMiles && "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {s.lastCompletedDate ? new Date(s.lastCompletedDate).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                          onClick={() => setCompleting(s)}>
                          Complete
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit "${s.title}"`}
                          onClick={() => { setEditing(s); setFormOpen(true) }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`Delete "${s.title}"`}
                          onClick={() => handleDelete(s)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          <PaginationBar
            page={table.page}
            pageCount={table.pageCount}
            total={table.total}
            per={table.per}
            onPage={table.setPage}
            onPer={table.setPer}
            label="schedules"
          />
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
  assetType: "PROPERTY" | "VEHICLE" | "EQUIPMENT"
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
