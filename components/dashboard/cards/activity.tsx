"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CalendarDays } from "lucide-react"
import { ChartTable } from "@/components/charts/primitives/chart-table"
import { useSize } from "@/components/charts/primitives/use-width"
import { useFormat } from "@/components/regional-provider"
import type { ActivityHeatData } from "@/lib/dashboard/loaders"
import { buildHeat, columnGeometry, heatGeometry, heatStats, rowGeometry, type HeatCell, type HeatGeometry, type HeatGrid, type HeatShade } from "@/lib/dashboard/activity-heatmap"
import { RATING_WORDS } from "@/lib/day-ratings"
import { cn } from "@/lib/utils"
import { CardMessage, CardShell } from "./card-shell"
import type { CardViewProps } from "./types"

// Activity: when service was recorded, a square a day. Size is a lens: a count
// for the period; in one row or one column, the calendar filling the card
// with the title fading in on hover; the calendar; the whole range with month and weekday labels, a legend and a
// readout for the day you point at or tap; and the numbers behind it. Cells
// are never smaller than 5px: the oldest weeks drop off first
// (lib/dashboard/activity-heatmap.ts decides what fits). The same data is an
// sr-only table of the active days. One view serves two cards: service
// records (narrowed to an asset if set) and health observations (all people
// or one) and people's visits; `data.kind` picks the words. Observation days are shaded the way
// the Observations tab does: by the worst entry that day (mild to severe),
// not by how many there were.

const TIER_FLAT = 1
const TIER_COLUMN = 2
const TIER_LABELED = 4
const TIER_INSIGHTS = 5

const WORDS = {
  service: { title: "Services", one: "record", many: "records", cost: true, emptyAll: "No service recorded yet.", hint: "Each service record you add shades its day.", go: "Go to records" },
  visit: {
    title: "Health Visits & Expenses",
    one: "visit",
    many: "visits",
    cost: true,
    emptyAll: "No visits recorded yet.",
    hint: "Each visit you log shades its day.",
    go: "Go to people",
  },
  observation: {
    title: "Health Observations",
    one: "observation",
    many: "observations",
    cost: false,
    emptyAll: "No observations logged yet.",
    hint: "Each observation you log shades its day.",
    go: "Go to people",
  },
} as const

const titleOf = (data: ActivityHeatData) => (data.subject ? `${WORDS[data.kind].title} · ${data.subject}` : WORDS[data.kind].title)

