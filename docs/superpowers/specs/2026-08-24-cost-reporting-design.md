# Cost Reporting — Design

**Date:** 2026-08-24
**Status:** Approved, pending implementation plan

## Problem

`ServiceRecord.cost` is captured on every service record and aggregated in exactly
one place: `app/(app)/records/page.tsx` sums it across the current filter to print a
single "$X total" line under the page heading. Nothing else in the app reads it.

A household cannot answer any of the questions the data already supports:

- What did I spend on this house last year, and on what?
- Which vehicle costs the most to keep on the road?
- Is this appliance worth repairing again, or has it already cost more than a new one?
- Who am I paying the most?

This design adds cost reporting across four surfaces without changing how costs are
entered, beyond one new optional field.

## Scope

**In scope:** aggregation layer, a `ServiceCategory` enum, a `/costs` page, a
per-asset cost panel on the three detail pages, a dashboard spend card, and
total-cost-of-ownership figures.

**Out of scope:** budgets and forecasting, currency other than USD, cost on
warranties or maintenance schedules, receipt parsing, CSV export, migrating money
from `Float` to integer cents.

## Decisions and assumptions

These were settled during brainstorming and are recorded here so implementation does
not relitigate them.

1. **Category is a real enum, not a derived value.** Grouping by `assetType` or by
   `EquipmentCategory` would need no migration, but it answers "what kind of thing did
   I spend on", not "what kind of spending was it". A new `roof repair` and a routine
   gutter cleaning are both `PROPERTY`, and that is the distinction users care about.
2. **Charts are hand-rolled, no charting dependency.** See "Charts" below.
3. **All four surfaces ship together.** The aggregation layer is shared, so the
   marginal cost of each additional surface after the first is small.
4. **`Vehicle.purchasePrice` is added.** `Property` and `Equipment` both carry
   `purchaseDate` + `purchasePrice`; `Vehicle` carries only `purchaseDate`. Without a
   price, total cost of ownership is impossible for the asset class where it matters
   most. Adding the field also makes the three asset models consistent.
5. **No test framework is introduced.** The repo has no test runner, no `test` script,
   and no test files. Adding one is a separate decision. The pure functions in
   `lib/costs.ts` are written to be directly unit-testable so that decision stays cheap
   to make later. Verification for this work is typecheck, lint, build, and a manual
   pass against the demo seed.

## Architecture

### Module split

The repo already pairs a client-safe pure module with a Prisma-backed server module
(`lib/assets.ts` / `lib/assets-server.ts`, `lib/maintenance-due.ts` /
`lib/maintenance-due-server.ts`). Cost reporting follows the same split.

```
lib/costs.ts          pure, client-safe: types, rollup, shaping, formatting
lib/costs-server.ts   Prisma: loads the minimal row set
components/charts/    presentation primitives, server components
components/costs/     the per-asset panel
app/(app)/costs/      the report page
```

### `lib/costs.ts` — the pure core

One primitive that every rollup is built from:

```ts
export type CostRow = {
  assetId: string
  assetType: AssetType
  date: Date
  cost: number
  category: ServiceCategory | null
  vendor: string | null
  title: string
}

export type Bucket = { total: number; count: number }

export function rollup<K extends string>(
  rows: CostRow[],
  keyFn: (row: CostRow) => K | null,
): Map<K, Bucket>
```

`byYear`, `byAsset`, `byCategory`, and `byVendor` are all `rollup` with a different
`keyFn`. A `null` key drops the row from that rollup, which is how records with no
vendor are excluded from vendor rankings without a separate filtering pass.

Also in this module:

- `formatMoney(n)` — USD, thousands separators, cents only where they matter.
- `CATEGORY_LABEL` and `CATEGORY_TONE` — display name and a CSS-variable-backed color
  token per category, including the `null` "Uncategorized" case.
- `ranked(map, limit)` — Map to a sorted array with each entry's share of the max, for
  the bar components.
