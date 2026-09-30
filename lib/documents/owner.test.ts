import { describe, expect, it } from "vitest"
import { describeAttachment, type AttachmentOwnerRow } from "./owner"

const none = {
  serviceRecordId: null, warrantyId: null, maintenanceScheduleId: null, healthConditionId: null, insurancePolicyId: null,
  observationId: null, medicationId: null, allergyId: null, immunizationId: null,
  serviceRecord: null, warranty: null, maintenanceSchedule: null, healthCondition: null, observation: null,
  medication: null, allergy: null, immunization: null, insurancePolicy: null,
}
const row = (over: Partial<AttachmentOwnerRow>): AttachmentOwnerRow =>
  ({ id: "att1", filename: "3f2a.pdf", originalName: "Manual.pdf", recordType: "SERVICE", ...none, ...over }) as AttachmentOwnerRow

describe("describeAttachment", () => {
  it("links a warranty file to its asset page and the file route", () => {
    const r = describeAttachment(row({
      recordType: "WARRANTY", warrantyId: "w1",
      warranty: { productName: "Carrier furnace", assetType: "EQUIPMENT", assetId: "eq1" },
    }))
    expect(r).toEqual({
      attachmentId: "att1",
      fileName: "Manual.pdf",
      fileHref: "/api/files/warranty/w1/3f2a.pdf",
      record: { type: "warranty", title: "Carrier furnace", href: "/assets/equipment/eq1" },
      asset: { type: "EQUIPMENT", id: "eq1" },
    })
  })

  it("links health files to the person, observations to the open observation", () => {
    const med = describeAttachment(row({ recordType: "MEDICATION", medicationId: "m1", medication: { name: "Amoxicillin", personId: "p1" } }))
    expect(med.record).toEqual({ type: "medication", title: "Amoxicillin", href: "/assets/people/p1" })
    expect(med.asset).toEqual({ type: "PERSON", id: "p1" })

    const obs = describeAttachment(row({
      recordType: "OBSERVATION", observationId: "o1",
      observation: { id: "o1", type: "MELTDOWN", date: new Date("2026-03-04T00:00:00Z"), personId: "p1" },
    }))
    expect(obs.record.title).toBe("MELTDOWN on 2026-03-04")
    expect(obs.record.href).toBe("/assets/people/p1?tab=observations&open=o1")
  })

  it("links insurance files to the insurance page with no asset", () => {
    const r = describeAttachment(row({ recordType: "INSURANCE", insurancePolicyId: "i1", insurancePolicy: { carrier: "Acme Mutual" } }))
    expect(r.record).toEqual({ type: "insurance policy", title: "Acme Mutual", href: "/insurance" })
    expect(r.asset).toBeNull()
  })

  it("survives a missing parent record", () => {
    const r = describeAttachment(row({ recordType: "SERVICE", serviceRecordId: null, serviceRecord: null }))
    expect(r.fileHref).toBeNull()
    expect(r.record).toEqual({ type: "service record", title: "(record not found)", href: null })
  })
})
