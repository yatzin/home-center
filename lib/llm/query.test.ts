import { describe, expect, it } from "vitest"
import {
  compileInclude, compileLimit, compileSort, compileWhere, entityDef, requireDay, selectFor, ToolInputError,
} from "./query"

const ctx = { userId: "u1", now: new Date("2026-09-26T12:00:00Z") }

describe("entityDef", () => {
  it("accepts exact, cased, plural and spaced names", () => {
    expect(entityDef("vehicle").key).toBe("vehicle")
    expect(entityDef("Vehicles").key).toBe("vehicle")
    expect(entityDef("properties").key).toBe("property")
    expect(entityDef("service_records").key).toBe("serviceRecord")
    expect(entityDef("Insurance Policies").key).toBe("insurancePolicy")
  })
  it("rejects excluded tables", () => {
    for (const bad of ["user", "users", "mailSettings", "llmSettings", "attachment", "account"]) {
      expect(() => entityDef(bad)).toThrow(ToolInputError)
    }
    expect(() => entityDef("user")).toThrow(/Valid entities: property, vehicle/)
  })
})

describe("requireDay", () => {
  it("parses YYYY-MM-DD as UTC midnight, tolerating a time suffix", () => {
    expect(requireDay("2025-03-01", "d")).toEqual(new Date("2025-03-01T00:00:00.000Z"))
    expect(requireDay("2025-03-01T15:00:00Z", "d")).toEqual(new Date("2025-03-01T00:00:00.000Z"))
  })
  it("rejects vague or impossible dates", () => {
    expect(() => requireDay("last year", "date")).toThrow(/date needs a date as YYYY-MM-DD/)
    expect(() => requireDay("2025", "date")).toThrow(ToolInputError)
    expect(() => requireDay("2025-02-30", "date")).toThrow(ToolInputError)
  })
})

describe("compileWhere", () => {
  it("builds simple conditions", () => {
    expect(compileWhere("vehicle", [{ field: "year", op: "gte", value: 2015 }], ctx)).toEqual({
      where: { AND: [{ year: { gte: 2015 } }] },
      assetName: null,
    })
  })

  it("returns an empty where with no filters", () => {
    expect(compileWhere("vehicle", undefined, ctx).where).toEqual({})
  })

  it("coerces numeric strings, money strings and enum casing", () => {
    const { where } = compileWhere("serviceRecord", [
      { field: "cost", op: "gt", value: "$1,200" },
      { field: "category", op: "eq", value: "repair" },
      { field: "assetType", op: "in", value: ["vehicle", "Equipment"] },
      { field: "mileageAtService", op: "lt", value: "90000" },
    ], ctx)
    expect(where).toEqual({
      AND: [
        { cost: { gt: 1200 } },
        { category: { equals: "REPAIR" } },
        { assetType: { in: ["VEHICLE", "EQUIPMENT"] } },
        { mileageAtService: { lt: 90000 } },
      ],
    })
  })

  it("turns dates into UTC days", () => {
    expect(compileWhere("serviceRecord", [{ field: "date", op: "gte", value: "2025-01-01" }], ctx).where).toEqual({
      AND: [{ date: { gte: new Date("2025-01-01T00:00:00.000Z") } }],
    })
  })

  it("rejects bad enum values with the allowed list", () => {
    expect(() => compileWhere("serviceRecord", [{ field: "category", op: "eq", value: "fun" }], ctx)).toThrow(
      /category must be one of ROUTINE, REPAIR/
    )
  })

  it("rejects unknown and excluded fields with the valid list", () => {
    expect(() => compileWhere("vehicle", [{ field: "imageFilename", op: "isNull", value: true }], ctx)).toThrow(
      /Valid fields: name, make, model/
    )
    expect(() => compileWhere("serviceRecord", [{ field: "createdById", op: "eq", value: "x" }], ctx)).toThrow(ToolInputError)
  })

  it("rejects operators that don't fit the type", () => {
    expect(() => compileWhere("vehicle", [{ field: "year", op: "contains", value: "20" }], ctx)).toThrow(
      /Allowed: eq, ne, gt, gte, lt, lte, isNull/
    )
  })

  it("handles isNull both ways and 'in' needing an array", () => {
    expect(compileWhere("medication", [{ field: "endDate", op: "isNull", value: true }], ctx).where).toEqual({ AND: [{ endDate: null }] })
    expect(compileWhere("medication", [{ field: "endDate", op: "isNull", value: false }], ctx).where).toEqual({ AND: [{ endDate: { not: null } }] })
    expect(() => compileWhere("vehicle", [{ field: "make", op: "in", value: "Honda" }], ctx)).toThrow(/non-empty array/)
  })

  it("follows one relation hop", () => {
    expect(compileWhere("medication", [{ field: "person.name", op: "contains", value: "anna" }], ctx).where).toEqual({
      AND: [{ person: { is: { name: { contains: "anna" } } } }],
    })
    expect(compileWhere("insurancePolicy", [{ field: "members.name", op: "eq", value: "Anna" }], ctx).where).toEqual({
      AND: [{ members: { some: { name: { equals: "Anna" } } } }],
    })
  })

  it("rejects deeper paths, list-of-children filters and excluded relations", () => {
    expect(() => compileWhere("medication", [{ field: "person.primaryProvider.name", op: "eq", value: "x" }], ctx)).toThrow(/one relation/)
    expect(() => compileWhere("vehicle", [{ field: "serviceRecords.cost", op: "gt", value: 1 }], ctx)).toThrow(/query serviceRecord/)
    expect(() => compileWhere("serviceRecord", [{ field: "createdBy.email", op: "eq", value: "x" }], ctx)).toThrow(ToolInputError)
  })

  it("returns asset.name filters separately", () => {
    expect(compileWhere("serviceRecord", [{ field: "asset.name", op: "contains", value: "Civic" }], ctx)).toEqual({
      where: {},
      assetName: { op: "contains", value: "Civic" },
    })
    expect(() => compileWhere("serviceRecord", [{ field: "asset.year", op: "eq", value: 1 }], ctx)).toThrow(/asset.name/)
  })

  it("never lets the model widen notification scope", () => {
    expect(compileWhere("notification", [{ field: "isRead", op: "eq", value: "false" }], ctx).where).toEqual({
      AND: [{ isRead: { equals: false } }, { userId: "u1" }],
    })
    expect(() => compileWhere("notification", [{ field: "userId", op: "eq", value: "u2" }], ctx)).toThrow(ToolInputError)
    expect(compileWhere("notification", [], ctx).where).toEqual({ AND: [{ userId: "u1" }] })
  })
})

