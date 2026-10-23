import { describe, expect, it } from "vitest"
import type { Features } from "@/lib/features"
import { configFieldsFor } from "./card-types"
import { configFormSchema, offeredOptions, toFormValues, visibleFields, type ConfigFormContext } from "./config-form"

const ALL_ON: Features = { health: true, rooms: true, equipmentTab: true, customizedDashboards: true }
const ctx: ConfigFormContext = {
  features: ALL_ON,
  items: {
    PROPERTY: [
      { id: "p1", name: "Cabin" },
      { id: "p2", name: "Home" },
    ],
    VEHICLE: [{ id: "v1", name: "Truck" }],
    EQUIPMENT: [],
    PERSON: [{ id: "h1", name: "Ann" }],
  },
}
const healthOff: ConfigFormContext = { ...ctx, features: { ...ALL_ON, health: false }, items: { ...ctx.items!, PERSON: [] } }

const parse = (type: string, values: Record<string, string>, c = ctx, original: Record<string, unknown> = {}) =>
  configFormSchema(type, c, original).safeParse(values)

const errorsOf = (r: ReturnType<typeof parse>) =>
  r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]))

describe("toFormValues", () => {
  it("fills every field, from the config, then the type's default config, then the field default", () => {
    expect(toFormValues("properties", { limit: 3, itemId: "p2" }, ctx)).toEqual({ itemId: "p2", limit: "3" })
    expect(toFormValues("properties", {}, ctx)).toEqual({ itemId: "", limit: "7" })
    expect(toFormValues("reminders", { windowDays: 14 }, ctx)).toEqual({ windowDays: "14", assetType: "", limit: "6" })
    expect(toFormValues("spending-trend", {}, ctx)).toEqual({ range: "ytd" })
    expect(toFormValues("records", {}, ctx)).toEqual({})
  })

  it("keeps a deleted item's id, so the dialog can say it is gone", () => {
    expect(toFormValues("properties", { itemId: "gone" }, ctx).itemId).toBe("gone")
  })

  it("maps a choice that is not offered (People with Health off) to all", () => {
    expect(toFormValues("reminders", { assetType: "PERSON" }, healthOff).assetType).toBe("")
    expect(toFormValues("reminders", { assetType: "PERSON" }, ctx).assetType).toBe("PERSON")
  })
})

describe("configFormSchema", () => {
  it("turns valid values into a config the type's schema accepts", () => {
    expect(parse("properties", { itemId: "", limit: "9" })).toMatchObject({ success: true, data: { limit: 9 } })
    expect(parse("properties", { itemId: "p1", limit: "7" }, ctx, { limit: 7 })).toMatchObject({
      success: true,
      data: { itemId: "p1", limit: 7 },
    })
    expect(parse("reminders", { windowDays: "14", assetType: "", limit: "6" })).toMatchObject({
      success: true,
      data: { windowDays: 14, limit: 6 },
    })
    const r = parse("reminders", { windowDays: "14", assetType: "", limit: "6" })
    expect(r.success && "assetType" in r.data).toBe(false)
    expect(parse("spending-breakdown", { range: "12m" })).toMatchObject({ success: true, data: { range: "12m" } })
    expect(parse("records", {})).toMatchObject({ success: true, data: {} })
  })

  it("'All' leaves the item unset", () => {
    const r = parse("rooms", { itemId: "", limit: "18" })
    expect(r).toMatchObject({ success: true, data: { limit: 18 } })
    expect(r.success && "itemId" in r.data).toBe(false)
  })

  it("rejects numbers out of range, blank or not whole, with a message on that field", () => {
    expect(errorsOf(parse("reminders", { windowDays: "0", assetType: "", limit: "6" }))).toHaveProperty("windowDays")
    expect(errorsOf(parse("reminders", { windowDays: "366", assetType: "", limit: "6" }))).toHaveProperty("windowDays")
    expect(errorsOf(parse("reminders", { windowDays: "", assetType: "", limit: "6" }))).toHaveProperty("windowDays")
    expect(errorsOf(parse("reminders", { windowDays: "1.5", assetType: "", limit: "6" }))).toHaveProperty("windowDays")
    expect(errorsOf(parse("reminders", { windowDays: "abc", assetType: "", limit: "51" }))).toMatchObject({
      windowDays: expect.any(String),
      limit: expect.any(String),
    })
    expect(parse("reminders", { windowDays: " 365 ", assetType: "", limit: "1" }).success).toBe(true)
  })

  it("rejects an item that no longer exists (or never did)", () => {
    const e = errorsOf(parse("properties", { itemId: "gone", limit: "7" }))
    expect(e.itemId).toMatch(/no longer exists/)
    expect(parse("properties", { itemId: "v1", limit: "7" }).success).toBe(false)
  })

  it("rejects choices that are not offered", () => {
    expect(parse("spending-trend", { range: "" }).success).toBe(false)
    expect(parse("spending-trend", { range: "5y" }).success).toBe(false)
    expect(parse("reminders", { windowDays: "30", assetType: "PERSON", limit: "6" }).success).toBe(true)
    expect(parse("reminders", { windowDays: "30", assetType: "PERSON", limit: "6" }, healthOff).success).toBe(false)
  })

  it("rejects People items with Health off (no list is sent)", () => {
    expect(parse("people", { itemId: "h1", limit: "18" }, healthOff).success).toBe(false)
  })

  it("without item lists, only 'All' is valid", () => {
    const none: ConfigFormContext = { ...ctx, items: null }
    expect(parse("properties", { itemId: "p1", limit: "7" }, none).success).toBe(false)
    expect(parse("properties", { itemId: "", limit: "7" }, none).success).toBe(true)
  })

  it("a hidden field (limit while one item is chosen) keeps its old valid value and is not validated", () => {
    expect(parse("properties", { itemId: "p1", limit: "oops" }, ctx, { limit: 4 })).toMatchObject({
      success: true,
      data: { itemId: "p1", limit: 4 },
    })
    const r = parse("properties", { itemId: "p1", limit: "oops" }, ctx, {})
    expect(r.success && "limit" in r.data).toBe(false)
  })
})

describe("visibleFields / offeredOptions", () => {
  it("hides the asset limit while one item is chosen, but not the rooms limit", () => {
    expect(visibleFields("properties", { itemId: "p1", limit: "7" }).map((f) => f.key)).toEqual(["itemId"])
    expect(visibleFields("properties", { itemId: "", limit: "7" }).map((f) => f.key)).toEqual(["itemId", "limit"])
    expect(visibleFields("rooms", { itemId: "p1", limit: "7" }).map((f) => f.key)).toEqual(["itemId", "limit"])
  })

  it("drops options whose feature is off", () => {
    const f = configFieldsFor("reminders").find((x) => x.kind === "choice")!
    if (f.kind !== "choice") throw new Error("expected a choice")
    expect(offeredOptions(f, ALL_ON).map((o) => o.value)).toContain("PERSON")
    expect(offeredOptions(f, { ...ALL_ON, health: false }).map((o) => o.value)).not.toContain("PERSON")
  })
})
