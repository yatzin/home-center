import { prisma } from "@/lib/prisma"
import type { AssetType } from "@/app/generated/prisma/client"
import { loadFeatures } from "@/lib/features-server"
import { referenceAllowed, type ManualOption, type ReferenceFields } from "@/lib/manual-reference"

/// DOCUMENT files on these assets plus files on their reminders. Person targets drop out while Health is off.
export async function loadManualOptions(targets: { assetType: AssetType; assetId: string }[]): Promise<ManualOption[]> {
  const features = await loadFeatures()
  const wanted = targets.filter((t) => features.health || t.assetType !== "PERSON")
  if (wanted.length === 0) return []
  // One clause per asset type, ids in a list: a per-asset clause joins the schedule
  // table once each, and SQLite stops at 64 tables (a property with many equipment).
  const idsByType = new Map<AssetType, string[]>()
  for (const t of wanted) idsByType.set(t.assetType, [...(idsByType.get(t.assetType) ?? []), t.assetId])
  const rows = await prisma.attachment.findMany({
    where: {
      OR: [...idsByType].flatMap(([assetType, ids]) => [
        { recordType: "DOCUMENT" as const, assetType, assetId: { in: ids } },
        { recordType: "MAINTENANCE" as const, maintenanceSchedule: { assetType, assetId: { in: ids } } },
      ]),
    },
    select: {
      id: true,
      originalName: true,
      filename: true,
      recordType: true,
      assetType: true,
      assetId: true,
      maintenanceScheduleId: true,
      text: { select: { status: true, charCount: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.originalName,
    filename: r.filename,
    recordType: r.recordType as ManualOption["recordType"],
    assetType: r.assetType,
    assetId: r.assetId,
    maintenanceScheduleId: r.maintenanceScheduleId,
    hasText: r.text?.status === "DONE" && (r.text.charCount ?? 0) > 0,
  }))
}

/// undefined in = leave the row's reference alone.
export async function checkReference(
  ref: ReferenceFields | undefined,
  target: { assetType: AssetType; assetId: string },
  scheduleId: string | null,
): Promise<{ value: ReferenceFields | undefined } | { error: string }> {
  if (!ref || !ref.referenceAttachmentId) return { value: ref }
  const [file, features] = await Promise.all([
    prisma.attachment.findUnique({
      where: { id: ref.referenceAttachmentId },
      select: { recordType: true, assetType: true, assetId: true, maintenanceScheduleId: true },
    }),
    loadFeatures(),
  ])
  if (!file || !referenceAllowed(file, target, scheduleId, features.health)) {
    return { error: "Pick a file from this item's documents or this reminder's files." }
  }
  return { value: ref }
}
