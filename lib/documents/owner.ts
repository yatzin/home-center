import type { AssetType } from "@/app/generated/prisma/client"
import { assetHref } from "@/lib/assets"
import { observationHref } from "@/lib/observations"
import { attachmentDir, type AttachmentLocation } from "@/lib/attachment-location"
import { toDay } from "@/lib/llm/serialize"

// What a file belongs to, for the assistant: the record's kind and title, the
// page to link, the asset or person it hangs off, and the file's own URL
// (served by app/api/files/[...path], the same path the upload route wrote).

type OnAsset = { assetType: AssetType; assetId: string }
type OnPerson = { personId: string }

export type AttachmentOwnerRow = AttachmentLocation & {
  id: string
  filename: string
  originalName: string
  serviceRecord: ({ title: string } & OnAsset) | null
  warranty: ({ productName: string } & OnAsset) | null
  maintenanceSchedule: ({ title: string } & OnAsset) | null
  healthCondition: ({ name: string } & OnPerson) | null
  observation: ({ id: string; type: string; date: Date } & OnPerson) | null
  medication: ({ name: string } & OnPerson) | null
  allergy: ({ substance: string } & OnPerson) | null
  immunization: ({ vaccine: string } & OnPerson) | null
  insurancePolicy: { carrier: string } | null
}

export type DocumentRef = {
  attachmentId: string
  fileName: string
  fileHref: string | null
  record: { type: string; title: string; href: string | null }
  asset: { type: AssetType; id: string } | null
}

type Owner = Pick<DocumentRef, "record" | "asset">

const onAsset = (type: string, title: string, o: OnAsset): Owner => ({
  record: { type, title, href: assetHref(o.assetType, o.assetId) },
  asset: { type: o.assetType, id: o.assetId },
})
const onPerson = (type: string, title: string, personId: string, href = assetHref("PERSON", personId)): Owner => ({
  record: { type, title, href },
  asset: { type: "PERSON", id: personId },
})
const missing = (type: string): Owner => ({ record: { type, title: "(record not found)", href: null }, asset: null })

function owner(a: AttachmentOwnerRow): Owner {
  switch (a.recordType) {
    case "SERVICE":
      return a.serviceRecord ? onAsset("service record", a.serviceRecord.title, a.serviceRecord) : missing("service record")
    case "WARRANTY":
      return a.warranty ? onAsset("warranty", a.warranty.productName, a.warranty) : missing("warranty")
    case "MAINTENANCE":
      return a.maintenanceSchedule ? onAsset("maintenance schedule", a.maintenanceSchedule.title, a.maintenanceSchedule) : missing("maintenance schedule")
    case "CONDITION":
      return a.healthCondition ? onPerson("condition", a.healthCondition.name, a.healthCondition.personId) : missing("condition")
    case "OBSERVATION": {
      const o = a.observation
      return o ? onPerson("observation", `${o.type} on ${toDay(o.date)}`, o.personId, observationHref(o.personId, o.id)) : missing("observation")
    }
    case "MEDICATION":
      return a.medication ? onPerson("medication", a.medication.name, a.medication.personId) : missing("medication")
    case "ALLERGY":
      return a.allergy ? onPerson("allergy", a.allergy.substance, a.allergy.personId) : missing("allergy")
    case "IMMUNIZATION":
      return a.immunization ? onPerson("immunization", a.immunization.vaccine, a.immunization.personId) : missing("immunization")
    case "INSURANCE":
      return a.insurancePolicy
        ? { record: { type: "insurance policy", title: a.insurancePolicy.carrier, href: "/insurance" }, asset: null }
        : missing("insurance policy")
  }
}

export function describeAttachment(a: AttachmentOwnerRow): DocumentRef {
  const dir = attachmentDir(a)
  return {
    attachmentId: a.id,
    fileName: a.originalName,
    fileHref: dir ? `/api/files/${dir[0]}/${dir[1]}/${a.filename}` : null,
    ...owner(a),
  }
}