- `stackedByYear(rows)` — year buckets, each split into category segments, shaped for
  the column chart.
- `perMeterUnit(rows, meterSpan)` — cost per mile or per hour.

Every function is a pure transform over plain data. None import Prisma.

### `lib/costs-server.ts` — the single query

```ts
export async function loadCostRecords(filter?: {
  assetId?: string
  assetType?: AssetType
  year?: number
}): Promise<CostRow[]>
```

Selects only the columns the rollups need, and only rows where `cost` is not null.
Callers then derive every rollup they need in memory from that one result.

**Why in-memory rather than `prisma.groupBy`:**

- SQLite cannot group by an extracted year without raw SQL, and year is the primary
  reporting axis.
- `assetId` is polymorphic with no foreign key, so no aggregate query can produce
  asset *names* — a second pass through `loadAssetIndex()` is required regardless.
- One page needs five different groupings of the same rows. One query and five
  in-memory folds is less work than five aggregate queries.
- Household data volume is hundreds to low thousands of rows.

**Scaling assumption:** this holds while the table stays under roughly 50,000 records
with a cost. Past that, `byYear` should move to raw SQL. Because callers only touch
the rollup API and never the row array directly, that change is contained to this
module.

## Data model changes

One migration containing three changes:

```prisma
/// What kind of spending a service record represents, as distinct from what it was
/// spent on. Nullable: records created before categories existed are genuinely
/// uncategorized, and reports say so rather than guessing.
enum ServiceCategory {
  ROUTINE
  REPAIR
  UPGRADE
  INSPECTION
  PARTS
  OTHER
}

model ServiceRecord {
  // ...
  category ServiceCategory?
}

model Vehicle {
  // ...
  purchasePrice Float?
}
```

`category` is nullable and has no default. `OTHER` means "the user looked at the list
and none of them fit"; `null` means "nobody has said". Reports show an
**Uncategorized** bucket so the gap is visible rather than silently folded into
`OTHER`, which would misstate the data on every record that predates this feature.

Precedent for SQLite enums exists throughout the current schema (`Role`,
`EquipmentCategory`, `MeterUnit`), so no new capability is being relied on.

### Entry path

`category` threads through the existing service-record write path with no structural
change:

- `lib/actions/service-records.ts` — add to the zod `schema` as an optional enum, and
  to `clean()` with the same empty-string-to-null handling the other optional fields use.
- `components/service-records/service-record-form-dialog.tsx` — a `Select` beside
  Cost, populated from `CATEGORY_LABEL`, following the existing `EquipmentCategory`
  select in the equipment dialog.

## Charts

No charting dependency is added. The app renders on the server with essentially no
client JavaScript, and `recharts` would mean a client boundary and a large bundle for
what are, in the end, rectangles.

The medium is chosen per shape rather than uniformly:

| Shape | Medium | Reason |
|---|---|---|
| Ranked bars — spend by asset, vendor, category | HTML + CSS | A width-percentage fill in a flex row. Labels stay crisp text, wrap responsively, and inherit theme colors directly. |
| Stacked columns — spend by year × category | HTML + CSS | Flex columns with height-percentage segments. Same reasoning. |
| Sparkline — a single asset's spend per year | Inline SVG | A polyline through N points is the one shape CSS cannot express. |

Consequences worth stating: text inside a scaled SVG `viewBox` distorts and needs
counter-scaling, which is the main reason the first two are not SVG. All three are
server components. Color comes from existing CSS variables, so light and dark themes
work with no per-theme code. Hover detail uses native `title` attributes, so it needs
no JavaScript and is reachable by assistive technology.

### Components

```
components/charts/ranked-bars.tsx      label + value + proportional fill, top N
components/charts/stacked-columns.tsx  one column per year, segmented by category
components/charts/sparkline.tsx        inline SVG polyline, sized by prop
```

Each takes already-shaped data from `lib/costs.ts` and renders it. None of them know
what a `ServiceRecord` is, which keeps them reusable if another metric ever needs the
same treatment.

