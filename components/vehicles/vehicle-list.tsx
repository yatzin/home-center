"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Gauge, Pencil, Trash2 } from "lucide-react"
import { deleteVehicle } from "@/lib/actions/vehicles"
import { VehicleFormDialog } from "./vehicle-form-dialog"
import { AssetImage } from "@/components/asset-image"
import type { Vehicle } from "@/app/generated/prisma/client"

interface Props {
  vehicles: Vehicle[]
}

export function VehicleList({ vehicles }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This will also delete all associated records.`)) return
    await deleteVehicle(id)
    toast.success(`"${name}" deleted.`)
  }

  function openNew() { setEditing(null); setDialogOpen(true) }
  function openEdit(v: Vehicle) { setEditing(v); setDialogOpen(true) }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vehicles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openNew}>Add Vehicle</Button>
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">No vehicles yet</p>
          <p className="text-sm mt-1">Add your first vehicle to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <Card
              key={v.id}
              className="cursor-pointer transition-all duration-150 hover:-translate-y-1 hover:bg-muted hover:shadow-md"
              onClick={() => router.push(`/assets/vehicles/${v.id}`)}
            >
              <AssetImage assetType="VEHICLE" assetId={v.id} imageFilename={v.imageFilename} alt={v.name} className="h-36 w-full" />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{v.name}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="inline-flex h-7 w-7 shrink-0 -mt-1 -mr-2 items-center justify-center rounded-md hover:bg-muted transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => openEdit(v)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(v.id, v.name)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-sm text-muted-foreground">{v.year} {v.make} {v.model}</p>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {v.currentMileage != null && (
                  <div className="flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5" />
                    {v.currentMileage.toLocaleString()} mi
                  </div>
                )}
                {v.color && <p>{v.color}</p>}
                {v.vin && <p className="font-mono text-xs truncate">VIN: {v.vin}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VehicleFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        vehicle={editing}
      />
    </>
  )
}
