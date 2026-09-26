import type { AttachmentRecordType } from "@/app/generated/prisma/client"

export type AttachmentLocation = {
  recordType: AttachmentRecordType
  serviceRecordId: string | null
  warrantyId: string | null
  maintenanceScheduleId: string | null
}

/// Where an attachment's file lives, read from the attachment's own foreign
/// keys. Callers never supply the directory — that is what let a forged
/// recordId reach the filesystem before.
export function attachmentDir(a: AttachmentLocation): [string, string] | null {
  const id =
    a.recordType === "SERVICE" ? a.serviceRecordId
    : a.recordType === "WARRANTY" ? a.warrantyId
    : a.recordType === "MAINTENANCE" ? a.maintenanceScheduleId
    : null
  return id ? [a.recordType.toLowerCase(), id] : null
}
