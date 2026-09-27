/** Line reader for the NDJSON stream from /api/chat. Malformed lines are skipped. */
export function createNdjsonReader<T>(onEvent: (event: T) => void) {
  let buffer = ""
  const parse = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      onEvent(JSON.parse(trimmed) as T)
    } catch {
      // ignore a malformed line rather than dropping the whole answer
    }
  }
  return {
    feed(chunk: string) {
      buffer += chunk
      let i: number
      while ((i = buffer.indexOf("\n")) >= 0) {
        parse(buffer.slice(0, i))
        buffer = buffer.slice(i + 1)
      }
    },
    flush() {
      parse(buffer)
      buffer = ""
    },
  }
}
