// The Text card's live values: `{name}` tokens in the card's text, replaced by
// values the server works out when the card loads. Pure TS (no Prisma/React),
// shared by the loader, the settings dialog and the tests. TEXT_TOKENS is the
// one place a token's name, help text and needs are written down.
//
// Grammar (decided):
// - A token is `{` + a name + `}`, where a name is a letter or `_` followed by
//   letters, digits or `_`, with no spaces. Names are case-sensitive.
// - A token right next to another brace (`{{user}}`, `{{user}`, `{user}}`) is
//   not a token: double braces stay exactly as typed.
// - Anything else with braces (`{`, `{}`, `{ user }`, `{a-b}`, `{1x}`) is plain
//   text: not a token, not reported as unknown.
// - A token whose name is not in TEXT_TOKENS is "unknown": it renders exactly
//   as typed, and the settings dialog warns about it.
// - A known token with no value (or an empty one) renders as nothing, and
//   takes the separator right before it with it: ", " if the text so far ends
//   with that, else one " ". So "Welcome back, {user}" reads "Welcome back"
//   when there is no name. Line breaks are never removed.
// - Values are inserted as plain text and never read again as tokens.
//
// Links (decided): a token whose value is about a page or an item links there
// (TEXT_TOKENS' `linksTo`). The rendered text is a list of segments, plain or
// link; a link's text is exactly the token's value, and its href comes only
// from this table (`href`) or, for a value about one item ({next_due},
// {next_expiring}), from the loader: the asset page with that item's edit
// dialog open (lib/deep-link.ts). The text itself has no link syntax, so the user cannot make a
// link or choose where one goes. An empty value makes no link.
import type { Features } from "@/lib/features"

export const TEXT_TOKEN_GROUPS = ["You & time", "Attention", "Money", "Counts"] as const
export type TextTokenGroup = (typeof TEXT_TOKEN_GROUPS)[number]

/**
 * What the loader must fetch for a token. "session" and "clock" cost no query;
 * every other need is one query (or one cached load) however many tokens use it.
 */
export type TokenSource =
  | "session"
  | "clock"
  | "due"
  | "warranties"
  | "nextWarranty"
  | "intake"
  | "costs"
  | "properties"
  | "vehicles"
  | "equipment"
  | "records"
  | "people"
/** The needs that query the database. */
export type TextNeed = Exclude<TokenSource, "session" | "clock">

export type TextToken = Readonly<{
  name: string
  group: TextTokenGroup
  /** One line, for the settings dialog and the docs. */
  help: string
  /** A made-up value for the settings dialog's preview. */
  sample: string
  source: TokenSource
  /** The site feature the value needs; without it the token renders empty. */
  requires?: "health"
  /**
   * Where the value links, for people: the dialog's "Links to …" and the
   * README's column. Set exactly when the token is a link.
   */
  linksTo?: string
  /**
   * The page it links to, the same one the neighbouring card's "view all"
   * opens. Absent for a link to one item, whose href the loader works out.
   */
  href?: string
  /**
   * For a link whose value is a bare number or amount: what it counts, so the
   * link's accessible name says more than "14" ("14 pieces of equipment").
   */
  noun?: string
}>

