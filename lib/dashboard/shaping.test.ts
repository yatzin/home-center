import { describe, expect, it } from "vitest"
import type { DueInput, MileageIndex } from "@/lib/maintenance-due"
import { createFormatter, DEFAULT_REGIONAL } from "@/lib/regional"
import {
  dueLabel,
  dueMaintenance,
  dueMaintenanceCount,
  expiringWarranties,
  groupByMonth,
  groupByUrgency,
  monthKeyOf,
  roomGroups,
  urgencyOf,
  urgentMaintenance,
} from "./shaping"

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

describe("dueMaintenance window", () => {
  it("defaults to 30 days and includes an item exactly on the boundary", () => {
    const list = [sched({ id: "edge", nextDueDate: day(30) }), sched({ id: "past", nextDueDate: day(31) })]
    expect(dueMaintenance(list, mileage, NOW).map(({ s }) => s.id)).toEqual(["edge"])
  })

  it("honours a wider window", () => {
    const list = [sched({ id: "a", nextDueDate: day(45) }), sched({ id: "b", nextDueDate: day(61) })]
    expect(dueMaintenance(list, mileage, NOW, 60).map(({ s }) => s.id)).toEqual(["a"])
  })

  it("honours a narrower window but still keeps overdue and due-soon items", () => {
    const list = [
      sched({ id: "late", nextDueDate: day(-2) }),
      sched({ id: "soon", nextDueDate: day(5) }), // soon by its 7-day reminder
      sched({ id: "mid", nextDueDate: day(20) }),
    ]
    expect(dueMaintenance(list, mileage, NOW, 10).map(({ s }) => s.id)).toEqual(["late", "soon"])
  })
})

describe("urgentMaintenance", () => {
  const list = () => [
    sched({ id: "d", nextDueDate: day(25) }),
    sched({ id: "c", nextDueDate: day(5) }),
    sched({ id: "b", nextDueDate: day(-1) }),
    sched({ id: "a", nextDueDate: day(-1) }),
  ]
  it("ranks like the legacy page (overdue, soon, later; ties by id) and cuts to the limit", () => {
    const r = urgentMaintenance(list(), mileage, NOW, 3)
    expect(r.items.map(({ s }) => s.id)).toEqual(["a", "b", "c"])
    expect(r.total).toBe(4)
  })
  it("is empty for no candidates", () => {
    expect(urgentMaintenance([], mileage, NOW, 6)).toEqual({ total: 0, items: [] })
  })
  it("keeps a mileage-only item (null daysLeft)", () => {
    const r = urgentMaintenance(
      [sched({ id: "m", assetType: "VEHICLE", assetId: "v1", nextDueMileage: 49_800 })],
      mileage,
      NOW,
      6,
    )
    expect(r.items).toHaveLength(1)
    expect(r.items[0].due.daysLeft).toBeNull()
  })
  it("passes the window through", () => {
    expect(urgentMaintenance([sched({ nextDueDate: day(50) })], mileage, NOW, 6, 60).total).toBe(1)
    expect(urgentMaintenance([sched({ nextDueDate: day(50) })], mileage, NOW, 6).total).toBe(0)
  })
})

describe("urgency grouping", () => {
  const d = (over: Partial<ReturnType<typeof dueMaintenance>[number]["due"]>) => ({
    overdue: false, dueSoon: false, daysLeft: null, milesLeft: null, reason: null, meterUnit: null, ...over,
  })
  it("names the three levels", () => {
    expect(urgencyOf(d({ overdue: true }))).toBe("overdue")
    expect(urgencyOf(d({ dueSoon: true }))).toBe("dueSoon")
    expect(urgencyOf(d({ daysLeft: 20 }))).toBe("upcoming")
    expect(urgencyOf(d({}))).toBe("upcoming")
  })
  it("groups in order, omits empty groups, keeps item order", () => {
    const items = [
      { id: "1", urgency: "overdue" as const },
      { id: "2", urgency: "upcoming" as const },
      { id: "3", urgency: "overdue" as const },
    ]
    expect(groupByUrgency(items).map((g) => [g.key, g.label, g.items.map((i) => i.id)])).toEqual([
      ["overdue", "Overdue", ["1", "3"]],
      ["upcoming", "Upcoming", ["2"]],
    ])
  })
  it("is empty for no items", () => {
    expect(groupByUrgency([])).toEqual([])
  })
})

describe("expiringWarranties", () => {
  const w = (id: string, exp: Date | null) => ({ id, expirationDate: exp })
  it("keeps warranties from now through the window (inclusive), soonest first, ties by id", () => {
    const rows = [
      w("late", day(60)),
      w("b", day(10)),
      w("a", day(10)),
      w("past", day(-1)),
      w("beyond", new Date(day(60).getTime() + 1)),
      w("none", null),
      w("now", NOW),
    ]
    const r = expiringWarranties(rows, NOW, 60, 10)
    expect(r.items.map((i) => i.id)).toEqual(["now", "a", "b", "late"])
    expect(r.items.map((i) => i.daysLeft)).toEqual([0, 10, 10, 60])
    expect(r.total).toBe(4)
  })
  it("limits the items but not the total", () => {
    const rows = [w("1", day(1)), w("2", day(2)), w("3", day(3))]
    const r = expiringWarranties(rows, NOW, 30, 2)
    expect(r.items).toHaveLength(2)
    expect(r.total).toBe(3)
  })
  it("rounds days left up like the legacy card", () => {
    expect(expiringWarranties([w("x", new Date(NOW.getTime() + 36 * 3600000))], NOW, 30, 5).items[0].daysLeft).toBe(2)
  })
  it("is empty for nothing", () => {
    expect(expiringWarranties([], NOW, 60, 6)).toEqual({ total: 0, items: [] })
  })
})

describe("groupByMonth", () => {
  it("groups consecutive items by month key, labelling from the first", () => {
    const items = [
      { id: "1", monthKey: "2026-06", monthLabel: "June 2026" },
      { id: "2", monthKey: "2026-06", monthLabel: "June 2026" },
      { id: "3", monthKey: "2026-07", monthLabel: "July 2026" },
    ]
    expect(groupByMonth(items).map((g) => [g.key, g.label, g.items.map((i) => i.id)])).toEqual([
      ["2026-06", "June 2026", ["1", "2"]],
      ["2026-07", "July 2026", ["3"]],
    ])
  })
  it("is empty for no items", () => {
    expect(groupByMonth([])).toEqual([])
  })
})

describe("monthKeyOf", () => {
  it("pads the month", () => {
    expect(monthKeyOf(new Date(2026, 0, 31))).toBe("2026-01")
    expect(monthKeyOf(new Date(2026, 11, 1))).toBe("2026-12")
  })
})
