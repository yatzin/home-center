# Chart Redesign — Design

**Date:** 2026-09-07
**Status:** Approved, pending implementation plan
**Supersedes:** the "Charts" section of `2026-08-24-cost-reporting-design.md`

## Problem

Cost reporting shipped four chart components — `sparkline`, `month-columns`,
`ranked-bars`, `stacked-columns` — and they work. They are also the cheapest
possible rendering of the data: no axes, no scale, no interaction. A reader can
see that one bar is taller than another and cannot say by how much without
hovering and waiting out the browser's native tooltip delay.

Concretely, what is wrong today:

1. **No value can be read off any chart.** None of the four draws an axis, a
   gridline, or a tick. `stacked-columns.tsx` prints a compact total above each
   column, which is the only reason the year chart is legible at all;
   `ranked-bars.tsx` and `sparkline.tsx` print nothing.
2. **Every tooltip is a native `title` attribute.** Roughly a one-second delay,
   no styling, no keyboard path, and nothing at all on touch. There are eight of
   them across the four components.
3. **`sparkline.tsx:31` distorts its own curve.** `preserveAspectRatio="none"`
   stretches a 100×28 viewBox to whatever width the container has, so the same
   series reads as a different shape at a different width. `vectorEffect` rescues
   the stroke weight but not the geometry.
4. **The `/costs` page is four near-identical panels.** `RankedBars` appears
   three times in a 2×2 grid (`costs/page.tsx:153-179`), and the fourth cell is a
   plain list. Nothing about the layout tells the reader which question each
   panel answers.
5. **The dashboard shows six months and no comparison.** `SPEND_MONTHS = 6`
   (`app/(app)/page.tsx:18`) is too short to show a season, and the year-on-year
   comparison exists only as a sentence of prose beneath the number.
6. **The asset panel's chart is decorative.** `AssetCostPanel` draws a flat
   single-hue sparkline with no labels and no category information, on a panel
   whose surrounding rows are all precise numbers.
7. **Nothing is interactive.** No hover state, no drill-down, no way to isolate a
   category, on a page whose entire purpose is exploration.

## Scope

**In scope:** a shared chart primitives module; replacing all four chart
components; the `/costs` page chart lineup and layout; the dashboard spending
card's chart; `AssetCostPanel`'s chart and one new derived figure; new chart
tokens in `globals.css`; a reusable accessible-table disclosure.

**Out of scope:** the aggregation layer's semantics (`lib/costs.ts` gains
functions but no existing function changes behaviour); the Prisma schema; the
existing validated category palette; budgets and forecasting; a test framework;
any page not listed above.

## Decisions and assumptions

Settled during brainstorming. Implementation does not relitigate these.

1. **Still no charting dependency.** Carried forward from the cost-reporting
   spec. Recharts would make every chart a client component, ship ~100kb gzipped,
   and fight the CSS-variable theming that light/dark already depends on. A
   d3-scale-only middle ground buys tick math worth about sixty lines. Hand-rolled
   stays.
2. **Charts become client components, fed serializable aggregates.** Pages keep
   doing their rollups on the server and pass the aggregate — never the raw rows.
   `lib/costs.ts` was written client-safe for exactly this (`lib/costs.ts:4-6`).
   The alternative — server-rendered SVG with a thin interaction overlay — cannot
   recompute a stack when a legend entry is muted without a server round trip,
   which rules out half the interaction this design calls for.

   Precisely: every file directly under `components/charts/` carries `"use
   client"`, because each owns hover or mute state. The primitives are split —
   `scale.ts` is pure TypeScript importable from either side, and
   `chart-frame.tsx`, `axis.tsx` and `chart-table.tsx` are markup-only components
   with no directive of their own, so they hydrate as part of whichever chart
   imports them. Only `tooltip.tsx` and `legend.tsx` carry their own directive,
   since they are the two that would otherwise be reachable from a server tree.
3. **The existing category palette is not re-picked.** `globals.css:84-101`
   records that these seven hues were validated with the dataviz skill's
   `validate_palette.js` against this app's own surfaces, in both modes, with the
   measured ΔE figures written down. New marks introduced here get new tokens and
   are validated the same way; the category hues themselves are untouched.
4. **Drill-down that changes what the page shows goes through the URL.** The
   `/costs` page already filters by year and asset type with `FilterLink` +
   `withParams` (`costs/page.tsx:237-293`). Clicking a category in a chart is the
   same kind of action and uses the same mechanism, so it is shareable,
   bookmarkable, and survives a reload. Only view-local state — muting a series to
   compare the rest — lives in the client.
