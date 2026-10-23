import { describe, expect, it } from "vitest"
import type { DueInput, MileageIndex } from "@/lib/maintenance-due"
import { createFormatter, DEFAULT_REGIONAL } from "@/lib/regional"
import { dueLabel, dueMaintenance, dueMaintenanceCount, roomsByProperty } from "./shaping"

const NOW = new Date("2026-06-15T12:00:00Z")
const day = (n: number) => new Date(NOW.getTime() + n * 86400000)

let seq = 0
const sched = (over: Partial<DueInput> & { id?: string } = {}): DueInput & { id: string } => ({
  id: over.id ?? `s${++seq}`,
  assetType: "PROPERTY",
  assetId: "p1",
  nextDueDate: null,
  nextDueMileage: null,
  reminderDaysBefore: 7,
  reminderMilesBefore: 500,
  ...over,
})

const mileage: MileageIndex = new Map([["v1", { value: 50_000, unit: "MILES" as const }]])

describe("dueMaintenance", () => {
  it("counts overdue, due soon, and anything within 30 days", () => {
    const list = [
      sched({ nextDueDate: day(-3) }), // overdue
      sched({ nextDueDate: day(5) }), // due soon (within its 7-day reminder)
      sched({ nextDueDate: day(25) }), // not soon by its reminder, but within 30 days
      sched({ nextDueDate: day(31) }), // outside
      sched({ nextDueDate: null }), // no date, no mileage
    ]
    expect(dueMaintenanceCount(list, mileage, NOW)).toBe(3)
  })

  it("counts a vehicle past its due mileage even with a far-off date", () => {
    const list = [sched({ assetType: "VEHICLE", assetId: "v1", nextDueDate: day(400), nextDueMileage: 49_700 })]
    expect(dueMaintenanceCount(list, mileage, NOW)).toBe(1)
  })

  it("ignores mileage for a vehicle with no reading", () => {
    const list = [sched({ assetType: "VEHICLE", assetId: "unknown", nextDueMileage: 100 })]
    expect(dueMaintenanceCount(list, mileage, NOW)).toBe(0)
  })

  it("is zero for no candidates", () => {
    expect(dueMaintenanceCount([], mileage, NOW)).toBe(0)
    expect(dueMaintenance([], mileage, NOW)).toEqual([])
  })

  it("ranks overdue, then soon, then later; ties by days left then id", () => {
    const list = [
      sched({ id: "c", nextDueDate: day(25) }),
      sched({ id: "b", nextDueDate: day(5) }),
      sched({ id: "a2", nextDueDate: day(-1) }),
      sched({ id: "a1", nextDueDate: day(-9) }),
    ]
    expect(dueMaintenance(list, mileage, NOW).map(({ s }) => s.id)).toEqual(["a1", "a2", "b", "c"])
  })

  it("does not mutate its input", () => {
    const list = [sched({ id: "x", nextDueDate: day(25) }), sched({ id: "y", nextDueDate: day(-1) })]
    dueMaintenance(list, mileage, NOW)
    expect(list.map((s) => s.id)).toEqual(["x", "y"])
  })
})

describe("roomsByProperty", () => {
  it("groups rooms under their property, properties and rooms by name", () => {
    const rooms = [
      { id: "1", name: "Kitchen", propertyId: "b", propertyName: "Beach house" },
      { id: "2", name: "Attic", propertyId: "a", propertyName: "Apartment" },
      { id: "3", name: "Bath", propertyId: "b", propertyName: "Beach house" },
    ]
    expect(roomsByProperty(rooms)).toEqual([
      { propertyId: "a", propertyName: "Apartment", rooms: [{ id: "2", name: "Attic" }] },
      {
        propertyId: "b",
        propertyName: "Beach house",
        rooms: [
          { id: "3", name: "Bath" },
          { id: "1", name: "Kitchen" },
        ],
      },
    ])
  })

  it("is empty for no rooms", () => {
    expect(roomsByProperty([])).toEqual([])
  })
})

describe("dueLabel", () => {
  const fmt = createFormatter(DEFAULT_REGIONAL)
  const due = (over: Partial<ReturnType<typeof dueMaintenance>[number]["due"]>) => ({
    overdue: false, dueSoon: false, daysLeft: null, milesLeft: null, reason: null, meterUnit: null, ...over,
  })
  it("words dates", () => {
    expect(dueLabel(due({ daysLeft: -4 }), fmt)).toBe("4d late")
    expect(dueLabel(due({ daysLeft: 0 }), fmt)).toBe("Today")
    expect(dueLabel(due({ daysLeft: 12 }), fmt)).toBe("12d")
    expect(dueLabel(due({}), fmt)).toBe("—")
  })
  it("words mileage", () => {
    expect(dueLabel(due({ reason: "mileage", milesLeft: -300, meterUnit: "MILES" }), fmt)).toBe("300 mi over")
    expect(dueLabel(due({ reason: "mileage", milesLeft: 1200, meterUnit: "HOURS" }), fmt)).toBe("1,200 hrs")
  })
})
