# Cost Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `ServiceRecord.cost` from a field that is only ever summed once into
spend reporting across a dedicated `/costs` page, every asset detail page, and the
dashboard.

**Architecture:** A pure, Prisma-free `lib/costs.ts` holds one `rollup` primitive that
every grouping (year, asset, category, vendor) is built from; `lib/costs-server.ts`
issues a single narrow query and hands back plain rows. Three presentation primitives
in `components/charts/` render already-shaped data with no client JavaScript. This
mirrors the existing `lib/assets.ts` / `lib/assets-server.ts` and `lib/maintenance-due.ts`
/ `lib/maintenance-due-server.ts` pairs.

**Tech Stack:** Next.js 16 App Router (React Server Components), Prisma 7 + SQLite,
Tailwind CSS 4, shadcn/Base UI, zod + react-hook-form. **No charting library is
added.**

**Spec:** `docs/superpowers/specs/2026-08-24-cost-reporting-design.md`

## Global Constraints

- **No new runtime dependencies.** Charts are HTML/CSS plus one inline SVG.
- **No test runner exists in this repo** — there is no `test` script, no vitest/jest,
  and no test files. TDD steps are therefore replaced by explicit verification steps
  (`npx tsc --noEmit`, `npm run lint`, and a stated manual check). This is a
  deliberate documented deviation, agreed during brainstorming, not an omission. The
  functions in `lib/costs.ts` are pure so that adding a runner later is cheap.
- **Chart components are server components.** No `"use client"` in
  `components/charts/` or `components/costs/`.
- **Chart colors come only from the validated tokens in Task 3.** No eyeballed hex
  anywhere else. The palette was validated with the dataviz skill's
  `validate_palette.js` against this app's real surfaces — `--card` is `#ffffff`
  light and `#2e2e2e` dark — and passes lightness band, chroma floor, CVD separation
  (worst adjacent ΔE 9.1 light / 8.4 dark), and the normal-vision floor (19.6 light /
  19.3 dark) in both modes.
- **Contrast relief is mandatory.** The validator returns a non-dismissable contrast
  WARN: `#1baf7a`, `#eda100`, `#e87ba4` sit below 3:1 on white, and `#008300` sits
  below 3:1 on the dark card. The obligation is discharged by the table view in
  Task 6 plus an always-present legend. **Do not drop the table view.**
- **Nominal bars are single-hue.** Spend-by-asset and top-vendor bars all use
  `--cost-bar`. Bar length already encodes magnitude; coloring each bar differently
  would spend the identity channel re-encoding it.
- **Money is rounded to cents at every rollup boundary** via `cents()`. `cost` is a
  SQLite `Float`.
- **Text never wears a series color.** Values and labels stay on `text-foreground` /
  `text-muted-foreground`; the colored swatch beside them carries identity.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | *(modify)* `ServiceCategory` enum, `ServiceRecord.category`, `Vehicle.purchasePrice` |
| `lib/actions/service-records.ts` | *(modify)* accept and persist `category` |
| `lib/actions/vehicles.ts` | *(modify)* accept and persist `purchasePrice` |
| `components/service-records/service-record-form-dialog.tsx` | *(modify)* category select |
| `components/vehicles/vehicle-form-dialog.tsx` | *(modify)* purchase price input |
| `app/globals.css` | *(modify)* validated cost palette tokens, light + dark |
| `lib/costs.ts` | **pure core** — types, `rollup`, groupings, shaping, formatting |
| `lib/costs-server.ts` | **the one query** — `loadCostRecords` |
| `components/charts/ranked-bars.tsx` | horizontal ranked bars, single hue |
| `components/charts/stacked-columns.tsx` | year columns segmented by category + legend |
| `components/charts/sparkline.tsx` | inline SVG polyline |
| `components/costs/asset-cost-panel.tsx` | per-asset spend block for detail page asides |
| `app/(app)/costs/page.tsx` | the report page |
| `components/sidebar.tsx` | *(modify)* `/costs` nav entry |
| `app/(app)/page.tsx` | *(modify)* dashboard spend card |
| `app/(app)/assets/{properties,vehicles,equipment}/[id]/page.tsx` | *(modify)* mount the panel |

**Deviation from the spec, recorded:** the spec sketched `loadCostRecords` with a
`year?` filter. It is dropped. The `/costs` page charts every year at once, so a
year-filtered loader would be wrong for its main chart; year narrowing happens in
memory via `inYear()`. Nothing else in the spec changes.

---

## Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_service_category_and_vehicle_price/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: `ServiceCategory` enum (`ROUTINE | REPAIR | UPGRADE | INSPECTION | PARTS | OTHER`)
  exported from `@/app/generated/prisma/client`; `ServiceRecord.category: ServiceCategory | null`;
  `Vehicle.purchasePrice: number | null`.

- [ ] **Step 1: Add the enum**

In `prisma/schema.prisma`, in the `─── Enums ───` block, after the `MeterUnit` enum:

```prisma
/// What kind of spending a service record represents, as distinct from what it was
/// spent on. Nullable on the record: anything logged before categories existed is
/// genuinely uncategorized, and the reports say so rather than guessing.
enum ServiceCategory {
  ROUTINE
  REPAIR
  UPGRADE
  INSPECTION
  PARTS
  OTHER
}
```

- [ ] **Step 2: Add the field to `ServiceRecord`**

In `model ServiceRecord`, immediately after the `cost` line:

```prisma
  category         ServiceCategory?
```

- [ ] **Step 3: Add `purchasePrice` to `Vehicle`**

In `model Vehicle`, immediately after the `purchaseDate` line:

```prisma
  purchasePrice  Float?
```

- [ ] **Step 4: Generate and apply the migration**

Run: `npm run db:migrate -- --name add_service_category_and_vehicle_price`
Expected: a new folder under `prisma/migrations/`, and the client regenerated into
`app/generated/prisma`.

- [ ] **Step 5: Verify the migration is additive**

Read the generated `migration.sql`. Expected: it adds two nullable columns. If it
contains `DROP TABLE` or recreates `ServiceRecord` without copying rows, stop and
report it — existing service history must survive.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. (The new fields are optional everywhere, so nothing breaks yet.)

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/generated/prisma
git commit -m "feat(db): add ServiceCategory and Vehicle.purchasePrice"
```

---

## Task 2: Entry path for the two new fields

**Files:**
- Modify: `lib/actions/service-records.ts`
- Modify: `components/service-records/service-record-form-dialog.tsx`
- Modify: `lib/actions/vehicles.ts`
- Modify: `components/vehicles/vehicle-form-dialog.tsx`

**Interfaces:**
- Consumes: `ServiceCategory` from Task 1.
- Produces: service records and vehicles that can actually carry the new values.

Base UI's `Select` has no empty-string option, so an "unset" choice needs a sentinel —
the same `__none__` pattern `components/equipment/equipment-form-dialog.tsx:19` already
uses for an unassigned property.

- [ ] **Step 1: Extend the server action schema**

In `lib/actions/service-records.ts`, add to the `schema` object after `cost`:

```ts
  category: z.enum(["ROUTINE", "REPAIR", "UPGRADE", "INSPECTION", "PARTS", "OTHER"]).optional().or(z.literal("")),
```

- [ ] **Step 2: Persist it in `clean()`**

In the same file, add to the object returned by `clean()`, after the `cost` line:

```ts
    category: v.category === "" || v.category === undefined ? null : v.category,
```

- [ ] **Step 3: Add the field to the dialog's form schema**

In `components/service-records/service-record-form-dialog.tsx`, add to `schema` after
`cost`:

```ts
  category: z.string().optional(),
```

- [ ] **Step 4: Include it in both `form.reset` calls**

In the `useEffect`, add `category: record.category ?? NO_CATEGORY,` to the populated
branch and `category: NO_CATEGORY,` to the empty branch, and add
`category: NO_CATEGORY,` to `defaultValues`. Add the sentinel near the top of the file,
below the imports:

```ts
// Base UI Select has no empty-string option, so "no category" needs a sentinel.
const NO_CATEGORY = "__none__"
```

- [ ] **Step 5: Map the sentinel back to empty on submit**

In `onSubmit`, replace the first line of the function body with:

```ts
    const payload = {
      ...values,
      category: values.category === NO_CATEGORY ? "" : values.category,
    } as unknown as Parameters<typeof createServiceRecord>[0]
```

The category `FormField` itself is deliberately **not** in this task: it needs
`SERVICE_CATEGORIES` from `lib/costs.ts`, which Task 3 creates. It is the last step of
Task 3 instead, so every task here compiles in order.

- [ ] **Step 6: Add `purchasePrice` to the vehicle action**

In `lib/actions/vehicles.ts`, add to its zod `schema` alongside the other optional
numeric fields:

```ts
  purchasePrice: z.coerce.number().optional().or(z.literal("")),
