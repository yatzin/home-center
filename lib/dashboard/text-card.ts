// The Text card: its config (schema, tolerant reader, chrome), how many lines
// fit, and the pure shaping of its token values. Pure TS, shared by the
// catalog, the loader, the view and the tests. Tokens themselves are in
// text-template.ts.
import { z } from "zod"
import type { Due } from "@/lib/maintenance-due"
import type { Formatter } from "@/lib/regional"
import { localDay } from "@/lib/equipment-life"
import type { AssetType } from "@/app/generated/prisma/client"
import { maintenanceEditHref, warrantyEditHref } from "@/lib/deep-link"
import { firstName, isSitePath, renderSegments, segmentsText, type TextSegment, type TokenLink, type TokenLinks } from "./text-template"

export const TEXT_STYLES = ["h1", "h2", "h3", "h4", "body", "small", "muted"] as const
export type TextStyle = (typeof TEXT_STYLES)[number]
export const TEXT_ALIGNS = ["left", "center", "right"] as const
export type TextAlign = (typeof TEXT_ALIGNS)[number]

/** Longest text a card may hold, in UTF-16 code units (what a textarea's maxLength counts). */
export const TEXT_MAX = 500

export type TextConfig = { text: string; style: TextStyle; align: TextAlign; border: boolean }

/** A new Text card: body text greeting the user, inside the usual card. */
export const TEXT_DEFAULTS: Readonly<TextConfig> = Object.freeze({ text: "Hello, {user}", style: "body", align: "left", border: true })

export const BLANK_TEXT_MESSAGE = "Enter some text."

const textField = z.string().max(TEXT_MAX).regex(/\S/, BLANK_TEXT_MESSAGE)

/** The card's configSchema: missing keys get their defaults, unknown keys are dropped. */
export const textConfigSchema = z.object({
  text: textField.default(TEXT_DEFAULTS.text),
  style: z.enum(TEXT_STYLES).default(TEXT_DEFAULTS.style),
  align: z.enum(TEXT_ALIGNS).default(TEXT_DEFAULTS.align),
  border: z.boolean().default(TEXT_DEFAULTS.border),
})

/**
 * A stored config as the card uses it, key by key: a missing or damaged value
 * is its default (an over-long text is cut to TEXT_MAX), so a card always renders.
 */
export function readTextConfig(config: Record<string, unknown>): TextConfig {
  const t = config.text
  const text = typeof t === "string" && /\S/.test(t) ? t.slice(0, TEXT_MAX) : TEXT_DEFAULTS.text
  const style = TEXT_STYLES.find((s) => s === config.style) ?? TEXT_DEFAULTS.style
  const align = TEXT_ALIGNS.find((a) => a === config.align) ?? TEXT_DEFAULTS.align
  const border = typeof config.border === "boolean" ? config.border : TEXT_DEFAULTS.border
  return { text, style, align, border }
}

/** A card drawn without card chrome (no background, border or shadow): a Text card with its border off. */
export function isBareCard(card: { type: string; config: Record<string, unknown> }): boolean {
  return card.type === "text" && readTextConfig(card.config).border === false
}

/**
 * The Text card's data: its text with the tokens already resolved, as
 * segments (plain text and links) and as one string (the tooltip).
 */
export type TextCardData = { text: string; segments: TextSegment[] }

export function isTextData(data: unknown): data is { text: string } {
  return typeof data === "object" && data !== null && typeof (data as { text?: unknown }).text === "string"
}

/** The loader's result for `template` with these values and item links. */
export function textCardData(template: string, values: Readonly<Record<string, string | undefined>>, links: TokenLinks = {}): TextCardData {
  const segments = renderSegments(template, values, links)
  return { text: segmentsText(segments), segments }
}

/**
 * The segments to draw from a card's data: damaged ones dropped, a link kept
 * only with a site path (else its text stays, plain); just the text when
 * there are no segments.
 */
export function textSegmentsOf(data: unknown): TextSegment[] {
  if (!isTextData(data)) return []
  const raw = (data as { segments?: unknown }).segments
  if (!Array.isArray(raw)) return data.text === "" ? [] : [{ text: data.text }]
  const out: TextSegment[] = []
  for (const s of raw) {
    if (typeof s !== "object" || s === null || typeof s.text !== "string") continue
    if (!("href" in s)) out.push({ text: s.text })
    else if (isSitePath(s.href)) {
      out.push({
        text: s.text,
        href: s.href,
        title: typeof s.title === "string" ? s.title : "",
        ...(typeof s.label === "string" ? { label: s.label } : {}),
      })
    } else out.push({ text: s.text })
  }
  return out
}