## Surfaces

### 1. `/costs` — the report page

New sidebar entry after Service Records. Server component, filter state in
`searchParams`, reusing `withParams` from `lib/table-params.ts` so the URL stays
shareable and consistent with the other list pages.

- **KPI row** — spend this calendar year to date, spend in the previous full calendar
  year, all-time spend, and average per month. Average per month divides all-time
  spend by the number of months between the earliest record with a cost and today, so
  a household two months into using the app is not shown a twelve-month average.
- **Spend by year** — stacked columns split by category, the page's centerpiece.
- **Spend by asset** — ranked bars, each linking to that asset's detail page.
- **By category** — ranked bars, including Uncategorized.
- **Top vendors** — ranked bars.
- **Biggest expenses** — a table of the largest single records, each linking to its asset.
- **Filters** — year, and asset type.

Empty state matches the existing dashed-border pattern used on `/records`.

### 2. Per-asset cost panel

`components/costs/asset-cost-panel.tsx`, rendered in the left `aside` of the property,
vehicle, and equipment detail pages, below the existing `Stat` rows.

- Lifetime service spend and spend year-to-date.
- Yearly sparkline.
- Purchase price, and purchase + service as total cost of ownership.
- Vehicles only: cost per mile or per hour, derived from the `mileageAtService` span
  across that vehicle's records and labeled using the existing `meterUnit` helpers.

Every figure is omitted rather than shown as zero when its inputs are missing — an
asset with no recorded costs shows no panel, not an empty one.

### 3. Dashboard spend card

Spend year-to-date against the same period last year, with the delta and a small bar,
linking through to `/costs`. Slots into the existing summary card grid in
`app/(app)/page.tsx` and uses the same `Promise.all` batch the page already runs.

## Money precision

`cost` is a `Float`, so summing many values accumulates sub-cent drift. Rollup totals
are rounded to cents at the boundary (`Math.round(n * 100) / 100`).

Migrating to integer cents would be the durable fix, but it means a data migration
touching every existing record and changes to every read and write site. That is a
larger change than this feature justifies, and drift at household scale is well below
a cent. Recorded here as a deliberate choice.

## Error handling and edge cases

| Case | Behavior |
|---|---|
| Record with `cost = null` | Excluded at the query. Never counted as zero. |
| Record with `cost = 0` | Included. A no-charge warranty repair is a real event. |
| Record whose `assetId` matches no asset | Grouped under "Unknown", matching how `/records` already renders a missing asset name. |
| No records with a cost at all | Empty state on `/costs`; the panel and dashboard card do not render. |
| Vendor is null or blank | Dropped from vendor rankings, still counted in every other rollup. |
| Category is null | Its own "Uncategorized" bucket. |
| Vehicle with fewer than two records carrying mileage | Cost-per-mile omitted; there is no span to divide by. |
| Purchase price missing | Total cost of ownership omitted; lifetime service spend still shown. |

## Verification

No test runner exists in this repo, so verification is:

1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm run build`
4. `npm run db:seed:demo`, then a manual pass over `/costs`, the three asset detail
   pages, and the dashboard, in both light and dark themes and at mobile width.

The pure functions in `lib/costs.ts` are the natural unit-test target if a runner is
added later. They take plain arrays and return plain values, with no Prisma, no React,
and no date-dependent behavior beyond an injectable "now".

## Implementation order

1. Migration and schema — enum, `ServiceRecord.category`, `Vehicle.purchasePrice`.
2. Entry path — zod schema, `clean()`, form dialog select.
3. `lib/costs.ts` — pure core.
4. `lib/costs-server.ts` — loader.
5. Chart primitives.
6. `/costs` page and sidebar entry.
7. Per-asset panel, wired into the three detail pages.
8. Dashboard card.

Steps 1–4 are prerequisites for everything after. Steps 6, 7, and 8 are independent of
each other once 5 is done.