function isHeatData(data: unknown): data is ActivityHeatData {
  return (
    typeof data === "object" &&
    data !== null &&
    "days" in data &&
    Array.isArray(data.days) &&
    "today" in data &&
    typeof data.today === "string" &&
    "weeks" in data &&
    typeof data.weeks === "number" &&
    "everRecords" in data &&
    typeof data.everRecords === "number" &&
    "kind" in data &&
    (data.kind === "service" || data.kind === "visit" || data.kind === "observation")
  )
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" })
const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" })
const MONTH_LONG = new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" })

const dateOf = (key: string) => new Date(`${key}T00:00:00Z`)
const monthName = (month: number, long = false) => (long ? MONTH_LONG : MONTH_SHORT).format(new Date(Date.UTC(2026, month, 1)))
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

const LEVEL_OPACITY = [0, 0.25, 0.45, 0.7, 1] as const

/** The Observations tab's six shades: quiet, then a day's rating from mild (1) to severe (5). */
const RATING_FILL = [
  "color-mix(in oklch, var(--muted-foreground) 13%, var(--card))",
  "color-mix(in oklch, var(--cost-bar) 30%, var(--card))",
  "color-mix(in oklch, var(--cost-bar) 47%, var(--card))",
  "color-mix(in oklch, var(--cost-bar) 64%, var(--card))",
  "color-mix(in oklch, var(--cost-bar) 82%, var(--card))",
  "var(--cost-bar)",
] as const

const shadeOf = (kind: ActivityHeatData["kind"]): HeatShade => (kind === "observation" ? "rating" : "count")

/** The fill of a cell: by rating for observations, else the primary colour at a level's opacity. */
const cellStyle = (shade: HeatShade, cell: Pick<HeatCell, "level">): React.CSSProperties =>
  shade === "rating"
    ? { fill: RATING_FILL[cell.level] }
    : cell.level === 0
      ? { fill: "var(--muted)" }
      : { fill: "var(--primary)", fillOpacity: LEVEL_OPACITY[cell.level as 1 | 2 | 3 | 4] }

function useHeat(data: ActivityHeatData) {
  return useMemo(() => {
    const today = dateOf(data.today)
    return { today, stats: heatStats(data.days, today, data.weeks) }
  }, [data])
}

/** The latest `geo.weeks` columns of the grid. */
function visibleGrid(grid: HeatGrid, weeks: number) {
  const skip = grid.columns.length - weeks
  return {
    columns: grid.columns.slice(skip),
    months: grid.months.filter((m) => m.col >= skip).map((m) => ({ ...m, col: m.col - skip })),
  }
}

function useReadout(kind: ActivityHeatData["kind"]) {
  const fmt = useFormat()
  const w = WORDS[kind]
  return (cell: HeatCell) => {
    const d = dateOf(cell.key)
    const when = `${WEEKDAY_FORMAT.format(d)}, ${fmt.date(d, { utc: true })}`
    if (cell.count === 0) return `${when} · no ${w.many}`
    const rated = kind === "observation" ? ` · ${RATING_WORDS[cell.rating]} day (${cell.rating} / 5)` : ""
    return `${when} · ${plural(cell.count, w.one, w.many)}${rated}${w.cost && cell.spend > 0 ? ` · ${fmt.money(cell.spend)}` : ""}`
  }
}

function Heat({
  data,
  geo,
  labels,
  onActive,
  active,
}: {
  data: ActivityHeatData
  geo: HeatGeometry
  labels: boolean
  onActive?: (cell: HeatCell | null) => void
  active?: HeatCell | null
}) {
  const readout = useReadout(data.kind)
  const { today } = useHeat(data)
  const grid = useMemo(() => buildHeat(data.days, today, data.weeks, shadeOf(data.kind)), [data, today])
  const shade = shadeOf(data.kind)
  if (geo.weeks === 0) return null
  const { columns, months } = visibleGrid(grid, geo.weeks)
  const step = geo.cell + geo.gap
  const width = geo.left + geo.weeks * step - geo.gap
  const height = geo.top + 7 * step - geo.gap
  // Month names only where there is room for them (about 28px a label).
  const labelled = months.filter((m, i) => i === 0 || (m.col - months[i - 1].col) * step >= 28)
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${titleOf(data)} by day, ${data.months} months`}
      className="block max-w-full overflow-visible"
      onPointerLeave={() => onActive?.(null)}
    >
      {labels
        ? labelled.map((m) => (
            <text key={`${m.col}-${m.month}`} x={geo.left + m.col * step} y={geo.top - 5} className="fill-muted-foreground" fontSize={10}>
              {monthName(m.month)}
            </text>
          ))
        : null}
      {labels && geo.cell >= 8
        ? [1, 3, 5].map((r) => (
            <text key={r} x={0} y={geo.top + r * step + geo.cell * 0.78} className="fill-muted-foreground" fontSize={9}>
              {WEEKDAY_FORMAT.format(new Date(Date.UTC(2026, 0, 4 + r)))}
            </text>
          ))
        : null}
      {columns.map((col, c) =>
        col.map((cell, r) => (
          <rect
            key={cell.key}
            x={geo.left + c * step}
            y={geo.top + r * step}
            width={geo.cell}
            height={geo.cell}
            rx={Math.min(2, geo.cell / 4)}
            style={cellStyle(shade, cell)}
            stroke={active?.key === cell.key ? "var(--foreground)" : undefined}
            strokeWidth={active?.key === cell.key ? 1.5 : undefined}
            onPointerEnter={() => onActive?.(cell)}
            onClick={() => onActive?.(cell)}
          >
            <title>{readout(cell)}</title>
          </rect>
        )),
      )}
    </svg>
  )
}

function Legend({ shade }: { shade: HeatShade }) {
  const levels = shade === "rating" ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4]
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground" aria-hidden>
      {shade === "rating" ? "Mild" : "Less"}
      {levels.map((level) => (
        <span key={level} className="size-2.5 rounded-[2px]" style={{ backgroundColor: shade === "rating" ? RATING_FILL[level] : level === 0 ? "var(--muted)" : "var(--primary)", opacity: shade === "rating" || level === 0 ? 1 : LEVEL_OPACITY[level as 1 | 2 | 3 | 4] }} />
      ))}
      {shade === "rating" ? "Severe" : "More"}
    </span>
  )
}

function A11yTable({ data }: { data: ActivityHeatData }) {
  const fmt = useFormat()
  const w = WORDS[data.kind]
  const rows = [...data.days].reverse().map((d) => ({
    date: fmt.date(dateOf(d.key), { utc: true }),
    records: d.count,
    spend: d.spend > 0 ? fmt.money(d.spend) : "–",
    rating: d.rating !== undefined ? `${RATING_WORDS[Math.min(5, Math.max(1, Math.round(d.rating)))]} (${Math.min(5, Math.max(1, Math.round(d.rating)))} / 5)` : "–",
  }))
  return (
    <ChartTable
      srOnly
      caption={`Days with ${w.many} ${data.kind === "observation" ? "logged" : "recorded"}${data.subject ? ` for ${data.subject}` : ""}, last ${data.months} months`}
      columns={[
        { key: "date", label: "Date" },
        { key: "records", label: w.many.charAt(0).toUpperCase() + w.many.slice(1), align: "right" },
        ...(w.cost ? [{ key: "spend", label: "Cost", align: "right" as const }] : []),
        ...(data.kind === "observation" ? [{ key: "rating", label: "Worst entry", align: "right" as const }] : []),
      ]}
      rows={rows}
    />
  )
}

/** A body that reports its size to a render function. */
function Region({ className, children }: { className?: string; children: (box: { width: number; height: number }) => React.ReactNode }) {
  const [ref, box] = useSize<HTMLDivElement>()
  return (
    <div ref={ref} className={cn("relative min-h-0 min-w-0", className)}>
      {children(box)}
    </div>
  )
}

const PERIOD = (data: ActivityHeatData) => `past ${data.months === 1 ? "month" : `${data.months} months`}`

function Empty({ data, compact }: { data: ActivityHeatData; compact: boolean }) {
  const w = WORDS[data.kind]
  if (compact) {
    return (
      <Link href={data.href} className="flex h-full flex-col justify-center gap-0.5 px-3 py-2 transition-colors duration-150 hover:bg-muted/40">
        <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{w.title}</span>
        <span className="text-sm leading-tight font-medium">
          {data.missing ? "Item gone" : data.everRecords > 0 ? `None in ${data.months} mo` : `No ${w.many}`}
        </span>
      </Link>
    )
  }
  return (
    <CardShell title={titleOf(data)} href={undefined}>
      <CardMessage
        icon={CalendarDays}
        message={
          data.missing
            ? `This ${data.kind === "service" ? "asset" : "person"} no longer exists.`
            : data.everRecords > 0
              ? `No ${w.many} in the past ${data.months} months.`
              : w.emptyAll
        }
        note={data.missing ? "Open the card's settings and choose another." : w.hint}
        action={{ href: data.href, label: w.go }}
      />
    </CardShell>
  )
}

function Compact({ data }: { data: ActivityHeatData }) {
  const { stats } = useHeat(data)
  const [ref, box] = useSize<HTMLDivElement>()
  return (
    <div ref={ref} className="flex h-full min-w-0 flex-col justify-center gap-0.5 px-3 py-2">
      <Link
        href={data.href}
        aria-label={`${titleOf(data)}: ${plural(stats.records, WORDS[data.kind].one, WORDS[data.kind].many)}, ${PERIOD(data)}`}
        className="block min-w-0 shrink-0 rounded-md py-0.5 transition-colors duration-150 hover:bg-muted/40"
      >
        <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{titleOf(data)}</span>
        <span className="block text-2xl leading-tight font-semibold tabular-nums">{stats.records.toLocaleString()}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{box.width < 110 ? `${data.months} mo` : `${WORDS[data.kind].many}, ${PERIOD(data)}`}</span>
      </Link>
    </div>
  )
}

/**
 * One row tall (two or more columns wide), or one column wide (two or more
 * rows tall): the calendar fills the whole card. A row keeps the usual
 * orientation (weekdays down, weeks across, newest at the right); a column
 * turns it (weekdays across, weeks down, newest at the bottom). The title is
 * always shown at the top left, about 30% of the card's height (at most 64px),
 * over the calendar. Point at it and it jumps to the opposite corner, so the
 * days under it can be read; point at it there and it jumps back. It returns
 * to the top left when the pointer leaves the card. A hovered or tapped day
 * shows its readout in the title's place.
 */
const TITLE_SHARE = 0.3
const TITLE_MAX = 64
const TITLE_INSET = 4

function Fill({ data, axis }: { data: ActivityHeatData; axis: "row" | "column" }) {
  const [ref, box] = useSize<HTMLDivElement>()
  const [active, setActive] = useState<HeatCell | null>(null)
  const [away, setAway] = useState(false)
  const readout = useReadout(data.kind)
  const { today } = useHeat(data)
  const shade = shadeOf(data.kind)
  const grid = useMemo(() => buildHeat(data.days, today, data.weeks, shade), [data, today, shade])
  const geo = (axis === "column" ? columnGeometry : rowGeometry)({ width: box.width, height: box.height, weeks: data.weeks })
  const step = geo.cell + geo.gap
  const columns = geo.weeks > 0 ? grid.columns.slice(grid.columns.length - geo.weeks) : []
  const long = geo.pad * 2 + geo.weeks * step - geo.gap
  const width = axis === "column" ? box.width : long
  const height = axis === "column" ? long : box.height

  // The title's box, fixed in px so that jumping to the other corner is a transform.
  const titleH = Math.round(Math.min(TITLE_MAX, box.height * TITLE_SHARE))
  const titleW = Math.round(axis === "column" ? box.width - TITLE_INSET * 2 : Math.min(box.width - TITLE_INSET * 2, Math.max(76, box.width * 0.6)))
  const titleFont = Math.max(10, Math.min(15, Math.round(titleH * 0.4)))
  const showTitle = box.width > 0 && titleH >= 18 && titleW >= 40
  const dx = away ? box.width - titleW - TITLE_INSET * 2 : 0
  const dy = away ? box.height - titleH - TITLE_INSET * 2 : 0

  return (
    <div
      ref={ref}
      className="relative h-full min-h-0 w-full overflow-hidden"
      onPointerLeave={() => {
        setActive(null)
        setAway(false)
      }}
    >
      {geo.weeks > 0 ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${titleOf(data)} by day, ${data.months} months`}
          className="absolute right-0 bottom-0 block"
        >
          {columns.map((col, c) =>
            col.map((cell, r) => (
              <rect
                key={cell.key}
                x={geo.pad + (axis === "column" ? r : c) * step}
                y={geo.pad + (axis === "column" ? c : r) * step}
                width={geo.cell}
                height={geo.cell}
                rx={Math.min(2, geo.cell / 4)}
                style={cellStyle(shade, cell)}
                stroke={active?.key === cell.key ? "var(--foreground)" : undefined}
                strokeWidth={active?.key === cell.key ? 1.5 : undefined}
                onPointerEnter={() => setActive(cell)}
                onClick={() => setActive(cell)}
              >
                <title>{readout(cell)}</title>
              </rect>
            )),
          )}
        </svg>
      ) : null}
      {showTitle ? (
        <div
          aria-hidden
          onPointerEnter={() => setAway((a) => !a)}
          className="absolute z-10 flex items-center overflow-hidden rounded-md opacity-75 bg-card/85 px-2 leading-tight font-medium tracking-wide text-muted-foreground uppercase shadow-sm backdrop-blur-sm motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
          style={{
            top: TITLE_INSET,
            left: TITLE_INSET,
            width: titleW,
            height: titleH,
            fontSize: titleFont,
            transform: `translate(${dx}px, ${dy}px)`,
          }}
        >
          <span className={cn("line-clamp-3 min-w-0", active && "normal-case")}>{active ? readout(active) : titleOf(data)}</span>
        </div>
      ) : null}
    </div>
  )
}

