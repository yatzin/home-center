import { MAX_TEXT_CHARS, PAGE_BREAK } from "./limits"

// Extractors return messy text: CRLF, tabs, NULs from old Word files, runs of
// spaces from PDF layout. Pages are cleaned one by one and joined with a form
// feed, which is why a stray \f inside a page has to go.

// Control characters except \t (09) and \n (0A); \r is handled first.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g

export function normalizePage(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export type JoinedText = { text: string; pageCount: number; truncated: boolean }

export function joinPages(pages: string[], max: number = MAX_TEXT_CHARS): JoinedText {
  let text = pages.map(normalizePage).join(PAGE_BREAK)
  let truncated = false
  if (text.length > max) {
    text = text.slice(0, max)
    truncated = true
  }
  return { text, pageCount: splitPages(text).length, truncated }
}

export function splitPages(text: string): string[] {
  return text.split(PAGE_BREAK)
}

/** \f counts as whitespace, so this is false for a file of blank pages. */
export function hasText(text: string): boolean {
  return /\S/.test(text)
}

/** A PDF page with almost nothing on it — probably a scan that needs OCR. */
export function isBlankPage(page: string): boolean {
  return page.replace(/\s/g, "").length < 20
}