// List-page hrefs are the same paths the neighbouring cards and the sidebar
// use (a test checks each one is a page under app/(app)).
const TOKENS: TextToken[] = [
  { name: "user", group: "You & time", help: "Your first name.", sample: "Alex", source: "session" },
  { name: "user_full", group: "You & time", help: "Your full name.", sample: "Alex Morgan", source: "session" },
  { name: "date", group: "You & time", help: "Today's date, in your regional date format.", sample: "Oct 27, 2026", source: "clock" },
  { name: "weekday", group: "You & time", help: "Today's day of the week, like Tuesday.", sample: "Tuesday", source: "clock" },
  { name: "year", group: "You & time", help: "This year, like 2026.", sample: "2026", source: "clock" },
  { name: "overdue", group: "Attention", help: "How many reminders are overdue.", sample: "2", source: "due", linksTo: "Maintenance", href: "/maintenance", noun: "overdue reminders" },
  { name: "due_soon", group: "Attention", help: "How many more are due within 30 days (overdue ones not included).", sample: "5", source: "due", linksTo: "Maintenance", href: "/maintenance", noun: "reminders due soon" },
  { name: "next_due", group: "Attention", help: "The most urgent reminder's name.", sample: "Replace HVAC filter", source: "due", linksTo: "Maintenance (opens that reminder)" },
  { name: "next_due_date", group: "Attention", help: "The most urgent reminder's due date (empty when it is due by mileage).", sample: "Nov 3, 2026", source: "due", linksTo: "Maintenance (opens that reminder)" },
  { name: "expiring_warranties", group: "Attention", help: "How many warranties end within 60 days.", sample: "1", source: "warranties", linksTo: "Warranties", href: "/warranties", noun: "warranties ending soon" },
  { name: "next_expiring", group: "Attention", help: "The name of the warranty that ends soonest, within 60 days.", sample: "Dishwasher coverage", source: "nextWarranty", linksTo: "Warranties (opens that warranty)" },
  { name: "next_expiring_date", group: "Attention", help: "The date that warranty ends.", sample: "Nov 20, 2026", source: "nextWarranty", linksTo: "Warranties (opens that warranty)" },
  { name: "intake", group: "Attention", help: "How many items are waiting in Intake.", sample: "3", source: "intake", linksTo: "Intake", href: "/intake", noun: "items in Intake" },
  { name: "spend_ytd", group: "Money", help: "Spending so far this year.", sample: "$4,210.00", source: "costs", linksTo: "Costs", href: "/costs", noun: "spent this year" },
  { name: "spend_month", group: "Money", help: "Spending so far this month.", sample: "$385.00", source: "costs", linksTo: "Costs", href: "/costs", noun: "spent this month" },
  { name: "properties", group: "Counts", help: "How many properties.", sample: "2", source: "properties", linksTo: "Properties", href: "/assets/properties", noun: "properties" },
  { name: "vehicles", group: "Counts", help: "How many vehicles.", sample: "3", source: "vehicles", linksTo: "Vehicles", href: "/assets/vehicles", noun: "vehicles" },
  { name: "equipment", group: "Counts", help: "How many pieces of equipment.", sample: "14", source: "equipment", linksTo: "Equipment", href: "/assets/equipment", noun: "pieces of equipment" },
  { name: "records", group: "Counts", help: "How many service records.", sample: "86", source: "records", linksTo: "Records", href: "/records", noun: "service records" },
  { name: "people", group: "Counts", help: "How many people.", sample: "4", source: "people", requires: "health", linksTo: "People", href: "/assets/people", noun: "people" },
]

export const TEXT_TOKENS: readonly TextToken[] = Object.freeze(TOKENS.map((t) => Object.freeze({ ...t })))

const BY_NAME = new Map(TEXT_TOKENS.map((t) => [t.name, t]))

export function textToken(name: string): TextToken | undefined {
  return BY_NAME.get(name)
}

/** Whether a token has a value with these features (a token that is not available renders empty). */
export function tokenAvailable(name: string, features: Features): boolean {
  const t = BY_NAME.get(name)
  return t !== undefined && (!t.requires || features[t.requires])
}

/** What a token needs, for the help list ("needs Health on"); null when it needs nothing. */
export function tokenNote(name: string): string | null {
  return BY_NAME.get(name)?.requires === "health" ? "needs Health on" : null
}

// `{name}` not touching another brace (see the grammar above).
const TOKEN = /(?<!\{)\{([A-Za-z_][A-Za-z0-9_]*)\}(?!\})/g

