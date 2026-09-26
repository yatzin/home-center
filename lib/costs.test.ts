import { describe, expect, it } from "vitest"
import { CATEGORY_ORDER, categoriesFor, categoryColor, SERVICE_CATEGORY_VALUES } from "./costs"

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
