"use client"

import { useMemo, useState } from "react"
import { DEFAULT_PAGE_SIZE, type SortDir } from "@/lib/table-params"
import type { SortState } from "@/components/ui/sort-button"

export type Accessor<T> = (row: T) => string | number | Date | null | undefined

// Sorting + paging for the per-asset tab tables, where the full (asset-scoped)
// set is already in memory. The cross-asset pages do this in SQL instead —
// there the set is unbounded, so it can't be sorted in the browser.
//
// Define `accessors` at module scope: a fresh object each render would re-sort
// on every render.
export function useClientTable<T extends { id: string }>({
  rows,
  accessors,
  defaultSort,
  defaultDir = "desc",
  initialDirs,
}: {
  rows: T[]
  accessors: Record<string, Accessor<T>>
  defaultSort: string
  defaultDir?: SortDir
  initialDirs?: Record<string, SortDir>
}) {
  const [sort, setSort] = useState(defaultSort)
  const [dir, setDir] = useState<SortDir>(defaultDir)
  const [page, setPage] = useState(1)
  const [per, setPer] = useState<number>(DEFAULT_PAGE_SIZE)

  const sorted = useMemo(() => {
    const accessor = accessors[sort] ?? accessors[defaultSort]
    const factor = dir === "asc" ? 1 : -1

    return [...rows].sort((a, b) => {
      const av = accessor(a)
      const bv = accessor(b)
      const aEmpty = av === null || av === undefined || av === ""
      const bEmpty = bv === null || bv === undefined || bv === ""

      // Empties sort last in both directions, matching `nulls: "last"` on the
      // SQL side — otherwise "cheapest first" opens with a wall of blanks.
      if (aEmpty && bEmpty) return a.id.localeCompare(b.id)
      if (aEmpty) return 1
      if (bEmpty) return -1

      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv, undefined, { sensitivity: "base" })
          : Number(av) - Number(bv)

      return cmp !== 0 ? cmp * factor : a.id.localeCompare(b.id)
    })
  }, [rows, accessors, sort, dir, defaultSort])

  const total = sorted.length
  const pageCount = Math.max(1, Math.ceil(total / per))
  // Derived rather than corrected in an effect, so deleting the last row of the
  // last page can't leave the view stranded past the end.
  const safePage = Math.min(page, pageCount)

  const paged = useMemo(
    () => sorted.slice((safePage - 1) * per, safePage * per),
    [sorted, safePage, per]
  )

  return {
    rows: paged,
    total,
    page: safePage,
    pageCount,
    per,
    setPage,
    setPer: (next: number) => { setPer(next); setPage(1) },
    sortState: (column: string): SortState => (column === sort ? dir : null),
    toggleSort: (column: string) => {
      if (column === sort) setDir(dir === "asc" ? "desc" : "asc")
      else { setSort(column); setDir(initialDirs?.[column] ?? "asc") }
      setPage(1)
    },
  }
}
