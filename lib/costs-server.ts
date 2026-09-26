import { prisma } from "@/lib/prisma"
import type { AssetType } from "@/app/generated/prisma/client"
import type { CostRow } from "@/lib/costs"

/// One query, many rollups. Grouping happens in memory in lib/costs.ts because
/// SQLite cannot group by an extracted year without raw SQL, because assetId is
/// polymorphic with no foreign key so no aggregate query can resolve asset names
/// anyway, and because the /costs page needs five different groupings of the same
/// rows. This holds while the table stays under roughly 50k costed records; past
/// that, byYear moves to raw SQL and nothing outside this module changes.
export async function loadCostRecords(filter?: {
  assetId?: string
  assetType?: AssetType
}): Promise<CostRow[]> {
  const rows = await prisma.serviceRecord.findMany({
    where: {
      cost: { not: null },
      ...(filter?.assetId ? { assetId: filter.assetId } : {}),
      ...(filter?.assetType ? { assetType: filter.assetType } : {}),
    },
    select: {
      id: true,
      assetId: true,
      assetType: true,
      date: true,
      cost: true,
      category: true,
      vendor: true,
      title: true,
      mileageAtService: true,
    },
    orderBy: { date: "asc" },
  })

  // `cost: { not: null }` narrows the rows but not their type, so this assertion
  // states what the query already guarantees.
  return rows.map((row) => ({ ...row, cost: row.cost! }))
}
