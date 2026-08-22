"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { SortButton, ariaSort, type SortState } from "@/components/ui/sort-button"
import { PaginationBar } from "@/components/ui/pagination-bar"
import type { SortDir } from "@/lib/table-params"

function useUrlUpdate() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return useCallback(
    (changes: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === "") params.delete(key)
        else params.set(key, String(value))
      }
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [router, pathname, searchParams]
  )
}

export function UrlSortHead({
  column,
  label,
  defaultSort,
  defaultDir,
  initialDir = "asc",
  className,
  align = "left",
}: {
  column: string
  label: string
  /** The sort the server falls back to when the URL says nothing. */
  defaultSort: string
  defaultDir: SortDir
  /** Direction this column starts in when first clicked. */
  initialDir?: SortDir
  className?: string
  align?: "left" | "right"
}) {
  const searchParams = useSearchParams()
  const update = useUrlUpdate()

  const activeSort = searchParams.get("sort") ?? defaultSort
  const activeDir = (searchParams.get("dir") as SortDir | null) ?? defaultDir
  const state: SortState = activeSort === column ? activeDir : null

  // Re-sorting has to return to page 1 — otherwise you land on page 4 of a
  // freshly reordered list, which is a different set of rows entirely.
  const onClick = () =>
    update({
      sort: column,
      dir: state === null ? initialDir : state === "asc" ? "desc" : "asc",
      page: undefined,
    })

  return (
    <th
      scope="col"
      aria-sort={ariaSort(state)}
      className={`px-4 py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}
    >
      <SortButton label={label} state={state} onClick={onClick} />
    </th>
  )
}

export function UrlPaginationBar({
  page,
  pageCount,
  total,
  per,
  label,
}: {
  page: number
  pageCount: number
  total: number
  per: number
  label?: string
}) {
  const update = useUrlUpdate()
  return (
    <PaginationBar
      page={page}
      pageCount={pageCount}
      total={total}
      per={per}
      label={label}
      onPage={(p) => update({ page: p === 1 ? undefined : p })}
      // Changing page size changes which rows page N holds, so this resets too.
      onPer={(p) => update({ per: p === 25 ? undefined : p, page: undefined })}
    />
  )
}