5. **Every chart ships an accessible alternative.** The `/costs` page's existing
   "Show as table" disclosure (`costs/page.tsx:112-150`) exists because three
   category hues sit below 3:1 on white. That relief becomes a primitive every
   chart uses, not a one-off on the stack.
6. **No test framework is introduced.** Unchanged from the previous spec. The
   repo has no runner and no `test` script. Verification is typecheck, lint,
   build, and a manual pass in both themes against the demo seed.
7. **Motion is CSS-only and opt-out.** Bars grow from the baseline, lines draw in
   once. No animation library, no JS-driven tweens, and everything inside
   `@media (prefers-reduced-motion: reduce)` collapses to a static render.

## Architecture

### Module layout

```
components/charts/
  primitives/
    scale.ts          linear + band scales, nice-tick algorithm
    chart-frame.tsx   responsive SVG, margins, aspect-correct
    axis.tsx          y gridlines + labels, x labels with thinning
    tooltip.tsx       'use client' — pointer, keyboard, touch
    legend.tsx        'use client' — mute (local) or filter (URL)
    chart-table.tsx   the accessible-alternative disclosure
  trend-chart.tsx     stacked columns/area over time, + overlay series
  ranked-bars.tsx     rewritten: shared axis, optional inline sparkline
  composition-bar.tsx 100% horizontal stack
  sparkline.tsx       rewritten: aspect-correct, optional area fill
  meter.tsx           single-value progress against a reference
```

`components/costs/asset-cost-panel.tsx` stays where it is and swaps which chart
it renders.

### `primitives/scale.ts`

Pure, no React, no DOM. Three exports:

- `linearScale(domain, range)` → `(value: number) => number`
- `bandScale(keys, range, padding)` → `{ position(key), bandwidth }`
- `niceTicks(max, count)` → `number[]`, snapped to 1-2-5 multiples so a $4,873
  maximum yields ticks at $0/$1k/$2k/$3k/$4k/$5k rather than five arbitrary
  fifths.

Being pure and dependency-free, these are the natural first unit tests if a
runner is ever added — the same argument `lib/costs.ts` was written under.

### `primitives/chart-frame.tsx`

Owns the one thing every chart got wrong: the coordinate system. Fixed viewBox,
`preserveAspectRatio="xMidYMid meet"`, explicit margins reserved for axis labels,
and a plot rect the children draw into. Charts receive plot width and height as
props rather than each guessing at a magic number, which is what
`CHART_HEIGHT = 180` and `CHART_HEIGHT = 128` are today.

### `primitives/tooltip.tsx`

One client component, used by every chart. Follows the pointer within the plot
area, snaps to the nearest datum on time charts, and renders a card with the
period, each series' value, and the total. Keyboard users tab through data points
and get the same card anchored to the focused mark. Touch taps open it and a tap
outside dismisses it. Replaces all eight native `title` attributes.

### `primitives/legend.tsx`

Two modes, chosen by prop:

- **Mute** (default): clicking a series dims it and rescales the chart to the
  remaining series. Local `useState`, no navigation.
- **Filter**: clicking navigates with `withParams`, exactly as `FilterLink` does.

Both render as real `<button>`s with `aria-pressed`, so keyboard and screen
reader users get the same affordance.

## Charts, per surface

### `/costs`

| Slot | Today | Redesign |
| --- | --- | --- |
| KPI row | four bare numbers | each gains a 12-month sparkline and a delta chip |
| Hero | stacked columns by year — three to five bars | monthly stacked trend, 3-month rolling average line, prior-year ghost series, crosshair; a Month/Quarter/Year toggle re-buckets the same component |
| Category | `RankedBars` | 100% composition bar + legend in filter mode |
| Asset | `RankedBars` | `RankedBars` with a shared x-axis and a per-row inline sparkline |
| Vendors | `RankedBars` | `RankedBars`, secondary visual weight |
| Biggest | plain list | list with a magnitude bar behind each row |

The hero change is the substantive one. Bucketing by year gives at most a handful
of bars for a household a few years in, which is why the current stack needs its
own printed totals to be readable. Bucketing by month across the same range gives
enough marks for a shape to exist — seasonality, a one-off roof, a quiet winter —
and the rolling average separates trend from spikes. Year bucketing stays
reachable through the toggle.

