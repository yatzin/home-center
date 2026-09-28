import { describe, expect, it } from "vitest"
import type { AssetType } from "@/app/generated/prisma/enums"
import { matchAsset, resolveAssetId, type AssetEntry, type AssetNames } from "./asset-ids"
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

describe("matchAsset", () => {
  const catalog: AssetEntry[] = [
    { type: "PROPERTY", id: "h1", name: "Lake Cabin" },
    { type: "VEHICLE", id: "v1", name: "Commuter", aka: "2021 Honda Civic Sport" },
    { type: "VEHICLE", id: "v2", name: "Family Van", aka: "2020 Honda Odyssey" },
    { type: "EQUIPMENT", id: "e1", name: "Water Heater" },
    { type: "EQUIPMENT", id: "e2", name: "Cabin Water Heater" },
    { type: "EQUIPMENT", id: "e3", name: "Gas Furnace" },
    { type: "PERSON", id: "p1", name: "Sam Rivera" },
  ]
  const found = (raw: string, types?: AssetType[]) => {
    const m = matchAsset(catalog, raw, types)
    return m.kind === "found" ? m.asset.id : m.kind
  }

  it("takes ids, typed ids and exact names", () => {
    expect(found("v2")).toBe("v2")
    expect(found("vehicle:v1")).toBe("v1")
    expect(found("lake cabin")).toBe("h1")
  })

  it("prefers an exact name over longer names that contain it", () => {
    expect(found("Water Heater")).toBe("e1")
  })

  it("matches the words the user used, including make and model", () => {
    expect(found("the furnace")).toBe("e3")
    expect(found("Civic")).toBe("v1")
    expect(found("our Honda Odyssey")).toBe("v2")
    expect(found("Sam")).toBe("p1")
    expect(found("Sam's")).toBe("p1")
  })

  it("lists every match when a name fits several", () => {
    const m = matchAsset(catalog, "Honda")
    expect(m.kind).toBe("ambiguous")
    expect(m.kind === "ambiguous" && m.matches.map((a) => a.id)).toEqual(["v1", "v2"])
  })

  it("reports no match", () => {
    expect(found("boat")).toBe("none")
    expect(found("the")).toBe("none")
  })

  it("looks in the given types first, then everywhere when the type hint was wrong", () => {
    expect(found("Lake Cabin", ["EQUIPMENT"])).toBe("h1")
    expect(found("cabin", ["PROPERTY"])).toBe("h1")
  })
})