/** Line height of each style, in px (the view's Tailwind classes use the same). */
export const LINE_HEIGHTS: Readonly<Record<TextStyle, number>> = Object.freeze({
  h1: 28,
  h2: 28,
  h3: 24,
  h4: 20,
  body: 20,
  small: 16,
  muted: 20,
})

/** Whole lines of `style` that fit in `heightPx` (at least one). */
export function clampLines(heightPx: number, style: TextStyle): number {
  const n = Math.floor(heightPx / LINE_HEIGHTS[style])
  return Number.isFinite(n) && n >= 1 ? n : 1
}

// ---- Token values (pure shaping; the loader fetches) ------------------------------

export function userTokenValues(name: string | null | undefined): { user: string; user_full: string } {
  const full = (name ?? "").trim().replace(/\s+/g, " ")
  return { user: firstName(full), user_full: full }
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" })

/**
 * Today (the server's calendar day, as the other cards count days) in the
 * regional date format, its weekday (English: the regional settings have no
 * language) and the year.
 */
export function clockTokenValues(now: Date, fmt: Pick<Formatter, "date">): { date: string; weekday: string; year: string } {
  const today = localDay(now)
  return { date: fmt.date(today, { utc: true }), weekday: WEEKDAY.format(today), year: String(today.getUTCFullYear()) }
}

/**
 * From the Due Maintenance card's list (dueMaintenance: most urgent first):
 * how many are overdue, how many more are due (soon by their own reminder, or
 * within its 30 days), and the most urgent one's name and date (a stored UTC
 * midnight date, shown as the maintenance page does; empty when it has none).
 */
export function dueTokenValues(
  due: readonly { s: { title: string; nextDueDate: Date | null }; due: Pick<Due, "overdue"> }[],
  fmt: Pick<Formatter, "date" | "number">,
): { overdue: string; due_soon: string; next_due: string; next_due_date: string } {
  const overdue = due.filter((d) => d.due.overdue).length
  const next = due[0]
  return {
    overdue: fmt.number(overdue),
    due_soon: fmt.number(due.length - overdue),
    next_due: next?.s.title ?? "",
    next_due_date: next?.s.nextDueDate ? fmt.date(next.s.nextDueDate, { utc: true }) : "",
  }
}

/**
 * Where {next_due} and {next_due_date} link: the most urgent reminder's own
 * edit dialog (the item's page, Maintenance tab, `open` = the reminder), named
 * for the link's tooltip. None when nothing is due.
 */
export function dueTokenLinks(
  due: readonly { s: { id: string; title: string; assetType: AssetType; assetId: string } }[],
): Record<string, TokenLink> {
  const next = due[0]
  if (!next) return {}
  const { id, title, assetType, assetId } = next.s
  const link = { href: maintenanceEditHref(assetType, assetId, id), to: `${title} reminder` }
  return { next_due: link, next_due_date: link }
}

type ExpiringWarranty = { id: string; productName: string; expirationDate: Date | null; assetType: AssetType; assetId: string }

/**
 * {next_expiring} and {next_expiring_date}: the soonest-ending warranty within
 * the Expiring Warranties card's window (its first row), and its stored UTC
 * date as that card shows it. Both empty when none ends in the window.
 */
export function expiringTokenValues(
  warranty: Pick<ExpiringWarranty, "productName" | "expirationDate"> | null | undefined,
  fmt: Pick<Formatter, "date">,
): { next_expiring: string; next_expiring_date: string } {
  return {
    next_expiring: warranty?.productName ?? "",
    next_expiring_date: warranty?.expirationDate ? fmt.date(warranty.expirationDate, { utc: true }) : "",
  }
}

/** Where both link: that warranty's edit dialog on its item's page (Warranties tab). None without one. */
export function expiringTokenLinks(warranty: ExpiringWarranty | null | undefined): Record<string, TokenLink> {
  if (!warranty) return {}
  const link = { href: warrantyEditHref(warranty.assetType, warranty.assetId, warranty.id), to: `${warranty.productName} warranty` }
  return { next_expiring: link, next_expiring_date: link }
}
