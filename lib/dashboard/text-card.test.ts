import { describe, expect, it } from "vitest"
import { createFormatter, DEFAULT_REGIONAL } from "@/lib/regional"
import type { Due } from "@/lib/maintenance-due"
import {
  TEXT_ALIGNS,
  TEXT_DEFAULTS,
  TEXT_MAX,
  TEXT_STYLES,
  clampLines,
  clockTokenValues,
  dueTokenLinks,
  dueTokenValues,
  expiringTokenLinks,
  expiringTokenValues,
  isBareCard,
  isTextData,
  readTextConfig,
  textCardData,
  textConfigSchema,
  textSegmentsOf,
  userTokenValues,
} from "./text-card"

const fmt = createFormatter(DEFAULT_REGIONAL)

describe("textConfigSchema", () => {
  it("accepts every style, alignment and border", () => {
    for (const style of TEXT_STYLES) expect(textConfigSchema.safeParse({ style }).success, style).toBe(true)
    for (const align of TEXT_ALIGNS) expect(textConfigSchema.safeParse({ align }).success, align).toBe(true)
    expect(textConfigSchema.safeParse({ border: false }).success).toBe(true)
    expect(TEXT_STYLES).toEqual(["h1", "h2", "h3", "h4", "body", "small", "muted"])
    expect(TEXT_ALIGNS).toEqual(["left", "center", "right"])
  })

  it("fills the defaults for missing keys", () => {
    expect(TEXT_DEFAULTS).toEqual({ text: "Hello, {user}", style: "body", align: "left", border: true })
    expect(textConfigSchema.parse({})).toEqual(TEXT_DEFAULTS)
    expect(textConfigSchema.parse({ style: "h2" })).toEqual({ ...TEXT_DEFAULTS, style: "h2" })
  })

  it("drops unknown keys", () => {
    expect(textConfigSchema.parse({ text: "Hi", junk: 1, html: "<b>x</b>" })).toEqual({ ...TEXT_DEFAULTS, text: "Hi" })
  })

  it("caps the text at TEXT_MAX characters and rejects blank text", () => {
    expect(TEXT_MAX).toBe(500)
    expect(textConfigSchema.safeParse({ text: "x".repeat(500) }).success).toBe(true)
    expect(textConfigSchema.safeParse({ text: "x".repeat(501) }).success).toBe(false)
    expect(textConfigSchema.safeParse({ text: "" }).success).toBe(false)
    expect(textConfigSchema.safeParse({ text: "  \n\t " }).success).toBe(false)
    expect(textConfigSchema.safeParse({ text: "\nHi\n" }).success).toBe(true)
  })

  it("rejects values of the wrong kind", () => {
    expect(textConfigSchema.safeParse({ style: "h5" }).success).toBe(false)
    expect(textConfigSchema.safeParse({ style: "H1" }).success).toBe(false)
    expect(textConfigSchema.safeParse({ align: "justify" }).success).toBe(false)
    expect(textConfigSchema.safeParse({ border: "false" }).success).toBe(false)
    expect(textConfigSchema.safeParse({ text: 5 }).success).toBe(false)
  })
})

describe("readTextConfig", () => {
  it("reads a valid config as is", () => {
    const c = { text: "Hi {user}", style: "h1", align: "center", border: false }
    expect(readTextConfig(c)).toEqual(c)
  })

  it("falls back to the default key by key for anything missing or damaged", () => {
    expect(readTextConfig({})).toEqual(TEXT_DEFAULTS)
    expect(readTextConfig({ text: 3, style: "h9", align: "center", border: "no" })).toEqual({ ...TEXT_DEFAULTS, align: "center" })
    expect(readTextConfig({ text: "x".repeat(600) }).text).toBe("x".repeat(TEXT_MAX))
  })
})

describe("isBareCard", () => {
  it("is a text card with its border off, nothing else", () => {
    expect(isBareCard({ type: "text", config: { border: false } })).toBe(true)
    expect(isBareCard({ type: "text", config: { border: true } })).toBe(false)
    expect(isBareCard({ type: "text", config: {} })).toBe(false)
    expect(isBareCard({ type: "records", config: { border: false } })).toBe(false)
  })
})

