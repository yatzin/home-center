import { describe, expect, it } from "vitest"
import { configItemId, configLimit, hiddenByHealth, upcomingConfig } from "./gating"

const features = (health: boolean) => ({ health, rooms: true, equipmentTab: true })

describe("hiddenByHealth", () => {
  it("hides person-owned rows when Health is off", () => {
    expect(hiddenByHealth("PERSON", features(false))).toBe(true)
  })
  it("passes people with Health on, and every other type or no filter", () => {
    expect(hiddenByHealth("PERSON", features(true))).toBe(false)
    expect(hiddenByHealth("VEHICLE", features(false))).toBe(false)
    expect(hiddenByHealth(null, features(false))).toBe(false)
  })
})

describe("upcomingConfig", () => {
  const defaults = { windowDays: 30, limit: 6 }
  it("uses the defaults for an empty config", () => {
    expect(upcomingConfig({}, defaults)).toEqual({ windowDays: 30, limit: 6, assetType: null })
  })
  it("keeps valid values and a known asset type", () => {
    expect(upcomingConfig({ windowDays: 90, limit: 10, assetType: "PERSON" }, defaults)).toEqual({ windowDays: 90, limit: 10, assetType: "PERSON" })
  })
  it("clamps to the upper bounds", () => {
    expect(upcomingConfig({ windowDays: 9999, limit: 500 }, defaults)).toMatchObject({ windowDays: 365, limit: 50 })
  })
  it("falls back for below-range, non-integer, string, null and unknown values", () => {
    for (const bad of [0, -3, 1.5, NaN, Infinity, "14", null, undefined, {}]) {
      expect(upcomingConfig({ windowDays: bad, limit: bad, assetType: bad }, defaults)).toEqual({ windowDays: 30, limit: 6, assetType: null })
    }
    expect(upcomingConfig({ assetType: "ROOM" }, defaults).assetType).toBeNull()
  })
})

describe("configLimit", () => {
  it("defaults to 7, clamps to 50, rejects non-integers", () => {
    expect(configLimit({})).toBe(7)
    expect(configLimit({ limit: 12 })).toBe(12)
    expect(configLimit({ limit: 80 })).toBe(50)
    for (const bad of [0, -1, 2.5, "9", null]) expect(configLimit({ limit: bad })).toBe(7)
  })
})

describe("configItemId", () => {
  it("returns a non-empty string id, else null", () => {
    expect(configItemId({ itemId: "abc" })).toBe("abc")
    for (const bad of ["", 5, null, undefined]) expect(configItemId({ itemId: bad })).toBeNull()
  })
})
