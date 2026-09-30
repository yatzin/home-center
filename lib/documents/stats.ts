export type StatusCounts = Partial<Record<"DONE" | "PENDING" | "EMPTY" | "UNSUPPORTED" | "FAILED", number>>

/** The status line under the Documents settings card. */
export function formatIndexStats(c: StatusCounts, indexingEnabled: boolean): string {
  const n = (k: keyof StatusCounts) => c[k] ?? 0
  if (!indexingEnabled) {
    const waiting = n("PENDING")
    return waiting ? `Indexing is off — ${waiting} upload${waiting === 1 ? "" : "s"} waiting.` : "Indexing is off."
  }
  const parts = [`${n("DONE")} searchable`]
  if (n("PENDING")) parts.push(`${n("PENDING")} waiting`)
  if (n("FAILED")) parts.push(`${n("FAILED")} failed`)
  if (n("UNSUPPORTED")) parts.push(`${n("UNSUPPORTED")} not supported`)
  if (n("EMPTY")) parts.push(`${n("EMPTY")} with no text`)
  return parts.join(" · ")
}
