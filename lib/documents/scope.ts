import { prisma } from "@/lib/prisma"
import type { AssetType, AttachmentRecordType, DocumentTextStatus, Prisma } from "@/app/generated/prisma/client"
import { describeAttachment, type DocumentRef } from "./owner"

// Database side of the document tools: which files belong to an asset, and
// what each file belongs to.

export const OWNER_SELECT = {
  id: true, recordType: true, filename: true, originalName: true,
  serviceRecordId: true, warrantyId: true, maintenanceScheduleId: true, healthConditionId: true, insurancePolicyId: true,
  observationId: true, medicationId: true, allergyId: true, immunizationId: true,
  serviceRecord: { select: { title: true, assetType: true, assetId: true } },
  warranty: { select: { productName: true, assetType: true, assetId: true } },
  maintenanceSchedule: { select: { title: true, assetType: true, assetId: true } },
  healthCondition: { select: { name: true, personId: true } },
  observation: { select: { id: true, type: true, date: true, personId: true } },
  medication: { select: { name: true, personId: true } },
  allergy: { select: { substance: true, personId: true } },
  immunization: { select: { vaccine: true, personId: true } },
  insurancePolicy: { select: { carrier: true } },
} satisfies Prisma.AttachmentSelect

export type LoadedRef = DocumentRef & {
  recordType: AttachmentRecordType
  text: { status: DocumentTextStatus; pageCount: number | null } | null
}

export async function loadDocumentRefs(ids: string[]): Promise<Map<string, LoadedRef>> {
  if (!ids.length) return new Map()
  const rows = await prisma.attachment.findMany({
    where: { id: { in: ids } },
    select: { ...OWNER_SELECT, text: { select: { status: true, pageCount: true } } },
  })
  return new Map(rows.map((r) => [r.id, { ...describeAttachment(r), recordType: r.recordType, text: r.text }]))
}

/**
 * Files attached to an asset's records. A property includes the equipment
 * installed there (as the other shortcut tools do); a person includes their
 * health records and the insurance policies they're a member of.
 */
export async function attachmentIdsForAsset(type: AssetType, id: string): Promise<string[]> {
  const owners: { assetType: AssetType; assetId: string }[] = [{ assetType: type, assetId: id }]
  if (type === "PROPERTY") {
    const equipment = await prisma.equipment.findMany({ where: { propertyId: id }, select: { id: true } })
    owners.push(...equipment.map((e) => ({ assetType: "EQUIPMENT" as const, assetId: e.id })))
  }
  const OR: Prisma.AttachmentWhereInput[] = owners.flatMap((o) => [
    { serviceRecord: { is: o } },
    { warranty: { is: o } },
    { maintenanceSchedule: { is: o } },
  ])
  if (type === "PERSON") {
    OR.push(
      { healthCondition: { is: { personId: id } } },
      { observation: { is: { personId: id } } },
      { medication: { is: { personId: id } } },
      { allergy: { is: { personId: id } } },
      { immunization: { is: { personId: id } } },
      { insurancePolicy: { is: { members: { some: { id } } } } },
    )
  }
  const rows = await prisma.attachment.findMany({ where: { OR }, select: { id: true } })
  return rows.map((r) => r.id)
}

export type ListedRef = LoadedRef & { uploadedAt: Date }

/** Files in scope, newest first, for list_documents. Hidden record types never appear or count. */
export async function listDocumentRefs(f: {
  attachmentIds: string[] | null
  recordTypes: AttachmentRecordType[] | null
  hidden: AttachmentRecordType[]
  limit: number
}): Promise<{ total: number; refs: ListedRef[] }> {
  const where: Prisma.AttachmentWhereInput = {
    recordType: { ...(f.recordTypes ? { in: f.recordTypes } : {}), notIn: f.hidden },
    ...(f.attachmentIds ? { id: { in: f.attachmentIds } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.attachment.count({ where }),
    prisma.attachment.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      take: f.limit,
      select: { ...OWNER_SELECT, uploadedAt: true, text: { select: { status: true, pageCount: true } } },
    }),
  ])
  return {
    total,
    refs: rows.map((r) => ({ ...describeAttachment(r), recordType: r.recordType, uploadedAt: r.uploadedAt, text: r.text })),
  }
}

/** Files in scope the search couldn't see: not read yet, failed, or unsupported. Hidden types never count. */
export async function countNotIndexed(f: {
  attachmentIds: string[] | null
  recordTypes: AttachmentRecordType[] | null
  hidden: AttachmentRecordType[]
}): Promise<number> {
  return prisma.attachmentText.count({
    where: {
      status: { in: ["PENDING", "FAILED", "UNSUPPORTED"] },
      attachment: {
        recordType: { ...(f.recordTypes ? { in: f.recordTypes } : {}), notIn: f.hidden },
        ...(f.attachmentIds ? { id: { in: f.attachmentIds } } : {}),
      },
    },
  })
}
