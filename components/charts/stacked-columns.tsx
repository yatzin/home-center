import { CATEGORY_ORDER, categoryColor, categoryLabel, formatMoney, formatMoneyCompact, type YearColumn } from "@/lib/costs"

const CHART_HEIGHT = 180

// Columns are HTML, not SVG: text inside a scaled viewBox distorts and needs
// counter-scaling, and a stack of rectangles is something CSS already does well.
export function StackedColumns({ columns }: { columns: YearColumn[] }) {
  if (columns.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No spending recorded yet.</p>
  }

  // Only the categories actually present get a legend entry, walked in fixed
  // order so a category's colour never depends on which others are on screen.
  const present = CATEGORY_ORDER.filter((key) =>
    columns.some((column) => column.segments.some((segment) => segment.key === key))
  )

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ height: CHART_HEIGHT }}>
        {columns.map((column) => (
          <div key={column.year} className="flex h-full min-w-14 flex-1 flex-col justify-end gap-1.5">
            <div className="text-center text-xs tabular-nums text-muted-foreground">
              {formatMoneyCompact(column.total)}
            </div>
            <div
              className="flex w-full flex-col-reverse overflow-hidden rounded-t"
              style={{ height: `${Math.max(column.share * 100, 1)}%` }}
              title={`${column.year}: ${formatMoney(column.total)}`}
            >
              {column.segments.map((segment) => (
                <div
                  key={segment.key}
                  // A 1.5px surface-coloured border separates touching segments,
                  // so two similar hues never read as one block.
                  className="w-full border-b-[1.5px] border-card first:border-b-0"
                  // Zero-cost records are kept by design — a no-charge warranty
                  // visit is a real event — so a year can total $0 while still
                  // having segments. Dividing 0/0 there would emit NaN, an
                  // invalid height browsers silently drop; guard it to 0% so the
                  // segment collapses instead of rendering at an undefined size.
                  style={{
                    height: column.total > 0 ? `${(segment.total / column.total) * 100}%` : "0%",
                    backgroundColor: segment.color,
                  }}
                  title={`${column.year} · ${segment.label}: ${formatMoney(segment.total)}`}
                />
              ))}
            </div>
            <div className="text-center text-xs text-muted-foreground">{column.year}</div>
          </div>
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {present.map((key) => (
          <li key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: categoryColor(key) }}
              aria-hidden="true"
            />
            {categoryLabel(key)}
          </li>
        ))}
      </ul>
    </div>
  )
}
