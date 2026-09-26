import { describe, expect, it } from "vitest"
import { attachmentDir } from "./attachment-location"

const base = { serviceRecordId: null, warrantyId: null, maintenanceScheduleId: null }

describe("attachmentDir", () => {
  it("uses the foreign key that matches the record type", () => {
    expect(attachmentDir({ ...base, recordType: "SERVICE", serviceRecordId: "s1" })).toEqual(["service", "s1"])
    expect(attachmentDir({ ...base, recordType: "WARRANTY", warrantyId: "w1" })).toEqual(["warranty", "w1"])
    expect(attachmentDir({ ...base, recordType: "MAINTENANCE", maintenanceScheduleId: "m1" })).toEqual(["maintenance", "m1"])
  })

  it("returns null when the matching key is missing", () => {
    expect(attachmentDir({ ...base, recordType: "SERVICE", warrantyId: "w1" })).toBeNull()
  })
})
