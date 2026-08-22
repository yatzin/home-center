"use client"

import { TableHead } from "@/components/ui/table"
import { SortButton, ariaSort, type SortState } from "@/components/ui/sort-button"

// Header cell for the in-memory tables (per-asset tabs). The cross-asset pages
// use UrlSortHead instead, which keeps the same state in the query string.
export function SortableTableHead({
  column,
  label,
  sortState,
  onToggle,
  className,
}: {
  column: string
  label: string
  sortState: (column: string) => SortState
  onToggle: (column: string) => void
  className?: string
}) {
  const state = sortState(column)
  return (
    <TableHead aria-sort={ariaSort(state)} className={className}>
      <SortButton label={label} state={state} onClick={() => onToggle(column)} />
    </TableHead>
  )
}
