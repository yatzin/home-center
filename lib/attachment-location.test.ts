import { describe, expect, it } from "vitest"
import { attachmentDir } from "./attachment-location"

const base = { serviceRecordId: null, warrantyId: null, maintenanceScheduleId: null, healthConditionId: null, insurancePolicyId: null }

describe("attachmentDir", () => {
  it("uses the foreign key that matches the record type", () => {
    expect(attachmentDir({ ...base, recordType: "SERVICE", serviceRecordId: "s1" })).toEqual(["service", "s1"])
    expect(attachmentDir({ ...base, recordType: "WARRANTY", warrantyId: "w1" })).toEqual(["warranty", "w1"])
    expect(attachmentDir({ ...base, recordType: "MAINTENANCE", maintenanceScheduleId: "m1" })).toEqual(["maintenance", "m1"])
  })

  it("returns null when the matching key is missing", () => {
    expect(attachmentDir({ ...base, recordType: "SERVICE", warrantyId: "w1" })).toBeNull()
  })

  it("locates condition and insurance files", () => {
    expect(attachmentDir({ ...base, recordType: "CONDITION", healthConditionId: "c1" })).toEqual(["condition", "c1"])
    expect(attachmentDir({ ...base, recordType: "INSURANCE", insurancePolicyId: "i1" })).toEqual(["insurance", "i1"])
  })
})
