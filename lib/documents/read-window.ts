// read_document returns at most READ_CHAR_BUDGET characters per call, inside
// the 12k tool-result budget. Whole pages are returned while they fit. A page
// that doesn't fit is cut on a word and `next` says where to resume, which
// matters because a long DOCX or a spreadsheet sheet is a single "page".

export const READ_CHAR_BUDGET = 9_000

export type ReadWindow = { text: string; next: { fromPage: number; offset: number } | null }

export function readWindow(pages: string[], fromPage = 1, offset = 0, budget: number = READ_CHAR_BUDGET): ReadWindow {
  const labelled = pages.length > 1
  let out = ""
  for (let page = fromPage; page <= pages.length; page++) {
    const start = page === fromPage ? offset : 0
    const body = pages[page - 1].slice(start)
    const header = labelled ? `[Page ${page}]\n` : ""
    const room = budget - out.length - header.length
    if (body.length <= room) {
      out += `${header}${body}\n\n`
      continue
    }
    // Already have text and only a sliver of room: stop cleanly at the page boundary.
    if (out && room < budget / 4) return { text: out.trim(), next: { fromPage: page, offset: start } }
    let cut = body.lastIndexOf(" ", room)
    if (cut < room / 2) cut = room
    out += `${header}${body.slice(0, cut)} …`
    return { text: out.trim(), next: { fromPage: page, offset: start + cut } }
  }
  return { text: out.trim(), next: null }
}
