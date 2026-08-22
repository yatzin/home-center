"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { PAGE_SIZES } from "@/lib/table-params"

// Condenses a long run of pages into first / last / a window around the current
// one, with gaps marked by null.
function pageItems(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)

  const items: (number | null)[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(pageCount - 1, page + 1)

  if (start > 2) items.push(null)
  for (let p = start; p <= end; p++) items.push(p)
  if (end < pageCount - 1) items.push(null)

  items.push(pageCount)
  return items
}

export function PaginationBar({
  page,
  pageCount,
  total,
  per,
  onPage,
  onPer,
  label = "rows",
}: {
  page: number
  pageCount: number
  total: number
  per: number
  onPage: (page: number) => void
  onPer: (per: number) => void
  label?: string
}) {
  if (total === 0) return null

  const from = (page - 1) * per + 1
  const to = Math.min(page * per, total)

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-sm"
    >
      <p className="text-muted-foreground">
        Showing <span className="tabular-nums text-foreground">{from}–{to}</span> of{" "}
        <span className="tabular-nums text-foreground">{total}</span> {label}
      </p>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <label htmlFor="per-page" className="text-xs text-muted-foreground">Per page</label>
          <Select
            value={String(per)}
            onValueChange={(v) => v && onPer(Number(v))}
          >
            <SelectTrigger id="per-page" size="sm" className="w-[4.5rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <PageButton onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
              <ChevronLeft className="h-3.5 w-3.5" />
            </PageButton>

            {pageItems(page, pageCount).map((item, i) =>
              item === null ? (
                <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">…</span>
              ) : (
                <PageButton
                  key={item}
                  onClick={() => onPage(item)}
                  active={item === page}
                  aria-label={`Page ${item}`}
                  aria-current={item === page ? "page" : undefined}
                >
                  {item}
                </PageButton>
              )
            )}

            <PageButton onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
              <ChevronRight className="h-3.5 w-3.5" />
            </PageButton>
          </div>
        )}
      </div>
    </nav>
  )
}

function PageButton({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs font-medium tabular-nums transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-40",
        active && "bg-sidebar-primary/10 text-sidebar-primary hover:bg-sidebar-primary/15",
        className
      )}
      {...props}
    />
  )
}
