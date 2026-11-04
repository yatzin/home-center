import { prisma } from "@/lib/prisma"
import { loadFeatures } from "@/lib/features-server"
import { isHealthInsuranceKind } from "@/lib/insurance"
import type { AssetType } from "@/app/generated/prisma/client"

export const RECORD_TYPES = ["SERVICE", "WARRANTY", "MAINTENANCE", "CONDITION", "INSURANCE", "OBSERVATION", "MEDICATION", "ALLERGY", "IMMUNIZATION", "DOCUMENT", "INBOX", "ROOM"] as const
export type RecordType = (typeof RECORD_TYPES)[number]

export function isRecordType(v: string | null): v is RecordType {
  return v !== null && (RECORD_TYPES as readonly string[]).includes(v)
}

// The record must exist before anything touches the disk: the id becomes a
// directory name, and a made-up id must not be able to create one.
async function recordExists(type: Exclude<RecordType, "DOCUMENT">, id: string): Promise<boolean> {
  const where = { where: { id }, select: { id: true } } as const
  if (type === "SERVICE") return !!(await prisma.serviceRecord.findUnique(where))
  if (type === "WARRANTY") return !!(await prisma.warranty.findUnique(where))
  if (type === "MAINTENANCE") return !!(await prisma.maintenanceSchedule.findUnique(where))
  if (type === "CONDITION") return !!(await prisma.healthCondition.findUnique(where))
  if (type === "OBSERVATION") return !!(await prisma.observation.findUnique(where))
  if (type === "MEDICATION") return !!(await prisma.medication.findUnique(where))
  if (type === "ALLERGY") return !!(await prisma.allergy.findUnique(where))
  if (type === "IMMUNIZATION") return !!(await prisma.immunization.findUnique(where))
  // Any signed-in member of the household may add to the shared inbox.
  if (type === "INBOX") return !!(await prisma.inboxItem.findUnique(where))
  if (type === "ROOM") return !!(await prisma.room.findUnique(where))
  return !!(await prisma.insurancePolicy.findUnique(where))
}

// A document's recordId is the asset's own id. Ids are cuids, unique across
// tables, so whichever asset table holds it says what kind of asset it is.
async function documentAssetType(id: string): Promise<AssetType | null> {
  const where = { where: { id }, select: { id: true } } as const
  const [property, vehicle, equipment, person] = await Promise.all([
    prisma.property.findUnique(where),
    prisma.vehicle.findUnique(where),
    prisma.equipment.findUnique(where),
    prisma.person.findUnique(where),
  ])
  if (property) return "PROPERTY"
  if (vehicle) return "VEHICLE"
  if (equipment) return "EQUIPMENT"
  if (person && (await loadFeatures()).health) return "PERSON"
  return null
}

/**
 * Feature gates plus existence of the record a file is being attached to.
 * Shared by the upload route and the Paperless import. `assetType` is set for
 * DOCUMENT records only.
 */
export async function resolveAttachmentRecord(
  recordType: RecordType,
  recordId: string,
): Promise<{ found: false } | { found: true; assetType: AssetType | null }> {
  if (recordType === "ROOM" && !(await loadFeatures()).rooms) return { found: false }
  if (recordType === "INSURANCE" && !(await loadFeatures()).health) {
    const policy = await prisma.insurancePolicy.findUnique({ where: { id: recordId }, select: { kind: true } })
    if (policy && isHealthInsuranceKind(policy.kind)) return { found: false }
  }
  const assetType = recordType === "DOCUMENT" ? await documentAssetType(recordId) : null
  if (recordType === "DOCUMENT" ? !assetType : !(await recordExists(recordType, recordId))) return { found: false }
  return { found: true, assetType }
}

/** The foreign-key columns that attach an Attachment to its record. */
export function attachmentRecordFields(recordType: RecordType, recordId: string, assetType: AssetType | null) {
  return {
    recordType,
    serviceRecordId: recordType === "SERVICE" ? recordId : null,
    warrantyId: recordType === "WARRANTY" ? recordId : null,
    maintenanceScheduleId: recordType === "MAINTENANCE" ? recordId : null,
    healthConditionId: recordType === "CONDITION" ? recordId : null,
    insurancePolicyId: recordType === "INSURANCE" ? recordId : null,
    observationId: recordType === "OBSERVATION" ? recordId : null,
    medicationId: recordType === "MEDICATION" ? recordId : null,
    allergyId: recordType === "ALLERGY" ? recordId : null,
    immunizationId: recordType === "IMMUNIZATION" ? recordId : null,
    assetType,
    assetId: recordType === "DOCUMENT" ? recordId : null,
    inboxItemId: recordType === "INBOX" ? recordId : null,
    roomId: recordType === "ROOM" ? recordId : null,
  }
}
