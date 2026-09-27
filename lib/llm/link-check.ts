// An internal link is only trustworthy if a tool returned that exact href during
// this question. Models that skip the lookup copy links from earlier answers or
// invent them — including paths for record types that have no page — and the
// facts around such a link are usually invented too.

const INTERNAL_LINK = /\[([^\]]*)\]\((\/[^)\s]*)\)/g

/** Pages that exist whatever the data; linking them needs no lookup. */
const FIXED_PAGES = new Set([
  "/", "/chat", "/costs", "/maintenance", "/warranties", "/records", "/insurance", "/providers", "/notifications", "/settings",
  "/assets/properties", "/assets/vehicles", "/assets/equipment", "/assets/people",
])

export function unverifiedLinks(text: string, toolOutputs: string[]): string[] {
  const bad = new Set<string>()
  for (const [, , href] of text.matchAll(INTERNAL_LINK)) {
    if (FIXED_PAGES.has(href)) continue
    if (!toolOutputs.some((out) => out.includes(`"${href}"`))) bad.add(href)
  }
  return [...bad]
}

export function unlink(text: string, hrefs: string[]): string {
  return text.replace(INTERNAL_LINK, (whole, label: string, href: string) => (hrefs.includes(href) ? label : whole))
}
