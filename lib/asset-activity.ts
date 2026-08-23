import { prisma } from "@/lib/prisma"
import type { AssetType } from "@/app/generated/prisma/client"

// "Activity" is the last time anything was recorded or changed against an asset:
// a service record, a warranty, or a maintenance reminder. updatedAt is the
// right clock for that — the domain dates can't be used, since nextDueDate and
// expirationDate sit in the future and would sort ahead of real activity.
//
// The link is polymorphic (assetId + assetType, no foreign key), so this is a
// grouped read per record type rather than a join.
export async function loadActivityIndex() {
  const [service, warranty, maintenance] = await Promise.all([
    prisma.serviceRecord.groupBy({ by: ["assetType", "assetId"], _max: { updatedAt: true } }),
    prisma.warranty.groupBy({ by: ["assetType", "assetId"], _max: { updatedAt: true } }),
    prisma.maintenanceSchedule.groupBy({ by: ["assetType", "assetId"], _max: { updatedAt: true } }),
  ])

  const latest = new Map<string, number>()
  for (const group of [...service, ...warranty, ...maintenance]) {
    const at = group._max.updatedAt?.getTime()
    if (!at) continue
    const key = `${group.assetType}:${group.assetId}`
    if (at > (latest.get(key) ?? 0)) latest.set(key, at)
  }

  return {
    at: (assetType: AssetType, assetId: string) => latest.get(`${assetType}:${assetId}`) ?? null,
  }
}

type Thumbnailable = { id: string; name: string; imageFilename: string | null; updatedAt: Date }

// Picks the assets to show on a dashboard card: only ones with a photo, most
// recent activity first. Assets with no records at all fall back to their own
// updatedAt so the list stays full and deterministic rather than dropping them.
export function mostRecentlyActive<T extends Thumbnailable>(
  rows: T[],
  assetType: AssetType,
  activity: { at: (assetType: AssetType, assetId: string) => number | null },
  limit: number
) {
  return rows
    .filter((row): row is T & { imageFilename: string } => !!row.imageFilename)
    .map((row) => ({
      row,
      at: activity.at(assetType, row.id) ?? row.updatedAt.getTime(),
    }))
    .sort((a, b) => b.at - a.at || a.row.id.localeCompare(b.row.id))
    .slice(0, limit)
    .map(({ row }) => ({
      assetType,
      assetId: row.id,
      imageFilename: row.imageFilename,
      name: row.name,
    }))
}