describe("isTextData", () => {
  it("accepts { text: string } only", () => {
    expect(isTextData({ text: "Hi" })).toBe(true)
    expect(isTextData({ text: 1 })).toBe(false)
    expect(isTextData(null)).toBe(false)
    expect(isTextData("Hi")).toBe(false)
  })
})

describe("textCardData", () => {
  it("gives the segments and the same text as a string", () => {
    const d = textCardData("{overdue} overdue, {user}", { overdue: "3", user: "Mike" })
    expect(d.segments).toEqual([
      { text: "3", href: "/maintenance", title: "Open Maintenance", label: "3 overdue reminders" },
      { text: " overdue, Mike" },
    ])
    expect(d.text).toBe("3 overdue, Mike")
    // Plain JSON: survives the trip to the browser unchanged.
    expect(JSON.parse(JSON.stringify(d))).toEqual(d)
  })

  it("uses the dynamic links it is given", () => {
    const d = textCardData("{next_due}", { next_due: "Filter" }, { next_due: { href: "/assets/vehicles/v1", to: "Civic" } })
    expect(d.segments).toEqual([{ text: "Filter", href: "/assets/vehicles/v1", title: "Open Civic" }])
  })
})

describe("textSegmentsOf", () => {
  const link = { text: "3", href: "/maintenance", title: "Open Maintenance", label: "3 overdue reminders" }

  it("reads the segments of the card's data", () => {
    expect(textSegmentsOf({ text: "3 overdue", segments: [link, { text: " overdue" }] })).toEqual([link, { text: " overdue" }])
  })

  it("falls back to the plain text without segments", () => {
    expect(textSegmentsOf({ text: "Hi" })).toEqual([{ text: "Hi" }])
    expect(textSegmentsOf({ text: "" })).toEqual([])
    expect(textSegmentsOf(null)).toEqual([])
  })

  it("drops damaged segments and keeps a link only with a site path", () => {
    expect(
      textSegmentsOf({
        text: "x",
        segments: [{ text: 1 }, null, { text: "a", href: "https://evil.example", title: "t" }, { text: "b", href: "//x", title: "t" }, { text: "c", href: "/records" }],
      }),
    ).toEqual([{ text: "a" }, { text: "b" }, { text: "c", href: "/records", title: "" }])
  })
})

describe("dueTokenLinks", () => {
  const row = (assetType: "PROPERTY" | "VEHICLE" | "EQUIPMENT" | "PERSON", assetId: string, id = "s1", title = "Filter") => ({ s: { id, title, assetType, assetId } })

  it("links the most urgent reminder to its edit dialog on the item's Maintenance tab", () => {
    const link = { href: "/assets/equipment/e1?tab=maintenance&open=s1", to: "Filter reminder" }
    expect(dueTokenLinks([row("EQUIPMENT", "e1"), row("VEHICLE", "v1", "s2")])).toEqual({ next_due: link, next_due_date: link })
  })

  it("uses the Reminders tab for a person's reminder", () => {
    expect(dueTokenLinks([row("PERSON", "u1", "s9", "Flu shot")]).next_due).toEqual({ href: "/assets/people/u1?tab=reminders&open=s9", to: "Flu shot reminder" })
  })

  it("gives no links when nothing is due", () => {
    expect(dueTokenLinks([])).toEqual({})
  })
})

