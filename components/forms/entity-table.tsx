"use client"

import { Fragment, useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { ChevronDown, Pencil, Trash2 } from "lucide-react"

export type EntityColumn<T> = {
  key: string
  label: string
  className?: string
  cell: (row: T) => React.ReactNode
}

interface Props<T extends { id: string }> {
  rows: T[]
  columns: EntityColumn<T>[]
  /** Names the row in aria-labels, e.g. "Penicillin allergy". */
  describe: (row: T) => string
  onEdit: (row: T) => void
  onDelete: (row: T) => void
  empty: string
  renderExpanded?: (row: T) => React.ReactNode
  extraActions?: (row: T) => React.ReactNode
}

// The small tables on a person page and the providers page. No sorting or
// paging: these lists are a handful of rows, ordered by the query that loads them.
export function EntityTable<T extends { id: string }>({
  rows, columns, describe, onEdit, onDelete, empty, renderExpanded, extraActions,
}: Props<T>) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{empty}</div>
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      {/* Phones: one card per row (the first column as its title, the rest as labelled values), in place of the table below. */}
      <ul className="divide-y md:hidden">
        {rows.map((row) => {
          const expanded = expandedId === row.id
          const [first, ...rest] = columns
          return (
            <li key={row.id}>
              <div className="flex items-start gap-1 pr-2">
                <button type="button" onClick={() => onEdit(row)} aria-label={`Edit ${describe(row)}`} className="min-w-0 flex-1 space-y-1.5 px-4 py-3 text-left active:bg-muted/50">
                  <span className="block text-sm font-medium">{first.cell(row)}</span>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {rest.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-muted-foreground">{c.label}</dt>
                        <dd className="break-words">{c.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                </button>
                <div className="flex shrink-0 items-center pt-1.5">
                  {extraActions?.(row)}
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${describe(row)}`} onClick={() => onDelete(row)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {renderExpanded && (
                    <Button variant="ghost" size="icon" aria-label={expanded ? "Hide details" : "Show details"} aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : row.id)}>
                      <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </Button>
                  )}
                </div>
              </div>
              {expanded && renderExpanded && <div className="bg-muted/30 px-4 py-3 text-sm">{renderExpanded(row)}</div>}
            </li>
          )
        })}
      </ul>
      <div className="overflow-x-auto max-md:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.className}>{c.label}</TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const expanded = expandedId === row.id
              return (
                <Fragment key={row.id}>
                  <TableRow className="cursor-pointer" onClick={() => onEdit(row)}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={c.className}>{c.cell(row)}</TableCell>
                    ))}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {extraActions?.(row)}
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${describe(row)}`} onClick={() => onEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`Delete ${describe(row)}`} onClick={() => onDelete(row)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        {renderExpanded && (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            aria-label={expanded ? "Hide details" : "Show details"} aria-expanded={expanded}
                            onClick={() => setExpandedId(expanded ? null : row.id)}
                          >
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded && renderExpanded && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columns.length + 1} className="bg-muted/30 whitespace-normal">
                        {renderExpanded(row)}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
