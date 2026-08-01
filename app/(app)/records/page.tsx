import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { SearchBar } from "@/components/search-bar"
import Link from "next/link"
import { Building2, Car, Wrench } from "lucide-react"
import { Suspense } from "react"

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ q?: string; assetId?: string }> }) {
  const { q, assetId } = await searchParams

  const [records, properties, vehicles] = await Promise.all([
    prisma.serviceRecord.findMany({
      where: {
        AND: [
          assetId ? { assetId } : {},
          q ? { OR: [{ title: { contains: q } }, { vendor: { contains: q } }, { description: { contains: q } }] } : {},
        ],
      },
      include: { attachments: true },
      orderBy: { date: "desc" },
    }),
    prisma.property.findMany({ select: { id: true, name: true } }),
    prisma.vehicle.findMany({ select: { id: true, name: true } }),
  ])

  const propMap = Object.fromEntries(properties.map((p) => [p.id, p.name]))
  const vehMap = Object.fromEntries(vehicles.map((v) => [v.id, v.name]))

  const assetOptions = [
    ...properties.map((p) => ({ value: p.id, label: p.name })),
    ...vehicles.map((v) => ({ value: v.id, label: v.name })),
  ]

  const totalCost = records.reduce((sum, r) => sum + (r.cost ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Service Records</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {records.length} record{records.length !== 1 ? "s" : ""}
            {totalCost > 0 && ` · $${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total`}
          </p>
        </div>
      </div>

      <Suspense>
        <SearchBar
          placeholder="Search title, vendor, notes…"
          filters={[{ key: "assetId", placeholder: "All assets", options: assetOptions }]}
        />
      </Suspense>

      {records.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">No service records yet</p>
          <p className="text-sm mt-1">Add records from a property or vehicle detail page.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Date</th>
                <th className="text-left font-medium px-4 py-2.5">Asset</th>
                <th className="text-left font-medium px-4 py-2.5">Service</th>
                <th className="text-left font-medium px-4 py-2.5 hidden sm:table-cell">Vendor</th>
                <th className="text-right font-medium px-4 py-2.5">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.map((r) => {
                const assetName = r.assetType === "PROPERTY" ? propMap[r.assetId] : vehMap[r.assetId]
                const assetHref = r.assetType === "PROPERTY"
                  ? `/assets/properties/${r.assetId}`
                  : `/assets/vehicles/${r.assetId}`
                const AssetIcon = r.assetType === "PROPERTY" ? Building2 : Car

                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {new Date(r.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={assetHref} className="flex items-center gap-1.5 hover:underline">
                        <AssetIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {assetName ?? <span className="text-muted-foreground italic">Unknown</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {r.title}
                        {r.attachments.length > 0 && (
                          <Badge variant="outline" className="h-4 px-1.5 text-xs">{r.attachments.length}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{r.vendor}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.cost != null ? `$${r.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
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
