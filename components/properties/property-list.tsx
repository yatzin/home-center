"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreHorizontal, MapPin, Pencil, Trash2 } from "lucide-react"
import { deleteProperty } from "@/lib/actions/properties"
import { PropertyFormDialog } from "./property-form-dialog"
import { AssetImage } from "@/components/asset-image"
import type { Property } from "@/app/generated/prisma/client"

const typeLabel: Record<string, string> = {
  HOUSE: "House", CONDO: "Condo", TOWNHOUSE: "Townhouse", LOT: "Lot / Land", OTHER: "Other",
}

interface Props {
  properties: Property[]
}

export function PropertyList({ properties }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<Property | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This will also delete all associated records.`)) return
    await deleteProperty(id)
    toast.success(`"${name}" deleted.`)
  }

  function openNew() { setEditing(null); setDialogOpen(true) }
  function openEdit(p: Property) { setEditing(p); setDialogOpen(true) }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Properties</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {properties.length} {properties.length === 1 ? "property" : "properties"}
          </p>
        </div>
        <Button onClick={openNew}>Add Property</Button>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">No properties yet</p>
          <p className="text-sm mt-1">Add your first property to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer transition-all duration-150 hover:-translate-y-1 hover:bg-muted hover:shadow-md"
              onClick={() => router.push(`/assets/properties/${p.id}`)}
            >
              <AssetImage assetType="PROPERTY" assetId={p.id} imageFilename={p.imageFilename} alt={p.name} className="h-36 w-full" />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{p.name}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="inline-flex h-7 w-7 shrink-0 -mt-1 -mr-2 items-center justify-center rounded-md hover:bg-muted transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(p.id, p.name)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Badge variant="secondary" className="w-fit text-xs">{typeLabel[p.type]}</Badge>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <div className="flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{p.address}</span>
                </div>
                {p.sqFt && <p>{p.sqFt.toLocaleString()} sq ft</p>}
                {p.yearBuilt && <p>Built {p.yearBuilt}</p>}
                {p.purchasePrice && <p>${p.purchasePrice.toLocaleString()}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PropertyFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        property={editing}
      />
    </>
  )
}
