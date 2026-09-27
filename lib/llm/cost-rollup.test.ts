import { describe, expect, it } from "vitest"
import { rollUpToProperty } from "./cost-rollup"

const equipmentProperty = new Map([["furnace", "house"], ["dock-lift", "cabin"]])
const rows = [
  { id: "1", assetType: "PROPERTY", assetId: "house", cost: 1450 },
  { id: "2", assetType: "EQUIPMENT", assetId: "furnace", cost: 189 },
  { id: "3", assetType: "EQUIPMENT", assetId: "dock-lift", cost: 300 },
  { id: "4", assetType: "EQUIPMENT", assetId: "loose-tool", cost: 20 },
  { id: "5", assetType: "VEHICLE", assetId: "truck", cost: 60 },
]

describe("rollUpToProperty", () => {
  it("moves equipment rows onto their property when that property is wanted", () => {
    const out = rollUpToProperty(rows, equipmentProperty, (p) => p === "house")
    expect(out.map((r) => [r.id, r.assetType, r.assetId])).toEqual([
      ["1", "PROPERTY", "house"],
      ["2", "PROPERTY", "house"],
      ["3", "EQUIPMENT", "dock-lift"],
      ["4", "EQUIPMENT", "loose-tool"],
      ["5", "VEHICLE", "truck"],
    ])
    expect(out[1].viaEquipmentId).toBe("furnace")
  })

  it("leaves equipment without a property alone", () => {
    const out = rollUpToProperty(rows, equipmentProperty, () => true)
    expect(out.find((r) => r.id === "4")).toMatchObject({ assetType: "EQUIPMENT", assetId: "loose-tool" })
  })
})
