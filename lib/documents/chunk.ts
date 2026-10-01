// Search works on chunks, not whole files: BM25 favours short passages that
// match, and a hit can then say which page it came from. Chunks overlap so a
// sentence cut at a boundary is still whole in one of them, and they never
// cross a page, so each has exactly one page number.

export type Chunk = { page: number; ordinal: number; text: string }

export const CHUNK_SIZE = 1000
export const CHUNK_OVERLAP = 150

/** Last good place to cut before `end`: paragraph, line, sentence, then word — never before the chunk's midpoint. */
function breakPoint(text: string, start: number, end: number): number {
  const min = start + Math.floor((end - start) / 2)
  for (const sep of ["\n\n", "\n", ". ", " "]) {
    const at = text.lastIndexOf(sep, end - sep.length)
    if (at >= min) return at + sep.length
  }
  return end
}

export function chunkPages(pages: string[], size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): Chunk[] {
  const out: Chunk[] = []
  pages.forEach((raw, i) => {
    const page = raw.trim()
    let start = 0
    while (start < page.length) {
      let end = Math.min(start + size, page.length)
      if (end < page.length) end = breakPoint(page, start, end)
      const text = page.slice(start, end).trim()
      if (text) out.push({ page: i + 1, ordinal: out.length, text })
      if (end >= page.length) break
      let next = end - overlap
      // Start the overlap on a word, not halfway through one.
      const ws = page.slice(next, end).search(/\s/)
      if (ws >= 0) next += ws + 1
      start = Math.max(next, start + 1)
    }
  })
  return out
}
