// officeparser returns an AST. Text sits on leaf nodes; slides, sheets and
// PDF pages are top-level nodes, which become our pages. Word-processing
// documents have no pages in the file, so they come back as one page.

export type OfficeNode = {
  type: string
  text?: string
  children?: OfficeNode[]
  metadata?: { sheetName?: string } & Record<string, unknown>
}

const BLOCK = new Set([
  "paragraph", "heading", "table", "list", "row", "note", "page", "slide", "sheet", "header", "footer", "code",
  "break", "comment", "admonition", "definitionList", "definitionTerm", "definitionDescription",
])
const PAGE_LIKE = new Set(["page", "slide", "sheet"])

export function nodeText(n: OfficeNode): string {
  const kids = n.children ?? []
  if (!kids.length) return n.text ?? ""
  const sep = n.type === "row" ? "\t" : kids.some((c) => BLOCK.has(c.type)) ? "\n" : ""
  return kids.map(nodeText).join(sep)
}

export function officePages(content: OfficeNode[]): string[] {
  if (!content.some((n) => PAGE_LIKE.has(n.type))) return [content.map(nodeText).join("\n")]
  const pages: string[] = []
  let lead = ""
  for (const n of content) {
    if (PAGE_LIKE.has(n.type)) {
      const title = n.type === "sheet" && n.metadata?.sheetName ? `${n.metadata.sheetName}\n` : ""
      pages.push(`${pages.length ? "" : lead}${title}${nodeText(n)}`)
    } else if (pages.length) {
      pages[pages.length - 1] += `\n${nodeText(n)}`
    } else {
      lead += `${nodeText(n)}\n`
    }
  }
  return pages
}