describe("expiringTokenValues / expiringTokenLinks", () => {
  const w = { id: "w1", productName: "Dishwasher coverage", expirationDate: new Date(Date.UTC(2026, 10, 20)), assetType: "EQUIPMENT" as const, assetId: "e1" }

  it("names the soonest-ending warranty and its stored UTC date in the regional format", () => {
    expect(expiringTokenValues(w, fmt)).toEqual({ next_expiring: "Dishwasher coverage", next_expiring_date: "Nov 20, 2026" })
  })

  it("gives the same date in any server time zone (the stored date is UTC midnight)", () => {
    const d = { ...w, expirationDate: new Date(Date.UTC(2027, 0, 1)) }
    expect(expiringTokenValues(d, fmt).next_expiring_date).toBe("Jan 1, 2027")
  })

  it("is empty when no warranty is ending", () => {
    expect(expiringTokenValues(undefined, fmt)).toEqual({ next_expiring: "", next_expiring_date: "" })
  })

  it("links both tokens to the warranty's edit dialog on its item's Warranties tab", () => {
    const link = { href: "/assets/equipment/e1?tab=warranties&open=w1", to: "Dishwasher coverage warranty" }
    expect(expiringTokenLinks(w)).toEqual({ next_expiring: link, next_expiring_date: link })
    expect(expiringTokenLinks(undefined)).toEqual({})
  })
})

describe("clampLines", () => {
  it("fits as many whole lines as the height allows, at least one", () => {
    // h1 lines are 28px, body 20px, small 16px.
    expect(clampLines(56, "h1")).toBe(2)
    expect(clampLines(55, "h1")).toBe(1)
    expect(clampLines(64, "body")).toBe(3)
    expect(clampLines(64, "small")).toBe(4)
    expect(clampLines(0, "body")).toBe(1)
    expect(clampLines(Number.NaN, "body")).toBe(1)
  })
})

describe("userTokenValues", () => {
  it("gives the first name and the full name", () => {
    expect(userTokenValues("Mike Dazzo")).toEqual({ user: "Mike", user_full: "Mike Dazzo" })
    expect(userTokenValues("  Ann  Lee ")).toEqual({ user: "Ann", user_full: "Ann Lee" })
  })

  it("gives nothing without a name", () => {
    expect(userTokenValues(null)).toEqual({ user: "", user_full: "" })
  })
})

describe("clockTokenValues", () => {
  it("gives today's date in the regional format, the weekday and the year", () => {
    const now = new Date(2026, 9, 27, 23, 30) // Tuesday 27 Oct 2026, late evening local time
    expect(clockTokenValues(now, fmt)).toEqual({ date: "Oct 27, 2026", weekday: "Tuesday", year: "2026" })
    const iso = createFormatter({ ...DEFAULT_REGIONAL, dateFormat: "ISO" })
    expect(clockTokenValues(new Date(2026, 0, 1, 0, 5), iso)).toEqual({ date: "2026-01-01", weekday: "Thursday", year: "2026" })
  })
})

describe("dueTokenValues", () => {
  const due = (over: Partial<Due>): Due => ({
    overdue: false,
    dueSoon: false,
    daysLeft: 10,
    milesLeft: null,
    reason: null,
    meterUnit: null,
    ...over,
  })
  const item = (title: string, nextDueDate: Date | null, d: Partial<Due>) => ({ s: { title, nextDueDate }, due: due(d) })

  it("counts overdue and due-soon items apart, and names the most urgent", () => {
    const list = [
      item("Oil change", null, { overdue: true, daysLeft: null, milesLeft: -300, reason: "mileage" }),
      item("Gutters", new Date(Date.UTC(2026, 9, 20)), { overdue: true, daysLeft: -7 }),
      item("Filter", new Date(Date.UTC(2026, 10, 3)), { dueSoon: true, daysLeft: 7 }),
      item("Smoke alarm", new Date(Date.UTC(2026, 10, 20)), { daysLeft: 24 }),
    ]
    expect(dueTokenValues(list, fmt)).toEqual({ overdue: "2", due_soon: "2", next_due: "Oil change", next_due_date: "" })
    expect(dueTokenValues(list.slice(1), fmt)).toEqual({ overdue: "1", due_soon: "2", next_due: "Gutters", next_due_date: "Oct 20, 2026" })
  })

  it("gives zero counts and no next item when nothing is due", () => {
    expect(dueTokenValues([], fmt)).toEqual({ overdue: "0", due_soon: "0", next_due: "", next_due_date: "" })
  })
})