The Month/Quarter/Year toggle is view state that changes what the chart shows, so
by decision 4 it is a URL parameter — `bucket`, one of `month` | `quarter` |
`year`, defaulting to `month` — whitelisted on read exactly as `type` and `year`
already are (`costs/page.tsx:50-56`), and carried through `withParams` by the
existing filter links so picking a year does not silently reset it.

The hero's date range is derived, not chosen: with a year filter active it spans
that calendar year; with none, it spans the earliest costed record through the
current month. Empty buckets inside the range are emitted, never skipped.

### Dashboard

The spending card keeps its footprint. Six month-columns become a twelve-month
area chart with a prior-year ghost line and the current month marked. The prose
delta sentence (`page.tsx:219-223`) becomes a chip beside the headline number,
which is where the eye already is. `SPEND_MONTHS` becomes 12.

### Asset detail pages

`AssetCostPanel` renders on all three detail pages
(`properties/[id]:67`, `vehicles/[id]:39`, `equipment/[id]:58`). Its flat
sparkline becomes a category-coloured bar chart using the same hues as `/costs`,
so a category means the same thing everywhere in the app.

One new figure: when `purchasePrice` is present, a `meter.tsx` bar showing
lifetime service cost as a proportion of purchase price. The panel already
computes both numbers for its "Total owned cost" row — this makes the ratio
between them visible, which is the form the question "is this worth keeping"
actually takes.

## Tokens

Added to both `:root` and `.dark` in `globals.css`, and validated the same way
the category ramp was:

- `--chart-grid` — gridlines and axis rules; must sit below the mark hues in
  contrast so it never competes with data
- `--chart-axis-text` — tick labels
- `--chart-ghost` — the prior-year comparison series; deliberately low-chroma so
  it reads as reference, not as a second equal series
- `--chart-trend` — the rolling-average line; must clear 3:1 against `--card` and
  remain distinguishable from every category hue
- `--chart-crosshair` — the hover rule

Existing `--cost-*` tokens and `--cost-bar` are unchanged and keep their current
meanings.

## Accessibility

- Every chart is wrapped by `chart-table.tsx`, which renders the chart plus a
  `<details>` disclosure containing the same data as a real table. The `/costs`
  stack's existing table moves into this primitive.
- Charts carry `role="img"` and a generated `aria-label` summarising range and
  total, replacing `sparkline.tsx`'s hand-written one.
- Interactive marks are focusable in reading order, respond to Enter and Space,
  and show the same tooltip on focus as on hover.
- Legend entries are `<button aria-pressed>`.
- Colour is never the only channel: the composition bar and the stack both label
  their segments in the tooltip and the table, and the muted state changes
  opacity and adds a strike-through to the legend label.

## Data layer additions

`lib/costs.ts` gains functions; nothing existing changes behaviour.

- `bucketed(rows, granularity, range)` — generalises `monthSeries`. Emits empty
  buckets rather than skipping them, for the reason `yearSeries` already documents
  (`lib/costs.ts:208-210`): a skipped bucket draws a line across a gap and claims
  spending in a period that had none.
- `stackedBuckets(rows, granularity, range)` — the same, split by category.
  `stackedByYear` becomes a thin call into it.
- `rollingAverage(points, window)` — trailing mean, emitting `null` for the
  leading positions where the window is not yet full, so the line starts where it
  becomes true rather than ramping up from a partial sum.
- `priorPeriod(rows, points, now)` — the ghost series, aligned bucket-for-bucket
  against the primary series.

## Risks

- **Client-component payload.** Aggregates, not rows — the `/costs` hero at
  monthly granularity over five years is 60 buckets of at most seven segments.
  Small. The guard is that no page passes `CostRow[]` to a chart.
- **The hero's toggle multiplies states to check.** Three granularities × two
  themes × the existing year and type filters. The manual pass has to cover the
  combinations, not one of each.
- **`prefers-reduced-motion` is easy to half-implement.** Every animation goes in
  one place in `globals.css` behind the query, not scattered as inline styles per
  component.

## Verification

No test runner (decision 6). Per implementation step:

1. `npm run lint`
2. `npm run build` — this typechecks
3. Manual pass via the `/run` skill against the demo seed
   (`npm run db:seed:demo`): both themes, desktop and mobile widths, every
   `/costs` filter combination, an asset with no costs (panel must still render
   nothing, per `asset-cost-panel.tsx:22`), an asset with one record, and a
   year totalling $0 with segments present (the case `stacked-columns.tsx:37-43`
   guards).
4. Keyboard-only pass over one chart of each kind.
