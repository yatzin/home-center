"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { SortableTableHead } from "@/components/ui/sortable-table-head"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { AssetImage } from "@/components/asset-image"
import { useClientTable, type Accessor } from "@/lib/use-client-table"
import { cn } from "@/lib/utils"
import type { SortDir } from "@/lib/table-params"
import type { AssetView } from "@/lib/asset-view"
import type { AssetType } from "@/app/generated/prisma/client"

// What a row looks like in the two card layouts. The list layout uses `columns`
// instead, so each asset type describes itself once per shape rather than once
// per layout.
export type AssetCardContent = {
  name: string
  subtitle?: string | null
  badge?: string | null
  meta?: { icon?: React.ElementType; text: string; clamp?: boolean }[]
  mono?: string | null
}

export type AssetColumn<T> = {
  key: string
  label: string
  sortable?: boolean
  className?: string
  cell: (row: T) => React.ReactNode
}

interface Props<T extends { id: string }> {
  items: T[]
  view: AssetView
  assetType: AssetType
  imageFilenameOf: (row: T) => string | null
  toCard: (row: T) => AssetCardContent
  columns: AssetColumn<T>[]
  accessors: Record<string, Accessor<T>>
  defaultSort: string
  defaultDir?: SortDir
  initialDirs?: Record<string, SortDir>
  renderActions: (row: T) => React.ReactNode
  onOpen: (row: T) => void
  label: string
}

export function AssetCollection<T extends { id: string }>({
  items,
  view,
  assetType,
  imageFilenameOf,
  toCard,
  columns,
  accessors,
  defaultSort,
  defaultDir = "asc",
  initialDirs,
  renderActions,
  onOpen,
  label,
}: Props<T>) {
  // Called unconditionally — hooks can't sit behind the view switch — but only
  // consumed by the list layout.
  const table = useClientTable({ rows: items, accessors, defaultSort, defaultDir, initialDirs })

  if (view === "list") {
    return (
      <div className="rounded-lg border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                {columns.map((column) =>
                  column.sortable === false ? (
                    <TableHead key={column.key} className={column.className}>{column.label}</TableHead>
                  ) : (
                    <SortableTableHead
                      key={column.key}
                      column={column.key}
                      label={column.label}
                      className={column.className}
                      sortState={table.sortState}
                      onToggle={table.toggleSort}
                    />
                  )
                )}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => onOpen(row)}>
                  <TableCell>
                    <AssetImage
                      assetType={assetType}
                      assetId={row.id}
                      imageFilename={imageFilenameOf(row)}
                      alt={toCard(row).name}
                      className="h-8 w-8 rounded-md text-[10px] font-medium"
                    />
                  </TableCell>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>{column.cell(row)}</TableCell>
                  ))}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {renderActions(row)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {table.total > table.per && (
          <PaginationBar
            page={table.page}
            pageCount={table.pageCount}
            total={table.total}
            per={table.per}
            onPage={table.setPage}
            onPer={table.setPer}
            label={label}
          />
        )}
      </div>
    )
  }

  const compact = view === "compact"

  return (
    <div
      className={cn(
        "grid gap-4",
        compact
          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      )}
    >
      {items.map((row) => {
        const card = toCard(row)
        return (
          <Card
            key={row.id}
            className={cn(
              "cursor-pointer transition-all duration-150 hover:-translate-y-1 hover:bg-muted hover:shadow-md",
              compact && "gap-0 py-0 overflow-hidden"
            )}
            onClick={() => onOpen(row)}
          >
            <AssetImage
              assetType={assetType}
              assetId={row.id}
              imageFilename={imageFilenameOf(row)}
              alt={card.name}
              className={cn("w-full", compact ? "h-20" : "h-36")}
            />

            <CardHeader className={cn(compact ? "gap-0.5 px-3 pt-2.5 pb-0" : "pb-2")}>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className={cn("leading-snug", compact ? "truncate text-sm" : "text-base")}>
                  {card.name}
                </CardTitle>
                <div onClick={(e) => e.stopPropagation()}>{renderActions(row)}</div>
              </div>

              {card.badge && (
                <Badge variant="secondary" className="w-fit text-xs">{card.badge}</Badge>
              )}

              {card.subtitle && (
                <p className={cn("text-muted-foreground", compact ? "truncate text-xs" : "text-sm")}>
                  {card.subtitle}
                </p>
              )}
            </CardHeader>

            {/* The small cards deliberately stop at name + badge + subtitle;
                packing six per row leaves no width for detail lines. */}
            {!compact && (card.meta?.length || card.mono) && (
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {card.meta?.map((entry, i) => {
                  const Icon = entry.icon
                  return Icon ? (
                    <div key={i} className="flex items-start gap-1.5">
                      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className={entry.clamp ? "line-clamp-2" : undefined}>{entry.text}</span>
                    </div>
                  ) : (
                    <p key={i}>{entry.text}</p>
                  )
                })}
                {card.mono && <p className="font-mono text-xs truncate">{card.mono}</p>}
              </CardContent>
            )}

            {compact && <div className="pb-2.5" />}
          </Card>
        )
      })}
    </div>
  )
}