```

and to the object it builds for Prisma, following exactly the empty-string-to-null
shape the file already uses for its other optional numbers:

```ts
    purchasePrice: v.purchasePrice === "" || v.purchasePrice === undefined ? null : Number(v.purchasePrice),
```

- [ ] **Step 7: Add the vehicle form input**

In `components/vehicles/vehicle-form-dialog.tsx`, add `purchasePrice: z.string().optional(),`
to its `schema`, `purchasePrice: ""` to its empty defaults, `purchasePrice:
vehicle.purchasePrice?.toString() ?? ""` to its populated `form.reset`, and this field
next to the existing purchase-date input:

```tsx
              <FormField control={form.control} name="purchasePrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase Price ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="28500" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

Manual: `npm run dev`, edit any vehicle and set a purchase price. Expected: it
persists across a reopen. (The category round-trip is verified at the end of Task 3,
once its select exists.)

- [ ] **Step 9: Commit**

```bash
git add lib/actions/service-records.ts lib/actions/vehicles.ts components/service-records/service-record-form-dialog.tsx components/vehicles/vehicle-form-dialog.tsx
git commit -m "feat: capture service category and vehicle purchase price"
```

---

## Task 3: `lib/costs.ts` — the pure core

**Files:**
- Create: `lib/costs.ts`
- Modify: `components/service-records/service-record-form-dialog.tsx` (final step only — the
  category select, deferred from Task 2 because it imports from this module)

**Interfaces:**
- Consumes: `AssetType` and `ServiceCategory` types from `@/app/generated/prisma/client` (Task 1);
  the `NO_CATEGORY` sentinel and `category` form field added in Task 2.
- Produces — later tasks rely on these exact names:
  - `type CostRow`, `type Bucket`, `type CategoryKey`, `type RankedEntry`,
    `type StackSegment`, `type YearColumn`, `type SparkPoint`
  - `UNCATEGORIZED`, `SERVICE_CATEGORIES`, `CATEGORY_ORDER`
  - `categoryLabel(key)`, `categoryColor(key)`
  - `cents(n)`, `formatMoney(n)`, `formatMoneyCompact(n)`
  - `rollup(rows, keyFn)`, `byYear`, `byAsset`, `byCategory`, `byVendor`
  - `assetKey(type, id)`, `parseAssetKey(key)`
  - `ranked(map, opts)`, `stackedByYear(rows)`, `yearSeries(rows)`
  - `sum(rows)`, `inYear(rows, year)`, `yearToDate(rows, now, year?)`,
    `averagePerMonth(rows, now)`, `costPerMeter(rows)`

- [ ] **Step 1: Create the file with types and category metadata**

```ts
import type { AssetType, ServiceCategory } from "@/app/generated/prisma/client"

// Pure, client-safe cost aggregation. Anything needing the database lives in
// lib/costs-server.ts instead, matching the assets.ts / assets-server.ts split.

/// The minimal row shape every rollup works from. Deliberately not the Prisma
/// model: these functions must stay usable from a client component and testable
/// without a database.
export type CostRow = {
  assetId: string
  assetType: AssetType
  date: Date
  cost: number
  category: ServiceCategory | null
  vendor: string | null
  title: string
  mileageAtService: number | null
}

export type Bucket = { total: number; count: number }

/// Map key standing in for `category === null`. Records logged before categories
/// existed get their own bucket rather than being folded into OTHER, which would
/// misstate every one of them.
export const UNCATEGORIZED = "UNCATEGORIZED"

export type CategoryKey = ServiceCategory | typeof UNCATEGORIZED

export const SERVICE_CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: "ROUTINE", label: "Routine" },
  { value: "REPAIR", label: "Repair" },
  { value: "UPGRADE", label: "Upgrade" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "PARTS", label: "Parts" },
  { value: "OTHER", label: "Other" },
]

// Fixed order, assigned in sequence and never cycled — the colour a category
// wears must not depend on which categories happen to be on screen. Uncategorized
// sorts last because it is an absence, not a kind of spending.
export const CATEGORY_ORDER: CategoryKey[] = [
  ...SERVICE_CATEGORIES.map((c) => c.value),
  UNCATEGORIZED,
]

const CATEGORY_LABELS = Object.fromEntries(
  SERVICE_CATEGORIES.map((c) => [c.value, c.label])
) as Record<ServiceCategory, string>

export function categoryLabel(key: CategoryKey): string {
  return key === UNCATEGORIZED ? "Uncategorized" : CATEGORY_LABELS[key] ?? "Other"
}

// Colours are CSS variables, not literals, so light and dark are one definition
// in globals.css rather than a branch in every component.
const CATEGORY_COLORS: Record<CategoryKey, string> = {
  ROUTINE: "var(--cost-routine)",
  REPAIR: "var(--cost-repair)",
  UPGRADE: "var(--cost-upgrade)",
  INSPECTION: "var(--cost-inspection)",
  PARTS: "var(--cost-parts)",
  OTHER: "var(--cost-other)",
  [UNCATEGORIZED]: "var(--cost-uncategorized)",
}

export function categoryColor(key: CategoryKey): string {
  return CATEGORY_COLORS[key]
}
```

