import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { SearchBar } from "@/components/search-bar"
import Link from "next/link"
import { Building2, Car } from "lucide-react"
import { Suspense } from "react"

function warrantyStatus(expirationDate: Date | null) {
  if (!expirationDate) return null
  const now = new Date()
  const exp = new Date(expirationDate)
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return { label: "Expired", variant: "destructive" as const, key: "expired" }
  if (daysLeft <= 60) return { label: `${daysLeft}d left`, variant: "secondary" as const, key: "expiring" }
  return { label: "Active", variant: "outline" as const, key: "active" }
}

export default async function WarrantiesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams
  const now = new Date()

  const all = await prisma.warranty.findMany({ orderBy: { expirationDate: "asc" } })
  const [properties, vehicles] = await Promise.all([
    prisma.property.findMany({ select: { id: true, name: true } }),
    prisma.vehicle.findMany({ select: { id: true, name: true } }),
  ])

  const propMap = Object.fromEntries(properties.map((p) => [p.id, p.name]))
  const vehMap = Object.fromEntries(vehicles.map((v) => [v.id, v.name]))

  const warranties = all.filter((w) => {
    if (q && !w.productName.toLowerCase().includes(q.toLowerCase()) && !w.vendor?.toLowerCase().includes(q.toLowerCase())) return false
    if (status) {
      const st = warrantyStatus(w.expirationDate)
      if (st?.key !== status) return false
    }
    return true
  })

  const expiringSoon = all.filter((w) => {
    if (!w.expirationDate) return false
    const days = Math.ceil((new Date(w.expirationDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return days >= 0 && days <= 60
  }).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Warranties</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {warranties.length} warrant{warranties.length !== 1 ? "ies" : "y"}
          {expiringSoon > 0 && (
            <span className="ml-2 text-amber-600 font-medium">· {expiringSoon} expiring soon</span>
          )}
        </p>
      </div>

      <Suspense>
        <SearchBar
          placeholder="Search coverage, vendor…"
          filters={[{ key: "status", placeholder: "All statuses", options: [{ value: "active", label: "Active" }, { value: "expiring", label: "Expiring soon" }, { value: "expired", label: "Expired" }] }]}
        />
      </Suspense>

      {warranties.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">No warranties yet</p>
          <p className="text-sm mt-1">Add warranties from a property or vehicle detail page.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Asset</th>
                <th className="text-left font-medium px-4 py-2.5">Coverage</th>
                <th className="text-left font-medium px-4 py-2.5 hidden sm:table-cell">Vendor</th>
                <th className="text-left font-medium px-4 py-2.5">Expires</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {warranties.map((w) => {
                const assetName = w.assetType === "PROPERTY" ? propMap[w.assetId] : vehMap[w.assetId]
                const assetHref = w.assetType === "PROPERTY"
                  ? `/assets/properties/${w.assetId}`
                  : `/assets/vehicles/${w.assetId}`
                const AssetIcon = w.assetType === "PROPERTY" ? Building2 : Car
                const status = warrantyStatus(w.expirationDate)

                return (
                  <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={assetHref} className="flex items-center gap-1.5 hover:underline">
                        <AssetIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {assetName ?? <span className="text-muted-foreground italic">Unknown</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium">{w.productName}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{w.vendor ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {w.expirationDate ? new Date(w.expirationDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {status ? <Badge variant={status.variant}>{status.label}</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
