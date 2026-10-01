// The model's query never reaches FTS5 as-is: FTS5 has its own syntax
// (NEAR, column:, ^, *, quotes) and a stray quote is a syntax error. Every
// term is quoted, so the tokenizer treats it as plain text (a quoted
// "a-1234" becomes the phrase "a 1234"), and terms are ORed so BM25 ranks
// chunks that match more of them first.

export const MAX_TERMS = 8

const STOP = new Set([
  "a", "about", "all", "an", "and", "any", "are", "as", "at", "be", "by", "can", "did", "do", "does", "for",
  "from", "has", "have", "how", "i", "in", "is", "it", "its", "many", "much", "my", "not", "of", "on", "or",
  "our", "the", "this", "to", "was", "we", "what", "when", "where", "which", "who", "with",
])

export type ParsedSearch = {
  /** A MATCH expression made only of quoted terms joined by OR. */
  match: string
  /** Lowercased terms (phrases kept whole), for highlighting passages. */
  terms: string[]
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}._-]+/u)
    .map((t) => t.replace(/^[._-]+|[._-]+$/g, ""))
    .filter(Boolean)
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** Plain words get a prefix form too ("filter" finds "filtration"); codes and numbers don't. */
const canPrefix = (t: string) => t.length >= 4 && /^\p{L}+$/u.test(t)

export function parseSearch(input: string): ParsedSearch | null {
  const terms: string[] = []
  const rest = input.replace(/"([^"]*)"/g, (_, phrase: string) => {
    const words = tokens(phrase)
    if (words.length) {
      const joined = words.join(" ")
      if (!terms.includes(joined)) terms.push(joined)
    }
    return " "
  })
  for (const t of tokens(rest)) {
    if (t.length < 2 || STOP.has(t) || terms.includes(t)) continue
    terms.push(t)
  }
  const kept = terms.slice(0, MAX_TERMS)
  if (!kept.length) return null
  const match = kept.map((t) => (canPrefix(t) ? `${quote(t)} OR ${quote(t)}*` : quote(t))).join(" OR ")
  return { match, terms: kept }
}