- [ ] **Step 2: Add money helpers**

Append:

```ts
/// `ServiceRecord.cost` is a SQLite Float, so summing many of them accumulates
/// sub-cent drift. Every rollup rounds at its boundary.
export function cents(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatMoney(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/// For column captions and axis ticks, where "$12,480.00" is more precision than
/// the reader needs and wider than the space available.
export function formatMoneyCompact(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${Math.round(n)}`
}
```

- [ ] **Step 3: Add the `rollup` primitive and its four key functions**

Append:

```ts
/// The one primitive every grouping is built from. Returning `null` from `keyFn`
/// drops the row, which is how records with no vendor stay out of vendor
/// rankings without a separate filtering pass.
export function rollup<K extends string>(
  rows: CostRow[],
  keyFn: (row: CostRow) => K | null
): Map<K, Bucket> {
  const out = new Map<K, Bucket>()
  for (const row of rows) {
    const key = keyFn(row)
    if (key === null) continue
    const bucket = out.get(key)
    if (bucket) {
      bucket.total += row.cost
      bucket.count += 1
    } else {
      out.set(key, { total: row.cost, count: 1 })
    }
  }
  for (const bucket of out.values()) bucket.total = cents(bucket.total)
  return out
}

export function assetKey(assetType: AssetType, assetId: string): string {
  return `${assetType}:${assetId}`
}

export function parseAssetKey(key: string): { assetType: AssetType; assetId: string } {
  const i = key.indexOf(":")
  return { assetType: key.slice(0, i) as AssetType, assetId: key.slice(i + 1) }
}

export function byYear(rows: CostRow[]): Map<string, Bucket> {
  return rollup(rows, (r) => String(r.date.getFullYear()))
}

export function byAsset(rows: CostRow[]): Map<string, Bucket> {
  return rollup(rows, (r) => assetKey(r.assetType, r.assetId))
}

export function byCategory(rows: CostRow[]): Map<CategoryKey, Bucket> {
  return rollup(rows, (r) => (r.category ?? UNCATEGORIZED) as CategoryKey)
}

export function byVendor(rows: CostRow[]): Map<string, Bucket> {
  return rollup(rows, (r) => {
    const v = r.vendor?.trim()
    return v ? v : null
  })
}
```

- [ ] **Step 4: Add the shaping functions**

Append:

```ts
export type RankedEntry = {
  key: string
  label: string
  total: number
  count: number
  /// This entry's total as a fraction of the largest total, for bar width.
  share: number
}

/// Sorted descending, with a key tiebreaker so equal totals keep a stable order
/// between renders.
export function ranked(
  map: Map<string, Bucket>,
  { limit, label }: { limit?: number; label?: (key: string) => string } = {}
): RankedEntry[] {
  const sorted = [...map.entries()].sort(
    (a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0])
  )
  const max = sorted[0]?.[1].total ?? 0
  return (limit ? sorted.slice(0, limit) : sorted).map(([key, bucket]) => ({
    key,
    label: label ? label(key) : key,
    total: bucket.total,
    count: bucket.count,
    share: max > 0 ? bucket.total / max : 0,
  }))
}

export type StackSegment = { key: CategoryKey; label: string; color: string; total: number }
export type YearColumn = { year: string; total: number; segments: StackSegment[]; share: number }

export function stackedByYear(rows: CostRow[]): YearColumn[] {
  const grouped = new Map<string, CostRow[]>()
  for (const row of rows) {
    const year = String(row.date.getFullYear())
    const list = grouped.get(year)
    if (list) list.push(row)
    else grouped.set(year, [row])
  }

  const columns = [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, yearRows]) => {
      const categories = byCategory(yearRows)
      // Walk CATEGORY_ORDER rather than the map's own order, so a category keeps
      // its position in the stack whether or not the year above it used it.
      const segments = CATEGORY_ORDER.filter((key) => categories.has(key)).map((key) => ({
        key,
        label: categoryLabel(key),
        color: categoryColor(key),
        total: categories.get(key)!.total,
      }))
      return {
        year,
        total: cents(segments.reduce((s, seg) => s + seg.total, 0)),
        segments,
      }
    })

  const max = Math.max(0, ...columns.map((c) => c.total))
  return columns.map((c) => ({ ...c, share: max > 0 ? c.total / max : 0 }))
}