/** The known and unknown token names in `text`, each once, in order of first use. */
export function parseTokens(text: string): { known: string[]; unknown: string[] } {
  const known: string[] = []
  const unknown: string[] = []
  for (const m of text.matchAll(TOKEN)) {
    const list = BY_NAME.has(m[1]) ? known : unknown
    if (!list.includes(m[1])) list.push(m[1])
  }
  return { known, unknown }
}

/** The database needs of the known tokens in `text` (none for plain text, the user and the clock). */
export function textNeeds(text: string): Set<TextNeed> {
  const needs = new Set<TextNeed>()
  for (const name of parseTokens(text).known) {
    const source = BY_NAME.get(name)!.source
    if (source !== "session" && source !== "clock") needs.add(source)
  }
  return needs
}

/** Where a token about one item links (from the loader): a site path and the item's name. */
export type TokenLink = { href: string; to: string }
export type TokenLinks = Readonly<Record<string, TokenLink | undefined>>

/**
 * A run of the rendered text: plain, or a link. A link's `title` says where it
 * goes ("Open Maintenance"); `label`, for a bare number or amount, is its
 * accessible name ("14 pieces of equipment").
 */
export type TextSegment = { text: string } | { text: string; href: string; title: string; label?: string }

/** A path on this site ("/x"), never another origin ("//x", "https:", "javascript:"). */
export function isSitePath(href: unknown): href is string {
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")
}

/**
 * `text` with its known tokens replaced by `values`, as segments (see the
 * grammar above for empty values). A linked token with a value is a link to
 * its table href, or to `links[name]` for a token about one item; plain text
 * next to plain text is one segment. An empty value takes the ", " or " "
 * before it only from plain text, so a link's text is always its value.
 */
export function renderSegments(text: string, values: Readonly<Record<string, string | undefined>>, links: TokenLinks = {}): TextSegment[] {
  const out: TextSegment[] = []
  const plain = (s: string) => {
    if (s === "") return
    const prev = out[out.length - 1]
    if (prev && !("href" in prev)) prev.text += s
    else out.push({ text: s })
  }
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    const name = m[1]
    const token = BY_NAME.get(name)
    if (!token) continue
    plain(text.slice(last, m.index))
    last = m.index + m[0].length
    const value = values[name]
    if (value) {
      const link = token.linksTo ? (token.href ? { href: token.href, to: token.linksTo } : links[name]) : undefined
      if (link && isSitePath(link.href)) {
        out.push({ text: value, href: link.href, title: `Open ${link.to}`, ...(token.noun ? { label: `${value} ${token.noun}` } : {}) })
      } else plain(value)
      continue
    }
    const prev = out[out.length - 1]
    if (!prev || "href" in prev) continue
    if (prev.text.endsWith(", ")) prev.text = prev.text.slice(0, -2)
    else if (prev.text.endsWith(" ")) prev.text = prev.text.slice(0, -1)
    if (prev.text === "") out.pop()
  }
  plain(text.slice(last))
  return out
}

/** The segments as one string. */
export function segmentsText(segments: readonly TextSegment[]): string {
  return segments.map((s) => s.text).join("")
}

/** `text` with its known tokens replaced by `values`, as one string (renderSegments without the links). */
export function renderText(text: string, values: Readonly<Record<string, string | undefined>>): string {
  return segmentsText(renderSegments(text, values))
}

/** The first word of a person's name ("" without one). */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? ""
}

/** Made-up values for the settings dialog's preview; a token that is not available is empty, as it renders. */
export function sampleValues(features: Features): Record<string, string> {
  return Object.fromEntries(TEXT_TOKENS.map((t) => [t.name, tokenAvailable(t.name, features) ? t.sample : ""]))
}

/** Made-up links for the preview's tokens about one item (shown underlined, never followed). */
export function sampleLinks(): Record<string, TokenLink> {
  const sample = { href: "/maintenance", to: "Furnace" }
  return Object.fromEntries(TEXT_TOKENS.filter((t) => t.linksTo && !t.href).map((t) => [t.name, sample]))
}
