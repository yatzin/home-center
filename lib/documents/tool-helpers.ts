import type { AttachmentRecordType, DocumentTextStatus } from "@/app/generated/prisma/client"
import { ToolInputError } from "@/lib/llm/query"
import type { Hit } from "./index-db"
import { HEALTH_RECORD_TYPES } from "./limits"

// Rules for the assistant's document tools that don't need the database.

export const RECORD_TYPES = [
  "SERVICE", "WARRANTY", "MAINTENANCE", "CONDITION", "INSURANCE", "OBSERVATION", "MEDICATION", "ALLERGY", "IMMUNIZATION",
] as const satisfies readonly AttachmentRecordType[]

export function hiddenRecordTypes(includeHealth: boolean): AttachmentRecordType[] {
  return includeHealth ? [] : [...HEALTH_RECORD_TYPES]
}

export function visibleRecordTypes(includeHealth: boolean): AttachmentRecordType[] {
  const hidden = hiddenRecordTypes(includeHealth)
  return RECORD_TYPES.filter((t) => !hidden.includes(t))
}

export function isHiddenRecordType(type: string, includeHealth: boolean): boolean {
  return (hiddenRecordTypes(includeHealth) as string[]).includes(type)
}

const ALIASES: Record<string, AttachmentRecordType> = {
  service: "SERVICE", servicerecord: "SERVICE", record: "SERVICE",
  warranty: "WARRANTY",
  maintenance: "MAINTENANCE", maintenanceschedule: "MAINTENANCE", schedule: "MAINTENANCE",
  condition: "CONDITION", healthcondition: "CONDITION", diagnosis: "CONDITION",
  insurance: "INSURANCE", insurancepolicy: "INSURANCE", policy: "INSURANCE",
  observation: "OBSERVATION",
  medication: "MEDICATION", medicine: "MEDICATION", prescription: "MEDICATION",
  allergy: "ALLERGY",
  immunization: "IMMUNIZATION", vaccine: "IMMUNIZATION", vaccination: "IMMUNIZATION",
}

/** A recordType argument as models send it ("warranties", "Service records") → the enum, if visible. */
export function toRecordType(raw: string, includeHealth: boolean): AttachmentRecordType {
  const upper = raw.trim().toUpperCase()
  const key = raw.toLowerCase().replace(/[^a-z]/g, "").replace(/ies$/, "y").replace(/s$/, "")
  const type = (RECORD_TYPES as readonly string[]).includes(upper) ? (upper as AttachmentRecordType) : ALIASES[key]
  const visible = visibleRecordTypes(includeHealth)
  if (!type || !visible.includes(type)) {
    throw new ToolInputError(`Unknown recordType "${raw}". Use one of: ${visible.join(", ")}.`)
  }
  return type
}

/** Chunks → files, best file first, each with its best `perDoc` chunks. Lower BM25 score is better. */
export function groupHits(hits: Hit[], limit: number, perDoc = 3): { attachmentId: string; hits: Hit[] }[] {
  const groups = new Map<string, Hit[]>()
  for (const h of [...hits].sort((a, b) => a.score - b.score)) {
    const g = groups.get(h.attachmentId)
    if (g) {
      if (g.length < perDoc) g.push(h)
    } else if (groups.size < limit) {
      groups.set(h.attachmentId, [h])
    }
  }
  return [...groups].map(([attachmentId, grouped]) => ({ attachmentId, hits: grouped }))
}

export function searchDocumentsDescription(includeHealth: boolean): string {
  return (
    "Search the text of files uploaded to records — receipts, manuals, warranty cards, insurance policies" +
    (includeHealth ? ", medical documents" : "") +
    ". Use it when the answer is likely written in a document rather than stored as a field: filter sizes, part numbers, " +
    "deductibles, coverage terms, instructions. Key words or a model number work better than a whole question. " +
    "Returns the best passages per file; call read_document for more."
  )
}

export const READ_DOCUMENT_DESCRIPTION =
  "Read the text of one uploaded file, a few pages at a time. Use after search_documents when a passage isn't enough. " +
  "If the result has next, call again with next.fromPage and next.offset to continue."

export const STATUS_NOTE: Record<Exclude<DocumentTextStatus, "DONE">, string> = {
  PENDING: "This file hasn't been read yet — it's waiting to be indexed. Try again in a few minutes.",
  EMPTY: "No text was found in this file (a photo or scan with OCR off, or a blank page).",
  UNSUPPORTED: "This file type can't be read (iWork, zip, old Excel or PowerPoint, HEIC photos).",
  FAILED: "This file couldn't be read.",
}

export type DocumentAccess = { enabled: boolean; includeHealth: boolean }

export function documentAccess(
  settings: { indexingEnabled: boolean },
  llm: { documentsEnabled: boolean; healthDocumentsEnabled: boolean }
): DocumentAccess {
  const enabled = settings.indexingEnabled && llm.documentsEnabled
  return { enabled, includeHealth: enabled && llm.healthDocumentsEnabled }
}
