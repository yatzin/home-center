import { describe, expect, it } from "vitest"
import { findOpenRow, maintenanceEditHref, warrantyEditHref, withoutOpenParam } from "./deep-link"

describe("maintenanceEditHref", () => {
  it("opens the schedule on its item's Maintenance tab, as the Maintenance page's task links do", () => {
    expect(maintenanceEditHref("VEHICLE", "v1", "s1")).toBe("/assets/vehicles/v1?tab=maintenance&open=s1")
    expect(maintenanceEditHref("PROPERTY", "p1", "s2")).toBe("/assets/properties/p1?tab=maintenance&open=s2")
    expect(maintenanceEditHref("EQUIPMENT", "e1", "s3")).toBe("/assets/equipment/e1?tab=maintenance&open=s3")
  })

  it("uses the Reminders tab for a person", () => {
    expect(maintenanceEditHref("PERSON", "u1", "s4")).toBe("/assets/people/u1?tab=reminders&open=s4")
  })

  it("encodes ids so they can't add parameters", () => {
    expect(maintenanceEditHref("VEHICLE", "v1", "a&tab=x")).toBe("/assets/vehicles/v1?tab=maintenance&open=a%26tab%3Dx")
  })
})

describe("warrantyEditHref", () => {
  it("opens the warranty on its item's Warranties tab", () => {
    expect(warrantyEditHref("EQUIPMENT", "e1", "w1")).toBe("/assets/equipment/e1?tab=warranties&open=w1")
    expect(warrantyEditHref("PROPERTY", "p1", "w2")).toBe("/assets/properties/p1?tab=warranties&open=w2")
  })
})

describe("findOpenRow", () => {
  const rows = [{ id: "a" }, { id: "b" }]

  it("finds only an already-loaded row", () => {
    expect(findOpenRow(rows, "b")).toBe(rows[1])
  })

  it("ignores an unknown, empty, repeated or missing id", () => {
    expect(findOpenRow(rows, "zzz")).toBeUndefined()
    expect(findOpenRow(rows, "")).toBeUndefined()
    expect(findOpenRow(rows, undefined)).toBeUndefined()
    expect(findOpenRow(rows, ["a", "b"])).toBeUndefined()
    expect(findOpenRow(rows, "a ")).toBeUndefined()
  })
})

describe("withoutOpenParam", () => {
  it("removes open and keeps the other parameters", () => {
    expect(withoutOpenParam("?tab=maintenance&open=s1")).toBe("?tab=maintenance")
    expect(withoutOpenParam("?open=s1&tab=warranties&q=x")).toBe("?tab=warranties&q=x")
  })

  it("leaves no bare question mark", () => {
    expect(withoutOpenParam("?open=s1")).toBe("")
  })

  it("returns null when there is nothing to remove", () => {
    expect(withoutOpenParam("")).toBeNull()
    expect(withoutOpenParam("?tab=maintenance")).toBeNull()
    expect(withoutOpenParam("?opened=1")).toBeNull()
  })

  it("removes every open", () => {
    expect(withoutOpenParam("?open=a&open=b&tab=x")).toBe("?tab=x")
  })
})
