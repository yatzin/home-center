import { describe, expect, it } from "vitest"
import type { Features } from "@/lib/features"
import { configFieldsFor } from "./card-types"
import { configFormSchema, offeredOptions, toFormValues, visibleFields, type ConfigFormContext } from "./config-form"

const ALL_ON: Features = { health: true, rooms: true, equipmentTab: true }
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
    expect(toFormValues("spending-trend", {}, ctx)).toEqual({ range: "ytd", months: "12" })
    expect(toFormValues("spending-trend", { range: "months", months: 5 }, ctx)).toEqual({ range: "months", months: "5" })
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
    expect(parse("spending-breakdown", { range: "12m", months: "12" })).toMatchObject({ success: true, data: { range: "12m" } })
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

describe("text card form", () => {
  const values = { text: "Hello, {user}", style: "body", align: "left", border: "true" }

  it("starts from the config, then the type's defaults; the border travels as 'true'/'false'", () => {
    expect(toFormValues("text", {}, ctx)).toEqual(values)
    expect(toFormValues("text", { text: "Hi\nthere", style: "h2", align: "center", border: false }, ctx)).toEqual({
      text: "Hi\nthere",
      style: "h2",
      align: "center",
      border: "false",
    })
    // Damaged values fall back to the defaults.
    expect(toFormValues("text", { text: 4, style: "h9", border: "nope" }, ctx)).toEqual(values)
  })

  it("turns valid values into a full config", () => {
    expect(parse("text", { ...values, style: "h1", border: "false" })).toMatchObject({
      success: true,
      data: { text: "Hello, {user}", style: "h1", align: "left", border: false },
    })
  })

  it("keeps the text as typed: line breaks and surrounding spaces stay", () => {
    const r = parse("text", { ...values, text: "  Line one\nLine two  " })
    expect(r.success && r.data.text).toBe("  Line one\nLine two  ")
  })

  it("rejects blank text and text over 500 characters, on the text field", () => {
    expect(errorsOf(parse("text", { ...values, text: "" })).text).toMatch(/Enter some text/)
    expect(errorsOf(parse("text", { ...values, text: " \n " })).text).toMatch(/Enter some text/)
    expect(errorsOf(parse("text", { ...values, text: "x".repeat(501) })).text).toMatch(/500/)
    expect(parse("text", { ...values, text: "x".repeat(500) }).success).toBe(true)
  })

  it("accepts unknown {tokens}: they are a warning, not an error", () => {
    expect(parse("text", { ...values, text: "Hi {usr}" }).success).toBe(true)
  })

  it("rejects styles, alignments and border values that are not offered", () => {
    expect(errorsOf(parse("text", { ...values, style: "h5" }))).toHaveProperty("style")
    expect(errorsOf(parse("text", { ...values, align: "" }))).toHaveProperty("align")
    expect(errorsOf(parse("text", { ...values, border: "yes" }))).toHaveProperty("border")
  })
})

describe("asset field (Activity)", () => {
  it("starts unset, keeps a stored pick (even a deleted one) and defaults the range", () => {
    expect(toFormValues("activity", {}, ctx)).toEqual({ asset: "", months: "12" })
    expect(toFormValues("activity", { asset: "VEHICLE:v1", months: 6 }, ctx)).toEqual({ asset: "VEHICLE:v1", months: "6" })
    expect(toFormValues("activity", { asset: "VEHICLE:gone" }, ctx).asset).toBe("VEHICLE:gone")
  })
  it("accepts an asset of any listed type, or none", () => {
    expect(parse("activity", { asset: "VEHICLE:v1", months: "12" })).toMatchObject({ success: true, data: { asset: "VEHICLE:v1", months: 12 } })
    expect(parse("activity", { asset: "PROPERTY:p2", months: "6" }).success).toBe(true)
    const none = parse("activity", { asset: "", months: "12" })
    expect(none.success && "asset" in none.data).toBe(false)
  })
  it("rejects an asset that no longer exists, a wrong shape, or a person", () => {
    expect(errorsOf(parse("activity", { asset: "VEHICLE:gone", months: "12" })).asset).toMatch(/no longer exists/)
    expect(parse("activity", { asset: "EQUIPMENT:v1", months: "12" }).success).toBe(false)
    expect(parse("activity", { asset: "v1", months: "12" }).success).toBe(false)
    expect(parse("activity", { asset: "PERSON:h1", months: "12" }).success).toBe(false) // people have their own card
  })
})

