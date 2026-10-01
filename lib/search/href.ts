/** /search?q=…&semantic=1 — the one place the header box and the page agree on. */
export function searchHref(q: string, semantic: boolean) {
  const params = new URLSearchParams({ q })
  if (semantic) params.set("semantic", "1")
  return `/search?${params.toString()}`
}
