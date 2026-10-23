import { describe, expect, it } from "vitest"
import type { DueInput, MileageIndex } from "@/lib/maintenance-due"
import { createFormatter, DEFAULT_REGIONAL } from "@/lib/regional"
import { dueLabel, dueMaintenance, dueMaintenanceCount, roomGroups } from "./shaping"

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

describe("roomGroups", () => {
  it("keeps the true count per property when the chips are cut", () => {
    // 12 rooms across three properties; only 7 chips were fetched (the limit).
    const counts = [
      { propertyId: "c", propertyName: "Cabin", count: 2 },
      { propertyId: "a", propertyName: "Apartment", count: 6 },
      { propertyId: "b", propertyName: "Beach house", count: 4 },
    ]
    const chips = [
      ...["R1", "R2", "R3", "R4", "R5", "R6"].map((name, i) => ({ id: `a${i}`, name, propertyId: "a" })),
      { id: "b0", name: "Bath", propertyId: "b" },
    ]
    const groups = roomGroups(counts, chips)
    expect(groups.map((g) => [g.propertyName, g.roomCount, g.rooms.length])).toEqual([
      ["Apartment", 6, 6],
      ["Beach house", 4, 1],
      ["Cabin", 2, 0],
    ])
    expect(groups.reduce((n, g) => n + g.roomCount, 0)).toBe(12)
  })

  it("orders properties and room chips by name", () => {
    const groups = roomGroups(
      [
        { propertyId: "b", propertyName: "Beach house", count: 2 },
        { propertyId: "a", propertyName: "Apartment", count: 1 },
      ],
      [
        { id: "1", name: "Kitchen", propertyId: "b" },
        { id: "3", name: "Bath", propertyId: "b" },
        { id: "2", name: "Attic", propertyId: "a" },
      ],
    )
    expect(groups).toEqual([
      { propertyId: "a", propertyName: "Apartment", roomCount: 1, rooms: [{ id: "2", name: "Attic" }] },
      {
        propertyId: "b",
        propertyName: "Beach house",
        roomCount: 2,
        rooms: [
          { id: "3", name: "Bath" },
          { id: "1", name: "Kitchen" },
        ],
      },
    ])
  })

  it("is empty for no rooms", () => {
    expect(roomGroups([], [])).toEqual([])
  })
})

describe("dueMaintenance ranking", () => {
  it("ranks a truck past its mileage above a date-only item", () => {
    const list = [
      sched({ id: "date", nextDueDate: day(2) }),
      sched({ id: "truck", assetType: "VEHICLE", assetId: "v1", nextDueDate: day(400), nextDueMileage: 49_700 }),
    ]
    expect(dueMaintenance(list, mileage, NOW).map(({ s }) => s.id)).toEqual(["truck", "date"])
  })

  it("sorts a mileage-due schedule with no date after dated ones of equal severity", () => {
    const list = [
      sched({ id: "nodate", assetType: "VEHICLE", assetId: "v1", nextDueDate: null, nextDueMileage: 49_000 }),
      sched({ id: "dated", assetType: "VEHICLE", assetId: "v1", nextDueDate: day(-2) }),
    ]
    const ranked = dueMaintenance(list, mileage, NOW)
    expect(ranked.map(({ s }) => s.id)).toEqual(["dated", "nodate"])
    expect(ranked[1].due.daysLeft).toBeNull()
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