describe("visits calendar fields", () => {
  it("picks one person or all people", () => {
    expect(parse("visits-heatmap", { itemId: "h1", months: "6" })).toMatchObject({ success: true, data: { itemId: "h1", months: 6 } })
    const all = parse("visits-heatmap", { itemId: "", months: "12" })
    expect(all.success && "itemId" in all.data).toBe(false)
    expect(errorsOf(parse("visits-heatmap", { itemId: "gone", months: "12" })).itemId).toMatch(/no longer exists/)
    expect(parse("visits-heatmap", { itemId: "h1", months: "12" }, healthOff).success).toBe(false)
  })
})

describe("observations calendar fields", () => {
  it("picks one person or all people", () => {
    expect(parse("observations-heatmap", { itemId: "h1", months: "12" })).toMatchObject({ success: true, data: { itemId: "h1" } })
    const all = parse("observations-heatmap", { itemId: "", months: "6" })
    expect(all.success && "itemId" in all.data).toBe(false)
    expect(errorsOf(parse("observations-heatmap", { itemId: "gone", months: "6" })).itemId).toMatch(/no longer exists/)
  })
})

describe("a period of X months", () => {
  it("shows the month input only for \"Last X months\"", () => {
    const keys = (range: string) => visibleFields("spending-trend", { range, months: "12" }).map((f) => f.key)
    expect(keys("ytd")).toEqual(["range"])
    expect(keys("12m")).toEqual(["range"])
    expect(keys("months")).toEqual(["range", "months"])
  })

  it("takes a typed month count, one to sixty, only while it is shown", () => {
    expect(parse("spending-breakdown", { range: "months", months: "18" })).toMatchObject({ success: true, data: { range: "months", months: 18 } })
    expect(errorsOf(parse("spending-breakdown", { range: "months", months: "0" })).months).toMatch(/1 to 60/)
    expect(errorsOf(parse("spending-breakdown", { range: "months", months: "61" })).months).toMatch(/1 to 60/)
    expect(errorsOf(parse("spending-breakdown", { range: "months", months: "x" })).months).toMatch(/whole number/)
    expect(errorsOf(parse("spending-breakdown", { range: "months", months: "2.5" })).months).toMatch(/whole number/)
    // Hidden (this year): not validated, and an earlier valid value is kept.
    expect(parse("spending-breakdown", { range: "ytd", months: "oops" }, ctx, { months: 9 })).toMatchObject({ success: true, data: { range: "ytd", months: 9 } })
    const dropped = parse("spending-breakdown", { range: "ytd", months: "oops" }, ctx, {})
    expect(dropped.success && "months" in dropped.data).toBe(false)
  })

  it("the heat calendars and planned spend take a month count directly", () => {
    expect(parse("activity", { asset: "", months: "1" })).toMatchObject({ success: true, data: { months: 1 } })
    expect(parse("activity", { asset: "", months: "36" })).toMatchObject({ success: true, data: { months: 36 } })
    expect(parse("activity", { asset: "", months: "37" }).success).toBe(false)
    expect(parse("observations-heatmap", { itemId: "", months: "24" })).toMatchObject({ success: true, data: { months: 24 } })
    expect(parse("planned-spend", { months: "24" })).toMatchObject({ success: true, data: { months: 24 } })
    expect(parse("planned-spend", { months: "25" }).success).toBe(false)
    expect(parse("planned-spend", { months: "0" }).success).toBe(false)
  })
})
