import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RankedBars } from "@/components/charts/ranked-bars"
import { StackedColumns } from "@/components/charts/stacked-columns"
import { loadCostRecords } from "@/lib/costs-server"
import { loadAssetIndex } from "@/lib/assets-server"
import { assetHref, assetIcon } from "@/lib/assets"
import {
  CATEGORY_ORDER, averagePerMonth, byAsset, byCategory, byVendor, categoryColor,
  categoryLabel, formatMoney, inYear, parseAssetKey, ranked, stackedByYear, sum,
  yearToDate, type CategoryKey, type CostRow,
} from "@/lib/costs"

const TOP_ASSETS = 8
const TOP_VENDORS = 6
const BIGGEST_EXPENSES = 8

export default async function CostsPage() {
  const now = new Date()
  const [rows, assets] = await Promise.all([loadCostRecords(), loadAssetIndex()])

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <Heading />
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">No costs recorded yet</p>
          <p className="mt-1 text-sm">
            Add a cost to a service record and this page will start reporting on it.
          </p>
        </div>
      </div>
    )
  }

  const thisYear = now.getFullYear()
  const columns = stackedByYear(rows)
  const assetEntries = ranked(byAsset(rows), {
    limit: TOP_ASSETS,
    label: (key) => {
      const { assetType, assetId } = parseAssetKey(key)
      return assets.assetName(assetType, assetId) ?? "Unknown"
    },
  })
  // No cast needed: Map's methods are bivariant in TypeScript, so a
  // Map<CategoryKey, Bucket> is assignable to the Map<string, Bucket> ranked takes.
  const categoryEntries = ranked(byCategory(rows), { label: (key) => categoryLabel(key as CategoryKey) })
  const vendorEntries = ranked(byVendor(rows), { limit: TOP_VENDORS })
  const biggest = [...rows].sort((a, b) => b.cost - a.cost).slice(0, BIGGEST_EXPENSES)

  return (
    <div className="space-y-6">
      <Heading />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={`${thisYear} to date`} value={formatMoney(sum(yearToDate(rows, now)))} />
        <Kpi label={`All of ${thisYear - 1}`} value={formatMoney(sum(inYear(rows, thisYear - 1)))} />
        <Kpi label="All time" value={formatMoney(sum(rows))} />
        <Kpi label="Average per month" value={formatMoney(averagePerMonth(rows, now))} />
      </div>

      <Panel title="Spend by year">
        <StackedColumns columns={columns} />
        {/* The table is the relief channel for the three category hues that sit
            below 3:1 on the light surface, and doubles as the accessible
            alternative to reading the stack. It is required, not decorative. */}
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Show as table
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Year</th>
                  {CATEGORY_ORDER.map((key) => (
                    <th key={key} scope="col" className="px-3 py-2 text-right font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: categoryColor(key) }} />
                        {categoryLabel(key)}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {columns.map((column) => (
                  <tr key={column.year}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">{column.year}</th>
                    {CATEGORY_ORDER.map((key) => {
                      const segment = column.segments.find((s) => s.key === key)
                      return (
                        <td key={key} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {segment ? formatMoney(segment.total) : "—"}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(column.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Spend by asset">
          <RankedBars
            entries={assetEntries}
            hrefFor={(entry) => {
              const { assetType, assetId } = parseAssetKey(entry.key)
              return assetHref(assetType, assetId)
            }}
          />
        </Panel>

        <Panel title="Spend by category">
          <RankedBars entries={categoryEntries} />
        </Panel>

        <Panel title="Top vendors">
          <RankedBars entries={vendorEntries} emptyMessage="No vendors recorded yet." />
        </Panel>

        <Panel title="Biggest single expenses">
          <ul className="space-y-1">
            {biggest.map((row, i) => (
              <BiggestRow key={`${row.title}-${i}`} row={row} assets={assets} />
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

function Heading() {
  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Costs</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        What your homes, vehicles, and equipment have cost to keep.
      </p>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="py-4">
      <CardContent className="px-5">
        <div className="text-[22px] font-semibold leading-none tabular-nums">{value}</div>
        <div className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="py-5">
      <CardHeader className="px-5 pb-1">
        <CardTitle className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  )
}

function BiggestRow({ row, assets }: { row: CostRow; assets: Awaited<ReturnType<typeof loadAssetIndex>> }) {
  const AssetIcon = assetIcon[row.assetType]
  const name = assets.assetName(row.assetType, row.assetId)
  return (
    <li>
      <Link
        href={assetHref(row.assetType, row.assetId)}
        className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-muted/60"
      >
        <AssetIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{row.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{name ?? "Unknown"}</span>
        <span className="shrink-0 tabular-nums">{formatMoney(row.cost)}</span>
      </Link>
    </li>
  )
}
