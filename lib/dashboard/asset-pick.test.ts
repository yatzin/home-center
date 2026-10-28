import { describe, expect, it } from "vitest"
import { assetPickSchema, assetPickValue, parseAssetPick } from "./asset-pick"

describe("asset pick", () => {
  it("round-trips a type and id", () => {
    expect(parseAssetPick(assetPickValue("EQUIPMENT", "cm123abc"))).toEqual({ type: "EQUIPMENT", id: "cm123abc" })
    expect(parseAssetPick("PERSON:p_1-x")).toEqual({ type: "PERSON", id: "p_1-x" })
  })
  it("is null for unset or malformed values", () => {
    for (const v of [undefined, null, "", "EQUIPMENT", "EQUIPMENT:", "ROOM:abc", "equipment:abc", "PERSON:a b", "PERSON:a:b", 5, "PERSON:" + "x".repeat(65)]) {
      expect(parseAssetPick(v)).toBeNull()
    }
  })
  it("the schema accepts exactly what parses", () => {
    expect(assetPickSchema.safeParse("VEHICLE:abc").success).toBe(true)
    expect(assetPickSchema.safeParse("VEHICLE").success).toBe(false)
  })
})
