// The bit of a chunk shown to the model: a window around the first term that
// matched, cut on word boundaries. The index is contentless, so FTS5's own
// snippet() isn't available; this does the same job on chunk.text.

export const PASSAGE_CHARS = 300

/** Rough stem so "filters" or "filtering" still finds "filter" in the text (the index stems with porter). */
function stem(term: string): string {
  return term.length > 4 ? term.replace(/(ing|ed|es|s)$/, "") : term
}

export function passage(text: string, terms: string[], width: number = PASSAGE_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= width) return flat

  const lower = flat.toLowerCase()
  let hit = -1
  for (const t of terms) {
    const i = lower.indexOf(stem(t))
    if (i >= 0 && (hit < 0 || i < hit)) hit = i
  }

  let start = hit < 0 ? 0 : Math.max(0, hit - Math.floor(width / 3))
  let end = Math.min(flat.length, start + width)
  if (end === flat.length) start = Math.max(0, end - width)
  if (start > 0) {
    const sp = flat.indexOf(" ", start)
    if (sp >= 0 && sp - start < 30) start = sp + 1
  }
  if (end < flat.length) {
    const sp = flat.lastIndexOf(" ", end)
    if (sp > start && end - sp < 30) end = sp
  }
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`
}