export type SparkPoint = { year: string; total: number }

/// Every year between the first and last is emitted, including the ones with no
/// spend. Skipping them would draw a straight line across a gap and tell the
/// reader that money was spent in a year when none was.
export function yearSeries(rows: CostRow[]): SparkPoint[] {
  const map = byYear(rows)
  if (map.size === 0) return []
  const years = [...map.keys()].map(Number)
  const out: SparkPoint[] = []
  for (let y = Math.min(...years); y <= Math.max(...years); y++) {
    out.push({ year: String(y), total: map.get(String(y))?.total ?? 0 })
  }
  return out
}
```

- [ ] **Step 5: Add the summary functions**

Append:

```ts
export function sum(rows: CostRow[]): number {
  return cents(rows.reduce((s, r) => s + r.cost, 0))
}

export function inYear(rows: CostRow[], year: number): CostRow[] {
  return rows.filter((r) => r.date.getFullYear() === year)
}

/// Rows from 1 January of `year` through the same month and day as `now`.
/// Passing `now.getFullYear() - 1` gives the same window a year earlier, which is
/// what makes a year-on-year comparison fair in, say, March.
export function yearToDate(rows: CostRow[], now: Date, year: number = now.getFullYear()): CostRow[] {
  const start = new Date(year, 0, 1)
  const end = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return rows.filter((r) => r.date >= start && r.date <= end)
}

/// Divides all-time spend by the months elapsed since the earliest costed record,
/// not by twelve — a household two months in should not be shown a twelve-month
/// average.
export function averagePerMonth(rows: CostRow[], now: Date): number {
  if (rows.length === 0) return 0
  const earliest = rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date)
  const months = Math.max(
    1,
    (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth()) + 1
  )
  return cents(sum(rows) / months)
}

