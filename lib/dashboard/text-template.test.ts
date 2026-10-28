import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import type { Features } from "@/lib/features"
import { assetSegment } from "@/lib/assets"
import {
  TEXT_TOKEN_GROUPS,
  TEXT_TOKENS,
  firstName,
  parseTokens,
  renderSegments,
  renderText,
  sampleLinks,
  sampleValues,
  segmentsText,
  textNeeds,
  textToken,
  tokenAvailable,
  tokenNote,
  type TextNeed,
  type TextSegment,
} from "./text-template"

const ALL_ON: Features = { health: true, rooms: true, equipmentTab: true }
const HEALTH_OFF: Features = { ...ALL_ON, health: false }

describe("TEXT_TOKENS", () => {
  it("is exactly the decided token set, each name once", () => {
    const names = TEXT_TOKENS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect([...names].sort()).toEqual(
      [
        "user",
        "user_full",
        "date",
        "weekday",
        "year",
        "overdue",
        "due_soon",
        "next_due",
        "next_due_date",
        "expiring_warranties",
        "next_expiring",
        "next_expiring_date",
        "intake",
        "spend_ytd",
        "spend_month",
        "properties",
        "vehicles",
        "equipment",
        "records",
        "people",
      ].sort(),
    )
  })

  it("puts every token in one of the four groups, in group order", () => {
    expect(TEXT_TOKEN_GROUPS).toEqual(["You & time", "Attention", "Money", "Counts"])
    for (const t of TEXT_TOKENS) {
      expect(TEXT_TOKEN_GROUPS).toContain(t.group)
      expect(t.help.length).toBeGreaterThan(0)
      expect(t.help).not.toMatch(/\n/)
    }
    const order = TEXT_TOKENS.map((t) => TEXT_TOKEN_GROUPS.indexOf(t.group))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it("is frozen", () => {
    expect(Object.isFrozen(TEXT_TOKENS)).toBe(true)
    for (const t of TEXT_TOKENS) expect(Object.isFrozen(t)).toBe(true)
  })
})

describe("TEXT_TOKENS links", () => {
  // The decided destinations. {next_due}, {next_due_date}, {next_expiring} and
  // {next_expiring_date} link to one item's edit dialog, which only the loader
  // knows (no static href).
  const EXPECTED: Record<string, string | null> = {
    user: null,
    user_full: null,
    date: null,
    weekday: null,
    year: null,
    overdue: "/maintenance",
    due_soon: "/maintenance",
    next_due: "dynamic",
    next_due_date: "dynamic",
    expiring_warranties: "/warranties",
    next_expiring: "dynamic",
    next_expiring_date: "dynamic",
    intake: "/intake",
    spend_ytd: "/costs",
    spend_month: "/costs",
    properties: `/assets/${assetSegment.PROPERTY}`,
    vehicles: `/assets/${assetSegment.VEHICLE}`,
    equipment: `/assets/${assetSegment.EQUIPMENT}`,
    records: "/records",
    people: `/assets/${assetSegment.PERSON}`,
  }

  it.each(TEXT_TOKENS.map((t) => [t.name, t] as const))("{%s} links where decided", (name, t) => {
    const want = EXPECTED[name]
    if (want === null) {
      expect(t.linksTo).toBeUndefined()
      expect(t.href).toBeUndefined()
    } else if (want === "dynamic") {
      expect(t.linksTo).toBeTruthy()
      expect(t.href).toBeUndefined()
    } else {
      expect(t.href).toBe(want)
      expect(t.linksTo).toBeTruthy()
    }
  })

  it("links only to pages that exist under app/(app)", () => {
    for (const t of TEXT_TOKENS.filter((t) => t.href)) {
      const page = path.join(process.cwd(), "app", "(app)", ...t.href!.split("/").filter(Boolean), "page.tsx")
      expect(existsSync(page), `${t.href} -> ${page}`).toBe(true)
    }
  })

  it("gives every linked count or amount a noun for its accessible name, and only those", () => {
    for (const t of TEXT_TOKENS) {
      if (t.noun !== undefined) {
        expect(t.linksTo, t.name).toBeTruthy()
        expect(t.noun.length).toBeGreaterThan(0)
      }
    }
    for (const name of ["overdue", "due_soon", "expiring_warranties", "intake", "spend_ytd", "spend_month", "properties", "vehicles", "equipment", "records", "people"]) {
      expect(textToken(name)?.noun, name).toBeTruthy()
    }
    expect(textToken("next_due")?.noun).toBeUndefined()
    expect(textToken("next_expiring")?.noun).toBeUndefined()
  })

  it("says in the Links to text that the item's own dialog opens", () => {
    expect(textToken("next_due")?.linksTo).toBe("Maintenance (opens that reminder)")
    expect(textToken("next_due_date")?.linksTo).toBe("Maintenance (opens that reminder)")
    expect(textToken("next_expiring")?.linksTo).toBe("Warranties (opens that warranty)")
    expect(textToken("next_expiring_date")?.linksTo).toBe("Warranties (opens that warranty)")
    expect(textToken("expiring_warranties")?.linksTo).toBe("Warranties")
  })

  it("puts the two warranty tokens in the Attention group and has them query the next warranty only", () => {
    for (const name of ["next_expiring", "next_expiring_date"]) {
      expect(textToken(name)?.group).toBe("Attention")
      expect(textToken(name)?.source).toBe("nextWarranty")
    }
  })
})

describe("renderSegments", () => {
  const values = {
    user: "Mike",
    user_full: "Mike Dazzo",
    date: "Oct 27, 2026",
    weekday: "Tuesday",
    year: "2026",
    overdue: "3",
    due_soon: "5",
    next_due: "Replace humidifier water panel",
    next_due_date: "Aug 2, 2026",
    expiring_warranties: "1",
    next_expiring: "Dishwasher coverage",
    next_expiring_date: "Nov 20, 2026",
    intake: "2",
    spend_ytd: "$10,346.24",
    spend_month: "$385.00",
    properties: "2",
    vehicles: "3",
    equipment: "14",
    records: "86",
    people: "4",
  }
  const links = {
    next_due: { href: "/assets/equipment/abc", to: "Humidifier" },
    next_due_date: { href: "/assets/equipment/abc", to: "Humidifier" },
    next_expiring: { href: "/assets/equipment/abc?tab=warranties&open=w1", to: "Dishwasher coverage" },
    next_expiring_date: { href: "/assets/equipment/abc?tab=warranties&open=w1", to: "Dishwasher coverage" },
  }
  const link = (s: TextSegment) => ("href" in s ? s : null)

  it("makes every linked token a link whose text is exactly its value, and the rest plain text", () => {
    for (const t of TEXT_TOKENS) {
      const segs = renderSegments(`<{${t.name}}>`, values, links)
      const value = values[t.name as keyof typeof values]
      if (t.linksTo) {
        expect(segs, t.name).toHaveLength(3)
        expect(segs[0]).toEqual({ text: "<" })
        expect(segs[2]).toEqual({ text: ">" })
        const l = link(segs[1])!
        expect(l, t.name).not.toBeNull()
        expect(l.text).toBe(value)
        expect(l.href).toBe(t.href ?? links[t.name as keyof typeof links].href)
      } else {
        expect(segs, t.name).toEqual([{ text: `<${value}>` }])
      }
    }
  })

  it("titles a link with its destination and labels numbers and amounts with their noun", () => {
    expect(renderSegments("{overdue}", values)).toEqual([
      { text: "3", href: "/maintenance", title: "Open Maintenance", label: "3 overdue reminders" },
    ])
    expect(renderSegments("{spend_ytd}", values)).toEqual([
      { text: "$10,346.24", href: "/costs", title: "Open Costs", label: "$10,346.24 spent this year" },
    ])
    expect(renderSegments("{next_due}", values, links)).toEqual([
      { text: "Replace humidifier water panel", href: "/assets/equipment/abc", title: "Open Humidifier" },
    ])
  })

  it("links {next_due} and {next_due_date} to the item from the data, and leaves them plain without it", () => {
    const segs = renderSegments("Next: {next_due} on {next_due_date}.", values, links)
    expect(segs).toEqual([
      { text: "Next: " },
      { text: "Replace humidifier water panel", href: "/assets/equipment/abc", title: "Open Humidifier" },
      { text: " on " },
      { text: "Aug 2, 2026", href: "/assets/equipment/abc", title: "Open Humidifier" },
      { text: "." },
    ])
    expect(renderSegments("Next: {next_due}.", values)).toEqual([{ text: "Next: Replace humidifier water panel." }])
  })

  it("keeps an edit-dialog href (query string) as a site path, and puts the comma/space rule around it", () => {
    const href = "/assets/vehicles/v1?tab=maintenance&open=s1"
    const l = { next_due: { href, to: "Oil reminder" } }
    expect(renderSegments("Due: {next_due}.", { next_due: "Oil" }, l)).toEqual([
      { text: "Due: " },
      { text: "Oil", href, title: "Open Oil reminder" },
      { text: "." },
    ])
    // An empty value after a link takes only the plain ", " before it, never the link's text.
    expect(renderSegments("{next_expiring}, {next_expiring_date}", { next_expiring: "Roof", next_expiring_date: "" }, {
      next_expiring: { href, to: "Roof warranty" },
    })).toEqual([{ text: "Roof", href, title: "Open Roof warranty" }])
    // Empty value after plain text takes the ", " with it.
    expect(renderSegments("Ends soon: {next_expiring}", { next_expiring: "" })).toEqual([{ text: "Ends soon:" }])
    expect(renderSegments("Welcome, {next_expiring}", { next_expiring: "" })).toEqual([{ text: "Welcome" }])
  })

  it("never links an unlinked token, even when given a link for it", () => {
    expect(renderSegments("Hi {user}", values, { user: { href: "/settings", to: "Settings" } })).toEqual([{ text: "Hi Mike" }])
  })

  it("ignores a dynamic link that is not a site path", () => {
    for (const href of ["https://evil.example", "//evil.example", "javascript:alert(1)", ""]) {
      expect(renderSegments("{next_due}", values, { next_due: { href, to: "x" } })).toEqual([{ text: "Replace humidifier water panel" }])
    }
  })

  it("merges plain text and plain tokens into one segment", () => {
    expect(renderSegments("Hi {user}, it's {weekday} {date} in {year}", values)).toEqual([{ text: "Hi Mike, it's Tuesday Oct 27, 2026 in 2026" }])
  })

  it("keeps adjacent and repeated links apart", () => {
    expect(renderSegments("{overdue}{due_soon}", values)).toEqual([
      { text: "3", href: "/maintenance", title: "Open Maintenance", label: "3 overdue reminders" },
      { text: "5", href: "/maintenance", title: "Open Maintenance", label: "5 reminders due soon" },
    ])
    const twice = renderSegments("{records} and {records}", values)
    expect(twice.map((s) => s.text)).toEqual(["86", " and ", "86"])
    expect(twice.filter((s) => "href" in s)).toHaveLength(2)
  })

  it("an empty value makes no link and takes the ', ' or ' ' before it, next to a link too", () => {
    const empty = { ...values, next_due: "", people: "" }
    expect(renderSegments("{overdue}, {next_due}", empty)).toEqual([renderSegments("{overdue}", values)[0]])
    expect(renderSegments("{overdue} {people}!", empty)).toEqual([renderSegments("{overdue}", values)[0], { text: "!" }])
    expect(renderSegments("People: {people}", empty)).toEqual([{ text: "People:" }])
    expect(renderSegments("{people}", empty)).toEqual([])
    expect(renderSegments("{overdue}{people}", empty)).toEqual([renderSegments("{overdue}", values)[0]])
    // A missing value is the same as an empty one.
    expect(renderSegments("Hi, {people} and {records}", { records: "86" })).toEqual([
      { text: "Hi and " },
      { text: "86", href: "/records", title: "Open Records", label: "86 service records" },
    ])
  })

  it("leaves unknown tokens and malformed braces as typed, never as links", () => {
    expect(renderSegments("{overdu} {{overdue}} { overdue } {Overdue}", values)).toEqual([{ text: "{overdu} {{overdue}} { overdue } {Overdue}" }])
  })

  it("never re-reads a value as a token", () => {
    expect(renderSegments("{next_due}", { next_due: "{overdue}" }, links)).toEqual([
      { text: "{overdue}", href: "/assets/equipment/abc", title: "Open Humidifier" },
    ])
  })

  it("keeps line breaks inside plain segments", () => {
    expect(renderSegments("{overdue}\noverdue", values).map((s) => s.text)).toEqual(["3", "\noverdue"])
  })

  it("gives nothing for empty text", () => {
    expect(renderSegments("", values)).toEqual([])
  })

  it("reads the same as renderText", () => {
    const template =
      "You have {due_soon} due soon and {overdue} overdue; next: {next_due} on {next_due_date}. Spent {spend_ytd} this year, {people} people, {usr}. {user}, {date}."
    for (const v of [values, {}, { ...values, next_due: "", next_due_date: "", people: "" }]) {
      expect(segmentsText(renderSegments(template, v, links))).toBe(renderText(template, v))
    }
  })
})

describe("sampleLinks", () => {
  it("gives the preview a link for every dynamic token", () => {
    const sl = sampleLinks()
    for (const t of TEXT_TOKENS.filter((t) => t.linksTo && !t.href)) expect(sl[t.name]?.href).toMatch(/^\//)
  })
})

describe("tokenAvailable / tokenNote", () => {
  it("{people} needs Health; everything else is always available", () => {
    expect(tokenAvailable("people", ALL_ON)).toBe(true)
    expect(tokenAvailable("people", HEALTH_OFF)).toBe(false)
    for (const t of TEXT_TOKENS.filter((t) => t.name !== "people")) expect(tokenAvailable(t.name, HEALTH_OFF)).toBe(true)
  })

  it("notes what a token needs", () => {
    expect(tokenNote("people")).toBe("needs Health on")
    expect(tokenNote("user")).toBeNull()
  })
})

describe("parseTokens", () => {
  it("finds known and unknown tokens, each once, in order of first use", () => {
    expect(parseTokens("Hi {user}, {usr} and {user} on {date} {foo}")).toEqual({
      known: ["user", "date"],
      unknown: ["usr", "foo"],
    })
  })

  it("returns nothing for text without tokens (and for empty text)", () => {
    expect(parseTokens("Just a note.")).toEqual({ known: [], unknown: [] })
    expect(parseTokens("")).toEqual({ known: [], unknown: [] })
  })

  it("is case-sensitive: {User} is not {user}", () => {
    expect(parseTokens("{User} {USER} {user}")).toEqual({ known: ["user"], unknown: ["User", "USER"] })
  })

  it("leaves stray and malformed braces literal (neither known nor unknown)", () => {
    for (const s of ["{", "}", "{}", "{ user }", "{user", "user}", "{{user}}", "{{user}", "{user}}", "{1x}", "{a-b}", "{ }", "{\n}"]) {
      expect(parseTokens(s), s).toEqual({ known: [], unknown: [] })
    }
  })

  it("finds adjacent tokens and tokens inside other text", () => {
    expect(parseTokens("{user}{date}").known).toEqual(["user", "date"])
    expect(parseTokens("x{year}y").known).toEqual(["year"])
  })

  it("finds tokens across lines and next to unicode", () => {
    expect(parseTokens("Hej {user} 👋\n{weekday} — {date}").known).toEqual(["user", "weekday", "date"])
  })
})

describe("renderText", () => {
  const v = { user: "Mike", date: "Oct 27, 2026", overdue: "3", year: "2026" }

  it("replaces known tokens with their values", () => {
    expect(renderText("Welcome back, {user}", v)).toBe("Welcome back, Mike")
    expect(renderText("{overdue} overdue as of {date}", v)).toBe("3 overdue as of Oct 27, 2026")
  })

  it("leaves text without tokens unchanged (empty text too)", () => {
    expect(renderText("Just a note, really.", v)).toBe("Just a note, really.")
    expect(renderText("", v)).toBe("")
  })

  it("renders unknown tokens and malformed braces exactly as typed", () => {
    expect(renderText("Hi {usr} {User} { user } {{user}} {", v)).toBe("Hi {usr} {User} { user } {{user}} {")
  })

  it("replaces repeated and adjacent tokens", () => {
    expect(renderText("{user} {user}", v)).toBe("Mike Mike")
    expect(renderText("{user}{year}", v)).toBe("Mike2026")
  })

  it("renders a missing or empty value as nothing, and drops the ', ' or ' ' right before it", () => {
    expect(renderText("Welcome back, {user}", {})).toBe("Welcome back")
    expect(renderText("Welcome back, {user}", { user: "" })).toBe("Welcome back")
    expect(renderText("Welcome back {user}!", {})).toBe("Welcome back!")
    expect(renderText("Welcome back,{user}", {})).toBe("Welcome back,")
    expect(renderText("{user}", {})).toBe("")
    // Only one separator, and only right before the token.
    expect(renderText("Hi,  {user}", {})).toBe("Hi, ")
    expect(renderText("Hi, {user} today", {})).toBe("Hi today")
  })

  it("collapses a run of empty tokens and their separators", () => {
    expect(renderText("Hi, {user_full}, {user}", {})).toBe("Hi")
  })

  it("keeps line breaks; an empty token at a line start leaves the break", () => {
    expect(renderText("Hello, {user}\nToday is {weekday}", { weekday: "Tuesday" })).toBe("Hello\nToday is Tuesday")
    expect(renderText("Hello\n{user}", {})).toBe("Hello\n")
  })

  it("never re-reads a value as a token", () => {
    expect(renderText("{user}", { user: "{date}" })).toBe("{date}")
  })

  it("handles unicode around tokens", () => {
    expect(renderText("Hej {user} 👋", { user: "Åsa" })).toBe("Hej Åsa 👋")
    expect(renderText("Hej {user} 👋", {})).toBe("Hej 👋")
  })

  it("keeps a 500-character text whole", () => {
    const long = "x".repeat(493) + " {user}"
    expect(long.length).toBe(500)
    expect(renderText(long, { user: "Mike" })).toBe("x".repeat(493) + " Mike")
  })
})

describe("textNeeds", () => {
  const needs = (s: string): TextNeed[] => [...textNeeds(s)].sort()

  it("needs no data for plain text or for the user and clock tokens", () => {
    expect(needs("Hello there")).toEqual([])
    expect(needs("Welcome back, {user} ({user_full}) — {weekday} {date} {year}")).toEqual([])
  })

  it("needs one query group per kind of data, once", () => {
    expect(needs("{overdue} overdue, {due_soon} soon; next {next_due} on {next_due_date}")).toEqual(["due"])
    expect(needs("{spend_ytd} this year, {spend_month} this month")).toEqual(["costs"])
    expect(needs("{expiring_warranties} {intake}")).toEqual(["intake", "warranties"])
    expect(needs("{next_expiring} ends {next_expiring_date}")).toEqual(["nextWarranty"])
    expect(needs("{expiring_warranties} {next_expiring}")).toEqual(["nextWarranty", "warranties"])
    expect(needs("{properties} {vehicles} {equipment} {records} {people}")).toEqual(
      ["equipment", "people", "properties", "records", "vehicles"].sort(),
    )
  })

  it("ignores unknown and malformed tokens", () => {
    expect(needs("{overdu} { overdue } {{overdue}}")).toEqual([])
  })
})

describe("firstName", () => {
  it("is the first word of the name", () => {
    expect(firstName("Mike Dazzo")).toBe("Mike")
    expect(firstName("  Ann   Marie  Smith ")).toBe("Ann")
    expect(firstName("Cher")).toBe("Cher")
  })

  it("is empty with no name", () => {
    expect(firstName(null)).toBe("")
    expect(firstName(undefined)).toBe("")
    expect(firstName("   ")).toBe("")
  })
})

describe("sampleValues", () => {
  it("gives every token a made-up value, empty when it is not available", () => {
    expect(renderText("Hi, {user}: {overdue} overdue", sampleValues(ALL_ON))).toBe("Hi, Alex: 2 overdue")
    expect(sampleValues(ALL_ON).people).not.toBe("")
    expect(renderText("People: {people}", sampleValues(HEALTH_OFF))).toBe("People:")
  })
})

describe("the README's token table", () => {
  // The help text lives only in TEXT_TOKENS; the README's table must say the same.
  const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8")

  it.each(TEXT_TOKENS.map((t) => [t.name, t] as const))("lists {%s} as TEXT_TOKENS describes it", (_name, t) => {
    const note = tokenNote(t.name)
    expect(readme).toContain(`| ${t.group} | \`{${t.name}}\` | ${t.help}${note ? ` (${note})` : ""} | ${t.linksTo ?? "—"} |`)
  })

  it("has a Links to column", () => {
    expect(readme).toContain("| Group | Value | Shows | Links to |")
  })

  it("lists no other tokens", () => {
    const listed = [...readme.matchAll(/^\s*\| [^|]+ \| `\{([a-z_]+)\}` \|/gm)].map((m) => m[1])
    expect([...listed].sort()).toEqual(TEXT_TOKENS.map((t) => t.name).sort())
  })
})
