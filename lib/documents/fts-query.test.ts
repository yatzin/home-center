import { describe, expect, it } from "vitest"
import { MAX_TERMS, parseSearch } from "./fts-query"

// Every MATCH we produce must be quoted terms joined by OR, optionally with a
// trailing * — nothing the model typed can become FTS5 syntax.
const SAFE = /^"[^"]*"\*?( OR "[^"]*"\*?)*$/

describe("parseSearch", () => {
  it("quotes terms, drops stop-words and adds prefix forms for words", () => {
    expect(parseSearch("what is the filter size")).toEqual({
      match: '"filter" OR "filter"* OR "size" OR "size"*',
      terms: ["filter", "size"],
    })
  })

  it("keeps model numbers and part numbers whole, without prefix forms", () => {
    const p = parseSearch("WDT730PAHZ0 A-1234 16x25x1 3.5")!
    expect(p.terms).toEqual(["wdt730pahz0", "a-1234", "16x25x1", "3.5"])
    expect(p.match).toBe('"wdt730pahz0" OR "a-1234" OR "16x25x1" OR "3.5"')
  })

  it("keeps a quoted phrase as a phrase", () => {
    expect(parseSearch('"furnace filter" size')!.terms).toEqual(["furnace filter", "size"])
  })

  it("returns null when nothing searchable is left", () => {
    expect(parseSearch("what is the")).toBeNull()
    expect(parseSearch("  ?? !! ")).toBeNull()
    expect(parseSearch("")).toBeNull()
  })

  it("dedupes and caps the number of terms", () => {
    const p = parseSearch("alpha alpha beta gamma delta epsilon zeta theta iota kappa lambda")!
    expect(p.terms.length).toBe(MAX_TERMS)
    expect(p.terms.filter((t) => t === "alpha").length).toBe(1)
  })

  it.each([
    'filter NEAR(size 5)',
    'title:secret',
    '^start',
    'filt*',
    '"unbalanced quote',
    'a" OR "b',
    'AND OR NOT',
    '(((',
    '🔥 furnace 🔥',
    'x'.repeat(500),
  ])("never lets FTS5 syntax through: %s", (input) => {
    const p = parseSearch(input)
    if (p) expect(p.match).toMatch(SAFE)
  })
})
