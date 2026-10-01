import { describe, expect, it } from "vitest"
import { isHealthPath, ownedWhere } from "./features"

describe("ownedWhere", () => {
  it("adds nothing while Health is on", () => {
    expect(ownedWhere({ health: true })).toEqual({})
  })
  it("leaves out people's records while Health is off", () => {
    expect(ownedWhere({ health: false })).toEqual({ assetType: { not: "PERSON" } })
  })
})

describe("isHealthPath", () => {
  it("matches the health pages and their children", () => {
    expect(isHealthPath("/assets/people")).toBe(true)
    expect(isHealthPath("/assets/people/abc?tab=health")).toBe(true)
    expect(isHealthPath("/providers")).toBe(true)
    expect(isHealthPath("/insurance?open=1")).toBe(true)
  })
  it("leaves the rest alone", () => {
    expect(isHealthPath("/assets/properties")).toBe(false)
    expect(isHealthPath("/insurance-claims")).toBe(false)
  })
})