describe("compileLimit", () => {
  it("defaults, coerces and clamps", () => {
    expect(compileLimit(undefined)).toBe(25)
    expect(compileLimit("10")).toBe(10)
    expect(compileLimit(1000)).toBe(100)
    expect(compileLimit(0)).toBe(1)
    expect(compileLimit("lots")).toBe(25)
  })
})

describe("compileSort", () => {
  it("uses the given field or the entity default", () => {
    expect(compileSort("vehicle", { field: "year", dir: "desc" })).toEqual({ year: "desc" })
    expect(compileSort("vehicle", { field: "year" })).toEqual({ year: "asc" })
    expect(compileSort("serviceRecord")).toEqual({ date: "desc" })
    expect(() => compileSort("vehicle", { field: "vinz" })).toThrow(ToolInputError)
  })
})

describe("selectFor", () => {
  it("selects id, name, keys and declared fields only", () => {
    const sel = selectFor("medication")
    expect(sel).toMatchObject({ id: true, name: true, personId: true, dosage: true })
    expect(sel).not.toHaveProperty("createdAt")
    expect(selectFor("vehicle", ["make"])).toEqual({ id: true, name: true, make: true })
    expect(() => selectFor("vehicle", ["imageFilename"])).toThrow(ToolInputError)
  })
})

describe("compileInclude", () => {
  it("nests one/many relations and lists asset children for the executor", () => {
    const plan = compileInclude("person", ["medications", "primaryProvider", "serviceRecords"])
    expect(plan.select.primaryProvider).toEqual({ select: selectFor("provider") })
    expect(plan.select.medications).toEqual({ select: selectFor("medication"), orderBy: { name: "asc" }, take: 50 })
    expect(plan.children).toEqual([{ relation: "serviceRecords", entity: "serviceRecord" }])
  })
  it("treats asset as always-on and rejects unknown relations", () => {
    expect(compileInclude("serviceRecord", ["asset"]).children).toEqual([])
    expect(() => compileInclude("vehicle", ["owner"])).toThrow(/Relations on vehicle: serviceRecords, warranties, maintenanceSchedules/)
  })
})
