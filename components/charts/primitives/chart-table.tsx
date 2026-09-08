// The accessible twin every chart ships with.
//
// The /costs stack needed one from the start, because three of the category hues
// measure below 3:1 against the light card and colour alone cannot carry them.
// Rather than keep that as a one-off on a single panel, it is a primitive: any
// chart can be read as numbers, and no value is reachable only by hovering.

export type TableColumn = { key: string; label: string; align?: "left" | "right" }

export function ChartTable({
  columns,
  rows,
  caption,
  summary = "Show as table",
}: {
  columns: TableColumn[]
  rows: Record<string, React.ReactNode>[]
  caption?: string
  summary?: string
}) {
  if (rows.length === 0) return null

  return (
    <details className="mt-3 group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
        {summary}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={
                    column.align === "right"
                      ? "px-3 py-2 text-right text-xs font-medium"
                      : "px-3 py-2 text-left text-xs font-medium"
                  }
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((column, j) => {
                  const className =
                    column.align === "right"
                      ? "px-3 py-1.5 text-right tabular-nums"
                      : "px-3 py-1.5 text-left"
                  // The first cell is the row's header, which is what lets a
                  // screen reader announce "March 2026, Repair, $412" instead of
                  // reading three unattached numbers.
                  return j === 0 ? (
                    <th key={column.key} scope="row" className={`${className} font-normal`}>
                      {row[column.key]}
                    </th>
                  ) : (
                    <td key={column.key} className={`${className} text-muted-foreground`}>
                      {row[column.key]}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