function Rich({ data, tier }: { data: ActivityHeatData; tier: number }) {
  const fmt = useFormat()
  const { stats } = useHeat(data)
  const readout = useReadout(data.kind)
  const w = WORDS[data.kind]
  const [outerRef, outer] = useSize<HTMLDivElement>()
  const [active, setActive] = useState<HeatCell | null>(null)
  const narrow = outer.width > 0 && outer.width < 230
  const labeled = tier >= TIER_LABELED
  const insights = tier >= TIER_INSIGHTS && outer.width >= 440

  const summary =
    stats.records === 0
      ? `No ${w.many} in this range.`
      : `${plural(stats.records, w.one, w.many)} on ${plural(stats.activeDays, "day")}`
  const line = active ? readout(active) : labeled && stats.busiestMonth ? `Busiest month: ${monthName(Number(stats.busiestMonth.key.slice(5)) - 1, true)} (${stats.busiestMonth.count})` : summary

  const footer = (
    <div className="flex min-h-5 shrink-0 items-center justify-between gap-3">
      <p className="min-w-0 truncate text-xs text-muted-foreground" aria-live="polite">
        {line}
      </p>
      {labeled ? <Legend shade={shadeOf(data.kind)} /> : null}
    </div>
  )

  const stat = (label: string, value: string, note?: string) => (
    <div className="min-w-0">
      <h3 className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</h3>
      <p className="mt-0.5 truncate text-lg leading-tight font-semibold tabular-nums">{value}</p>
      {note ? <p className="truncate text-[11px] text-muted-foreground">{note}</p> : null}
    </div>
  )

  return (
    <div ref={outerRef} className="h-full min-h-0">
      <CardShell title={titleOf(data)} href={narrow ? undefined : data.href} className="px-5 pb-4">
        <div className="flex h-full min-h-0 flex-col gap-2">
          <Region className="flex-1">
            {(box) => {
              const geo = heatGeometry({ width: box.width, height: box.height, weeks: data.weeks, labels: labeled, minCell: labeled ? 8 : 6 })
              return (
                <div className="absolute inset-0 flex items-center overflow-hidden">
                  <Heat data={data} geo={geo} labels={labeled} active={active} onActive={setActive} />
                </div>
              )
            }}
          </Region>
          {footer}
          {insights ? (
            <div className="grid shrink-0 grid-cols-4 gap-4 border-t border-border pt-3">
              {stat(w.many.charAt(0).toUpperCase() + w.many.slice(1), stats.records.toLocaleString(), `on ${plural(stats.activeDays, "day")}`)}
              {data.kind === "observation"
                ? stat("Severe days", stats.severeDays.toLocaleString(), "rated 4 or 5 of 5")
                : stat(
                    "Busiest month",
                    stats.busiestMonth ? monthName(Number(stats.busiestMonth.key.slice(5)) - 1, true) : "–",
                    stats.busiestMonth ? plural(stats.busiestMonth.count, w.one, w.many) : undefined,
                  )}
              {stat(
                data.kind === "service" ? "Last record" : data.kind === "visit" ? "Last visit" : "Last logged",
                stats.sinceLast === null ? "–" : stats.sinceLast === 0 ? "Today" : `${stats.sinceLast} d ago`,
              )}
              {stat("Longest quiet", stats.longestQuiet > 0 ? `${stats.longestQuiet} d` : "–", w.cost && stats.spend > 0 ? `${fmt.money(stats.spend)} spent` : undefined)}
            </div>
          ) : null}
        </div>
      </CardShell>
    </div>
  )
}

export function ActivityCard({ data, tier }: CardViewProps) {
  if (!isHeatData(data)) throw new Error("Unexpected Activity card data")
  const total = data.days.reduce((n, d) => n + d.count, 0)
  if (total === 0) return <Empty data={data} compact={tier <= TIER_COLUMN} />
  return (
    <>
      {tier === 0 ? <Compact data={data} /> : tier === TIER_FLAT ? <Fill data={data} axis="row" /> : tier === TIER_COLUMN ? <Fill data={data} axis="column" /> : <Rich data={data} tier={tier} />}
      <A11yTable data={data} />
    </>
  )
}