/// Cost per mile or hour across the meter span the records themselves cover.
/// Two readings are the minimum for a span to exist; anything less returns null
/// so the caller omits the figure rather than printing a divide-by-zero.
export function costPerMeter(rows: CostRow[]): number | null {
  const readings = rows.flatMap((r) => (r.mileageAtService != null ? [r.mileageAtService] : []))
  if (readings.length < 2) return null
  const span = Math.max(...readings) - Math.min(...readings)
  if (span <= 0) return null
  return sum(rows) / span
}
```

- [ ] **Step 6: Render the category select, now that `SERVICE_CATEGORIES` exists**

This is the step deferred from Task 2. In
`components/service-records/service-record-form-dialog.tsx`, add
`import { SERVICE_CATEGORIES } from "@/lib/costs"` and insert this `FormField`
immediately after the `cost` field:

```tsx
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v ?? NO_CATEGORY)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Uncategorized">
                          {(v: string) => SERVICE_CATEGORIES.find((c) => c.value === v)?.label ?? "Uncategorized"}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
                      {SERVICE_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

Manual: `npm run dev`, open any vehicle, add a service record with a category and a
cost, then reopen it for edit. Expected: the category persists and reloads selected.
Add a second record and leave the category alone. Expected: it saves as Uncategorized,
not as Other.

- [ ] **Step 8: Commit**

```bash
git add lib/costs.ts components/service-records/service-record-form-dialog.tsx
git commit -m "feat: add pure cost aggregation core and category select"
```

---

## Task 4: Design tokens for the chart palette

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: the variable names referenced by `categoryColor()` in Task 3.
- Produces: `--cost-routine`, `--cost-repair`, `--cost-upgrade`, `--cost-inspection`,
  `--cost-parts`, `--cost-other`, `--cost-uncategorized`, `--cost-bar`, defined in both
  themes.

Every hex below is a validated slot, not a preference. Do not substitute values.

- [ ] **Step 1: Add the light tokens**

At the end of the `:root { … }` block in `app/globals.css`, before its closing brace:

```css
  /* Cost report palette. Validated with the dataviz skill's validate_palette.js
     against this app's own surfaces (--card: #ffffff light, #2e2e2e dark): all
     six categorical checks pass in both modes, worst adjacent CVD ΔE 9.1 light /
     8.4 dark, worst adjacent normal-vision ΔE 19.6 / 19.3. Three light slots sit
     below 3:1 on white, which is why the /costs page ships a table view — that
     relief is required, not optional. Do not re-pick these by eye. */
  --cost-routine: #2a78d6;
  --cost-repair: #eb6834;
  --cost-upgrade: #1baf7a;
  --cost-inspection: #eda100;
  --cost-parts: #e87ba4;
  --cost-other: #008300;
  /* An absence, not a hue: grey keeps it from reading as a seventh kind of spend. */
  --cost-uncategorized: var(--muted-foreground);
  /* Single hue for nominal bars (assets, vendors), where length already encodes
     magnitude and colour carries no identity. Matches --primary's hue. */
  --cost-bar: oklch(0.488 0.243 264.376);
```

- [ ] **Step 2: Add the dark tokens**

At the end of the `.dark { … }` block, before its closing brace:

```css
  /* The same six hues re-stepped for the dark card, not an automatic flip. */
  --cost-routine: #3987e5;
  --cost-repair: #d95926;
  --cost-upgrade: #199e70;
  --cost-inspection: #c98500;
  --cost-parts: #d55181;
  --cost-other: #008300;
  --cost-uncategorized: var(--muted-foreground);
  /* --primary itself measures only 1.99:1 on the dark card, below the 3:1 floor
     for marks, so the bar hue is lightened here to 4.24:1. */
  --cost-bar: oklch(0.66 0.18 264.376);
```

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: clean.

Manual: `npm run dev`, open dev tools on any page, and confirm
`getComputedStyle(document.documentElement).getPropertyValue('--cost-repair')` returns
a value in both themes.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat: add validated cost report colour tokens"
```

---

## Task 5: Chart primitives

**Files:**
- Create: `components/charts/ranked-bars.tsx`
- Create: `components/charts/stacked-columns.tsx`
- Create: `components/charts/sparkline.tsx`

**Interfaces:**
- Consumes: `RankedEntry`, `YearColumn`, `SparkPoint`, `formatMoney`,
  `formatMoneyCompact` from `lib/costs.ts` (Task 3); the tokens from Task 4.
- Produces: `<RankedBars entries hrefFor? emptyMessage? />`,
  `<StackedColumns columns />`, `<Sparkline points className? />`.

None of these know what a `ServiceRecord` is. They take shaped data and draw it.

- [ ] **Step 1: Write `ranked-bars.tsx`**

```tsx
import Link from "next/link"
import { formatMoney, type RankedEntry } from "@/lib/costs"

// Nominal categories — assets, vendors — so every bar wears the same hue. Bar
// length already encodes magnitude; colouring each one differently would spend
// the identity channel re-encoding what the length shows.
export function RankedBars({
  entries,
  hrefFor,
  emptyMessage = "Nothing to show yet.",
}: {
  entries: RankedEntry[]
  hrefFor?: (entry: RankedEntry) => string
  emptyMessage?: string
}) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <ul className="space-y-2.5">
      {entries.map((entry) => {
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm">{entry.label}</span>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {formatMoney(entry.total)}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                // Sub-pixel widths vanish entirely, so a real but tiny value keeps
                // a visible sliver rather than rendering as nothing.
                style={{
                  width: `${Math.max(entry.share * 100, 1.5)}%`,
                  backgroundColor: "var(--cost-bar)",
                }}
                title={`${entry.label}: ${formatMoney(entry.total)} across ${entry.count} record${entry.count === 1 ? "" : "s"}`}
              />
            </div>
          </>
        )

        const href = hrefFor?.(entry)
        return (
          <li key={entry.key}>
            {href ? (
              <Link href={href} className="block rounded-md transition-colors hover:bg-muted/40">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 2: Write `stacked-columns.tsx`**

```tsx
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
                  style={{
                    height: `${(segment.total / column.total) * 100}%`,
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
            />
            {categoryLabel(key)}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Write `sparkline.tsx`**

```tsx
import type { SparkPoint } from "@/lib/costs"

// The one shape CSS cannot express, so the one component here that is SVG. A
// single series, so no legend — the caption above it names what this is.
export function Sparkline({
  points,
  className = "h-10 w-full",
}: {
  points: SparkPoint[]
  className?: string
}) {
  if (points.length < 2) return null

  const width = 100
  const height = 28
  const max = Math.max(...points.map((p) => p.total))
  // A flat series would divide by zero; drawing it along the baseline is honest.
  const scale = max > 0 ? max : 1

  const coords = points.map((point, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - (point.total / scale) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      // Without this the stroke width would be scaled by the aspect distortion
      // and the line would render thicker horizontally than vertically.
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`Spend per year from ${points[0].year} to ${points[points.length - 1].year}`}
    >
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="var(--cost-bar)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add components/charts
git commit -m "feat: add dependency-free chart primitives"
```

---

## Task 6: `lib/costs-server.ts` and the `/costs` page

**Files:**
- Create: `lib/costs-server.ts`
- Create: `app/(app)/costs/page.tsx`
- Modify: `components/sidebar.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3 and 5; `loadAssetIndex()` from `lib/assets-server.ts`;
  `assetHref`, `assetIcon` from `lib/assets.ts`; `withParams` from `lib/table-params.ts`.
- Produces: `loadCostRecords(filter?)`, and a `/costs` route.

- [ ] **Step 1: Write the loader**

Create `lib/costs-server.ts`:

```ts
import { prisma } from "@/lib/prisma"
import type { AssetType } from "@/app/generated/prisma/client"
import type { CostRow } from "@/lib/costs"

/// One query, many rollups. Grouping happens in memory in lib/costs.ts because
/// SQLite cannot group by an extracted year without raw SQL, because assetId is
/// polymorphic with no foreign key so no aggregate query can resolve asset names
/// anyway, and because the /costs page needs five different groupings of the same
/// rows. This holds while the table stays under roughly 50k costed records; past
/// that, byYear moves to raw SQL and nothing outside this module changes.
export async function loadCostRecords(filter?: {
  assetId?: string
  assetType?: AssetType
}): Promise<CostRow[]> {
  const rows = await prisma.serviceRecord.findMany({
    where: {
      cost: { not: null },
      ...(filter?.assetId ? { assetId: filter.assetId } : {}),
      ...(filter?.assetType ? { assetType: filter.assetType } : {}),
    },
    select: {
      assetId: true,
      assetType: true,
      date: true,
      cost: true,
      category: true,
      vendor: true,
      title: true,
      mileageAtService: true,
    },
    orderBy: { date: "asc" },
  })

  // `cost: { not: null }` narrows the rows but not their type, so this assertion
  // states what the query already guarantees.
  return rows.map((row) => ({ ...row, cost: row.cost! }))
}
```

- [ ] **Step 2: Add the sidebar entry**

In `components/sidebar.tsx`, add `PiggyBank` to the `lucide-react` import and insert
into `navItems` directly after the Service Records entry:

```tsx
  { href: "/costs", label: "Costs", icon: PiggyBank },
```

- [ ] **Step 3: Write the page**

Create `app/(app)/costs/page.tsx`:

```tsx
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
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 5: Verify visually**

Run: `npm run db:seed:demo && npm run dev`, then open `/costs`.
Expected: KPI row populated; one column per year with coloured segments and a legend;
four panels below; "Show as table" expands to a year × category table whose row totals
match the column captions. Toggle to dark mode — every segment stays visible against
the card. Narrow to phone width — the column strip scrolls horizontally, the page body
does not.

- [ ] **Step 6: Commit**

```bash
git add lib/costs-server.ts "app/(app)/costs/page.tsx" components/sidebar.tsx
git commit -m "feat: add cost report page"
```

---

## Task 7: Per-asset cost panel

**Files:**
- Create: `components/costs/asset-cost-panel.tsx`
- Modify: `app/(app)/assets/properties/[id]/page.tsx`
- Modify: `app/(app)/assets/vehicles/[id]/page.tsx`
- Modify: `app/(app)/assets/equipment/[id]/page.tsx`

**Interfaces:**
- Consumes: `loadCostRecords` (Task 6), `Sparkline` (Task 5), the summary functions
  from `lib/costs.ts` (Task 3), `meterUnitWord` from `lib/maintenance-due.ts`.
- Produces: `<AssetCostPanel assetType assetId purchasePrice? meterUnit? />` — an async
  server component that renders nothing when the asset has no costed records.

- [ ] **Step 1: Write the panel**

```tsx
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
```

- [ ] **Step 2: Mount it on the vehicle page**

In `app/(app)/assets/vehicles/[id]/page.tsx`, add
`import { AssetCostPanel } from "@/components/costs/asset-cost-panel"` and insert
inside the `<aside>`, immediately after the closing `</div>` of the `Stat` list:

```tsx
        <AssetCostPanel
          assetType="VEHICLE"
          assetId={id}
          purchasePrice={vehicle.purchasePrice}
          meterUnit={vehicle.meterUnit}
        />
```

- [ ] **Step 3: Mount it on the property page**

In `app/(app)/assets/properties/[id]/page.tsx`, same import, and after the `Stat` list
inside the `<aside>` (which ends at line 71's `</aside>`):

```tsx
        <AssetCostPanel assetType="PROPERTY" assetId={id} purchasePrice={property.purchasePrice} />
```

- [ ] **Step 4: Mount it on the equipment page**

In `app/(app)/assets/equipment/[id]/page.tsx`, same import, and after its `Stat` list
inside the `<aside>`:

```tsx
        <AssetCostPanel assetType="EQUIPMENT" assetId={id} purchasePrice={equipment.purchasePrice} />
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

Manual: open a vehicle with several costed records that carry mileage. Expected:
lifetime spend, a sparkline, year-to-date, a per-mile figure, and — once a purchase
price is set — purchase and total owned cost. Open an asset with no costed records.
Expected: no panel at all, not an empty card.

- [ ] **Step 6: Commit**

```bash
git add components/costs "app/(app)/assets"
git commit -m "feat: add per-asset cost panel to detail pages"
```

---

## Task 8: Dashboard spend card

**Files:**
- Modify: `app/(app)/page.tsx`

**Interfaces:**
- Consumes: `loadCostRecords` (Task 6), `sum`, `yearToDate`, `formatMoney` (Task 3).
- Produces: nothing later tasks depend on. This is the last task.

- [ ] **Step 1: Load the rows in the existing batch**

In `app/(app)/page.tsx`, add `costRows` to the destructured array and
`loadCostRecords(),` as the matching entry in the `Promise.all` list — the page already
batches every query this way, so it costs no extra round trip. Add the imports:

```ts
import { loadCostRecords } from "@/lib/costs-server"
import { formatMoney, sum, yearToDate } from "@/lib/costs"
```

- [ ] **Step 2: Compute the comparison**

After the `maintenanceCount` line:

```tsx
  // Same window a year earlier, not the whole of last year — comparing March-to-date
  // against a full twelve months would make every spring look thrifty.
  const spendThisYear = sum(yearToDate(costRows, now))
  const spendLastYear = sum(yearToDate(costRows, now, now.getFullYear() - 1))
  const spendDelta = spendLastYear > 0 ? (spendThisYear - spendLastYear) / spendLastYear : null
```

- [ ] **Step 3: Render the card**

In the small-card cluster, replace the `<div className="grid grid-cols-2 gap-4">`
containing the Active Warranties and Due cards so the row carries a third card, and add
the spend card beside them:

```tsx
          <SummaryCard
            icon={<PiggyBank />}
            label={`Spent in ${now.getFullYear()}`}
            value={formatMoney(spendThisYear)}
            href="/costs"
            compact
          />
```

Add `PiggyBank` to the `lucide-react` import.

- [ ] **Step 4: Show the year-on-year delta**

Directly beneath that card, so the comparison is legible without a second chart:

```tsx
          {spendDelta !== null && (
            <p className="col-span-2 text-xs text-muted-foreground">
              {spendDelta >= 0 ? "Up" : "Down"} {Math.abs(spendDelta * 100).toFixed(0)}% on the
              same point last year ({formatMoney(spendLastYear)}).
            </p>
          )}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three clean. The build is run here because this is the final task.

Manual: open `/`. Expected: the spend card shows this year's total and links to
`/costs`; the delta line reads sensibly. On a fresh database with no costs, expected:
the card shows `$0.00` and the delta line is absent (no prior-year baseline to divide
by).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "feat: add dashboard spend card"
```

---

## Self-review notes

**Spec coverage.** Every spec section maps to a task: module split → 3 and 6; schema →
1; entry path → 2; charts → 4 and 5; `/costs` → 6; per-asset panel → 7; dashboard → 8;
money precision → `cents()` in 3; edge cases → the null/empty guards in 3, 5, 7, and 8.

**Two deliberate deviations, both stated inline above:** `loadCostRecords` drops the
spec's `year?` filter (year narrowing is in-memory, because the main chart needs every
year), and Task 4 adds a design-token step the spec did not anticipate — the existing
`--chart-1`…`--chart-5` ramp is greyscale, identical in both themes, and only five
steps, so it could not carry this chart.

**Ordering:** tasks run 1 → 8 in order, with no forward references. The one place the
work does not split cleanly by file is the service-record dialog: Task 2 adds its
field, sentinel, and submit mapping, and Task 3 adds the select that renders it, because
the select imports `SERVICE_CATEGORIES` from the module Task 3 creates. Tasks 6, 7, and
8 are independent of each other once 5 is done and may be parallelised.
