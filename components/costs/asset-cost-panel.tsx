import { Sparkline } from "@/components/charts/sparkline"
import { loadCostRecords } from "@/lib/costs-server"
import { costPerMeter, formatMoney, sum, yearSeries, yearToDate } from "@/lib/costs"
import { meterUnitWord } from "@/lib/maintenance-due"
import type { AssetType, MeterUnit } from "@/app/generated/prisma/client"

export async function AssetCostPanel({
  assetType,
  assetId,
  purchasePrice,
  meterUnit,
}: {
  assetType: AssetType
  assetId: string
  purchasePrice?: number | null
  /// Vehicles only. Its presence is what turns on the cost-per-unit row.
  meterUnit?: MeterUnit
}) {
  const rows = await loadCostRecords({ assetId, assetType })
  // An asset nobody has spent on gets no panel at all — an empty one would be a
  // row of dashes claiming to be information.
  if (rows.length === 0) return null

  const now = new Date()
  const lifetime = sum(rows)
  const perMeter = meterUnit ? costPerMeter(rows) : null

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cost</div>

      <div>
        <div className="text-xl font-semibold tabular-nums leading-none">{formatMoney(lifetime)}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Service, across {rows.length} record{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      <Sparkline points={yearSeries(rows)} />

      <dl className="space-y-1.5 text-sm">
        <Row label={`${now.getFullYear()} to date`} value={formatMoney(sum(yearToDate(rows, now)))} />
        {perMeter != null && (
          <Row label={`Per ${meterUnitWord(meterUnit!)}`} value={formatMoney(perMeter)} />
        )}
        {purchasePrice != null && (
          <>
            <Row label="Purchase" value={formatMoney(purchasePrice)} />
            <Row label="Total owned cost" value={formatMoney(purchasePrice + lifetime)} strong />
          </>
        )}
      </dl>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  )
}
