import { describe, expect, it } from "vitest"
import type { ReportData } from "@/lib/report-server"
import { buildTimeline } from "./timeline"

const d = (s: string) => new Date(`${s}T00:00:00Z`)

const report = {
  services: [
    { date: d("2024-05-01"), title: "Oil change", vendor: "Jiffy", cost: 60, category: "ROUTINE", mileageAtService: 42000 },
    { date: d("2025-02-01"), title: "Brakes", vendor: null, cost: 400, category: "REPAIR", mileageAtService: null },
  ],
  warranties: [{ productName: "Powertrain", purchaseDate: d("2023-01-01"), expirationDate: d("2028-01-01") }],
  schedules: [{ title: "Tire rotation", lastCompletedDate: d("2024-09-01") }, { title: "Never done", lastCompletedDate: null }],
  health: null,
} as unknown as ReportData

describe("buildTimeline", () => {
  it("merges services, warranties and maintenance chronologically", () => {
    expect(buildTimeline(report)).toEqual([
      { date: "2023-01-01", kind: "warranty_start", title: "Powertrain" },
      { date: "2024-05-01", kind: "service", title: "Oil change", vendor: "Jiffy", cost: 60, category: "ROUTINE", meter: 42000 },
      { date: "2024-09-01", kind: "maintenance_completed", title: "Tire rotation" },
      { date: "2025-02-01", kind: "service", title: "Brakes", cost: 400, category: "REPAIR" },
      { date: "2028-01-01", kind: "warranty_expires", title: "Powertrain" },
    ])
  })

  it("filters by an inclusive date range", () => {
    expect(buildTimeline(report, { from: d("2024-01-01"), to: d("2024-12-31") }).map((e) => e.title)).toEqual([
      "Oil change",
      "Tire rotation",
    ])
  })

  it("adds health history for a person", () => {
    const person = {
      ...report,
      services: [],
      warranties: [],
      schedules: [],
      health: {
        person: {
          conditions: [{ name: "Asthma", diagnosedDate: d("2010-03-01"), resolvedDate: null }],
          immunizations: [{ vaccine: "Flu", dateGiven: d("2025-10-01"), dose: "2025-26" }],
          medications: [{ name: "Albuterol", dosage: "90mcg", startDate: d("2010-03-05"), endDate: d("2012-01-01") }],
        },
        careTeam: [],
      },
    } as unknown as ReportData
    expect(buildTimeline(person)).toEqual([
      { date: "2010-03-01", kind: "condition_diagnosed", title: "Asthma" },
      { date: "2010-03-05", kind: "medication_started", title: "Albuterol", dosage: "90mcg" },
      { date: "2012-01-01", kind: "medication_ended", title: "Albuterol" },
      { date: "2025-10-01", kind: "immunization", title: "Flu", dose: "2025-26" },
    ])
  })
})
