import { describe, expect, it } from "vitest"
import { CATEGORY_ORDER, categoriesFor, categoryColor, nestedByAsset, SERVICE_CATEGORY_VALUES } from "./costs"

describe("service categories", () => {
  it("offers medical categories only for people", () => {
    const person = categoriesFor("PERSON").map((c) => c.value)
    const house = categoriesFor("PROPERTY").map((c) => c.value)
    expect(person).toContain("OFFICE_VISIT")
    expect(person).toContain("OTHER")
    expect(person).not.toContain("REPAIR")
    expect(house).toContain("REPAIR")
    expect(house).not.toContain("OFFICE_VISIT")
  })

  it("keeps Other then Uncategorized at the end of the fixed order", () => {
    expect(CATEGORY_ORDER.slice(-2)).toEqual(["OTHER", "UNCATEGORIZED"])
  })

  it("gives every category a colour", () => {
    for (const value of SERVICE_CATEGORY_VALUES) expect(categoryColor(value)).toMatch(/^var\(--cost-/)
  })
})

describe("nestedByAsset", () => {
  const row = (assetType: "PROPERTY" | "EQUIPMENT" | "VEHICLE", assetId: string, cost: number) => ({
    id: `${assetType}-${assetId}-${cost}`,
    assetType,
    assetId,
    cost,
    date: new Date(2026, 0, 1),
    category: null,
    vendor: null,
    title: "t",
    mileageAtService: null,
  })
  const installed = new Map([["furnace", "home"]])

  it("rolls equipment into its property and lists it as a child", () => {
    const { top, children } = nestedByAsset(
      [row("PROPERTY", "home", 100), row("EQUIPMENT", "furnace", 40), row("VEHICLE", "car", 10)],
      installed
    )
    expect(top.get("PROPERTY:home")?.total).toBe(140)
    expect(top.has("EQUIPMENT:furnace")).toBe(false)
    expect(top.get("VEHICLE:car")?.total).toBe(10)
    const kids = children.get("PROPERTY:home")!
    expect(kids.get("PROPERTY:home")?.total).toBe(100)
    expect(kids.get("EQUIPMENT:furnace")?.total).toBe(40)
    expect(children.has("VEHICLE:car")).toBe(false)
  })

  it("leaves equipment with no property as its own entry", () => {
    const { top, children } = nestedByAsset([row("EQUIPMENT", "mower", 25)], installed)
    expect(top.get("EQUIPMENT:mower")?.total).toBe(25)
    expect(children.size).toBe(0)
  })
})
