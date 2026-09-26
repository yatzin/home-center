import { describe, expect, it } from "vitest"
import { resolveAssetId, type AssetNames } from "./asset-ids"
import { ToolInputError } from "./query"

const names: AssetNames = {
  PROPERTY: { h1: "Main House" },
  VEHICLE: { v1: "Civic", v2: "Tacoma" },
  EQUIPMENT: { e1: "Refrigerator", e2: "Refrigerator" },
  PERSON: { p1: "Anna" },
}

describe("resolveAssetId", () => {
  it("accepts known ids of any asset type, including people", () => {
    expect(resolveAssetId(names, "v1")).toBe("v1")
    expect(resolveAssetId(names, "p1")).toBe("p1")
    expect(resolveAssetId(names, "vehicle:v2")).toBe("v2")
  })

  it("maps an exact, unambiguous name to its id", () => {
    expect(resolveAssetId(names, "civic")).toBe("v1")
    expect(resolveAssetId(names, "VEHICLE: Tacoma")).toBe("v2")
    expect(resolveAssetId(names, "anna", ["PERSON"])).toBe("p1")
  })

  it("rejects unknown ids, ambiguous names and ids of another type", () => {
    expect(() => resolveAssetId(names, "nope")).toThrow('Unknown asset id "nope". Use search to get ids.')
    expect(() => resolveAssetId(names, "Refrigerator")).toThrow(ToolInputError)
    expect(() => resolveAssetId(names, "civ")).toThrow(ToolInputError)
    expect(() => resolveAssetId(names, "v1", ["PERSON"])).toThrow(ToolInputError)
  })
})
