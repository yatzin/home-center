// Plain-text formats read in-house: officeparser's CSV needs a type hint and
// its RTF output is unreliable, and both are easy.

export function decodeText(data: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(data)
  } catch {
    return new TextDecoder("latin1").decode(data)
  }
}

/** Groups whose text is never body text. */
const SKIP = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "themedata", "datastore", "latentstyles",
  "listtable", "listoverridetable", "rsidtbl", "generator", "xmlnstbl", "header", "footer",
])

/** Body text of an RTF document: control words dropped, \par → newline, \tab → tab, escapes decoded. */
export function rtfToText(rtf: string): string {
  let out = ""
  const stack: boolean[] = []
  let skip = false
  let i = 0
  while (i < rtf.length) {
    const c = rtf[i]
    if (c === "{") {
      stack.push(skip)
      i++
      continue
    }
    if (c === "}") {
      skip = stack.pop() ?? false
      i++
      continue
    }
    if (c === "\\") {
      const next = rtf[i + 1]
      if (next === "\\" || next === "{" || next === "}") {
        if (!skip) out += next
        i += 2
        continue
      }
      if (next === "*") {
        skip = true
        i += 2
        continue
      }
      if (next === "'") {
        if (!skip) out += String.fromCharCode(parseInt(rtf.slice(i + 2, i + 4), 16))
        i += 4
        continue
      }
      if (next === "~") {
        if (!skip) out += " "
        i += 2
        continue
      }
      if (next === "\n" || next === "\r") {
        if (!skip) out += "\n"
        i += 2
        continue
      }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1, i + 40))
      if (!m) {
        i += 2
        continue
      }
      i += 1 + m[0].length
      const [, word, arg] = m
      if (SKIP.has(word)) {
        skip = true
        continue
      }
      if (skip) continue
      if (word === "par" || word === "line" || word === "row") out += "\n"
      else if (word === "tab" || word === "cell") out += "\t"
      else if (word === "u" && arg) {
        out += String.fromCharCode((Number(arg) + 65536) % 65536)
        // \uN is followed by a one-character fallback for old readers.
        if (rtf[i] && !"\\{}".includes(rtf[i])) i++
      }
      continue
    }
    if (c === "\r" || c === "\n") {
      i++
      continue
    }
    if (!skip) out += c
    i++
  }
  return out
}
