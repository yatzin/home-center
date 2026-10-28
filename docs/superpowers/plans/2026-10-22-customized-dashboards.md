# Customized Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-editable, site-wide card dashboard (drag, resize, configure, add/remove, separate phone layout), enabled by a new "Customized Dashboards" feature toggle.

**Architecture:** All layout logic is pure, tested TypeScript in `lib/dashboard/` (types, validate/repair, grid ops, card-type definitions, edit reducer). The layout is stored as JSON in a singleton `DashboardLayout` row with a revision counter. A server component loads the layout, runs each placed card's own loader (isolated by try/catch) and hands plain data to a client canvas; client card views choose a content tier from their live grid size. Edit mode is a client layer on the same canvas using `@dnd-kit/core` for dragging and custom pointer handles for resizing.

**Tech Stack:** Next 16.2 / React 19.2, Prisma 7 (libsql), Tailwind 4, `@base-ui/react`, shadcn, zod 3, vitest (node env, `lib/**/*.test.ts` only), new dependency `@dnd-kit/core`.

**Spec:** `docs/superpowers/specs/2026-10-22-customized-dashboards-design.md`

## Global Constraints

- This is NOT the Next.js you know: read the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js code (`AGENTS.md`).
- Feature is gated by a new flag; **with it off, `app/(app)/page.tsx` renders exactly as today.**
- Only admins can enter edit mode or save/reset a layout (`requireAdmin()` from `lib/auth-guard.ts`); non-admins never see edit controls.
- One site-wide layout (singleton row). Two layouts inside it: `large` (tablet/desktop) and `phone`. Card set and card config are shared; only placement and size differ per layout.
- Multiple instances of one card type are allowed, each with its own config and size.
- Cards for a disabled feature (People without Health, Rooms without Rooms) are hidden from the picker and from rendering; saved config is kept.
- Turning the feature off and on keeps the saved layout. Only "Reset to default" discards it; it resets both layouts.
- Saves carry the revision they were based on; a stale save is rejected with a conflict message. Autosave is debounced. The server rejects invalid layouts and repairs stored ones on load (unknown card types dropped, sizes clamped, overlaps resolved).
- One failing card must not break the page. A card whose configured item was deleted shows a message with a reconfigure prompt for admins.
- Use semantic tokens only (`bg-card`, `text-muted-foreground`, `--chart-1..5`); all 12 themes (6 dark) must look right. Card chrome: shadcn `Card`, title `text-[13px] font-medium uppercase tracking-wide text-muted-foreground`.
- Charts only when useful (enough data and room); otherwise a number or list.
- Tests: vitest, pure logic in `lib/**/*.test.ts`. UI is verified by running the app (`run` skill). Before reporting done run `npm test`, `npm run lint`, and `npx tsc --noEmit`.
- Commit messages end with the attribution lines given in the session's system reminder.

## Review Focus

- Layout JSON that is corrupt, empty, or from an older shape: page must still render (repair/default), never throw.
- Layout referencing a card type that no longer exists or a feature that is off: card skipped, rest intact.
- Resize/move that would overlap or push a card off-grid: result is always a valid, non-overlapping layout.
- Two admins saving at once: second save gets a conflict, nothing is overwritten silently.
- A household with zero data (all cards empty) or one property vs. ten: each card shows a clear empty state / scales to many.
- Touch: long-press drag must not hijack page scroll; every drag/resize action has a non-drag alternative (buttons/keys).

---

## File Structure

Create:
- `lib/dashboard/layout.ts`: types and constants, `validateLayout`, `repairLayout`, `emptyLayout`.
- `lib/dashboard/grid.ts`: pure grid operations.
- `lib/dashboard/card-types.ts`: card type definitions (metadata, size limits, tiers, config schemas), `defaultLayout`.
- `lib/dashboard/edit-state.ts`: edit reducer (pure).
- `lib/dashboard/layout-server.ts`: `loadDashboardLayout`.
- `lib/dashboard/loaders.ts`: per-card data loaders (server).
- `lib/actions/dashboard-layout.ts`: `saveDashboardLayout`, `resetDashboardLayout`.
- `components/dashboard/customized-dashboard.tsx`: server component.
- `components/dashboard/canvas/`: `dashboard-canvas.tsx`, `card-frame.tsx`, `use-card-tier.ts`, `edit-bar.tsx`, `resize-handle.tsx`, `add-card-dialog.tsx`, `card-config-dialog.tsx`, `phone-controls.tsx`.
- `components/dashboard/cards/`: one view per card type plus `index.ts` (client registry) and `card-shell.tsx`.
- Tests beside each `lib/dashboard/*.ts`.

Modify: `prisma/schema.prisma`, `lib/features.ts`, `lib/features-server.ts`, `lib/features.test.ts`, `lib/actions/feature-settings.ts`, `components/settings/feature-settings.tsx`, `app/(app)/settings/page.tsx`, `app/(app)/page.tsx`, `package.json`.

---

### Task 1: Feature flag

**Files:**
- Modify: `prisma/schema.prisma:774` (add `customizedDashboardsEnabled Boolean @default(false)` with a `///` comment), new migration via `npm run db:migrate -- --name add_customized_dashboards_flag`
- Modify: `lib/features.ts`, `lib/features-server.ts`, `lib/features.test.ts`, `lib/actions/feature-settings.ts`, `components/settings/feature-settings.tsx`, `app/(app)/settings/page.tsx:150`

**Interfaces:**
- Produces: `Features` gains `customizedDashboards: boolean` (default `false` in `DEFAULT_FEATURES`); `loadFeatures()` returns it; `updateFeatureSettings` accepts `customizedDashboardsEnabled`.

- [ ] **Step 1: Update `lib/features.test.ts`** to assert `DEFAULT_FEATURES.customizedDashboards === false` and that existing defaults are unchanged. Run `npx vitest run lib/features.test.ts`; expect FAIL (type/value missing).
- [ ] **Step 2: Add the column, `Features` field, `loadFeatures` mapping, zod schema field, and a toggle card** in `feature-settings.tsx` (name "Customized dashboards", short description; follow the existing toggle-card pattern and the `FEATURE_NAMES`/`Values` types). Pass the new value from `settings/page.tsx`.
- [ ] **Step 3: Generate the migration** and confirm the SQL only adds the column (the SQLite table-rebuild style used by earlier flag migrations is fine). Run `npx prisma generate`.
- [ ] **Step 4: Verify**: `npx vitest run lib/features.test.ts` PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(dashboard): customized dashboards feature flag`.

---

### Task 2: Layout types, validation and repair

**Files:**
- Create: `lib/dashboard/layout.ts`, `lib/dashboard/layout.test.ts`

**Interfaces:**
- Produces:
  - Constants: `LARGE_COLS = 12`, `PHONE_COLS = 2`, `LAYOUT_FORMAT = 1`.
  - `type CardInstance = { id: string; type: string; config: Record<string, unknown> }`
  - `type Placement = { id: string; x: number; y: number; w: number; h: number }` (grid units, `id` = card id)
  - `type DashboardLayout = { format: number; cards: CardInstance[]; large: Placement[]; phone: Placement[] | null }` (`phone: null` = never edited, derived)
  - `parseLayout(raw: unknown): DashboardLayout | null` (zod parse of shape only)
  - `repairLayout(layout: DashboardLayout, known: ReadonlyMap<string, { min; max; default }>): DashboardLayout`: drops cards of unknown type and orphan placements, adds missing placements (appended at the bottom, default size), clamps sizes to min/max and into the column count, resolves overlaps via `resolveOverlaps` from Task 3 contract (import it; if Task 3 is not done yet, implement overlap resolution as a call to a stub the test file imports from `./grid`). **Do Task 3 first if working sequentially: reorder 3 before 2's repair step.**
  - `validateLayout(layout, known): string | null` returns an error message for a layout that is unsaveable (duplicate ids, unknown types, out of bounds, overlap) or `null`.

- [ ] **Step 1: Write failing tests** `layout.test.ts`: `parseLayout` rejects non-objects/garbage and wrong `format`; `repairLayout` drops an unknown-type card and its placement; adds a placement for a card that has none; clamps `w` above max; moves a card whose `x + w > LARGE_COLS` back inside; separates two overlapping placements; leaves a valid layout deep-equal; `validateLayout` returns a message for duplicate card ids and `null` for a valid layout; `phone: null` is preserved by repair.
- [ ] **Step 2: Run, expect FAIL** (`npx vitest run lib/dashboard/layout.test.ts`).
- [ ] **Step 3: Implement** the signatures above in `layout.ts`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(dashboard): layout model, validation and repair`.

---

### Task 3: Grid operations

**Files:**
- Create: `lib/dashboard/grid.ts`, `lib/dashboard/grid.test.ts`

**Interfaces:**
- Consumes: `Placement`, `LARGE_COLS`, `PHONE_COLS` from `layout.ts` (types only; keep `grid.ts` free of other imports so Task 2 and 3 do not cycle: define `Placement` in `grid.ts` and re-export from `layout.ts`).
- Produces (all pure, return new arrays, never mutate):
  - `type Limits = { min: {w;h}; max: {w;h} }`
  - `resolveOverlaps(ps: Placement[], cols: number): Placement[]`: keeps earlier (top-left-most) cards in place, pushes colliding cards down.
  - `compact(ps: Placement[], cols: number): Placement[]`: lifts cards up as far as free (vertical gravity) so no holes remain above.
  - `moveCard(ps, id, to: {x;y}, cols): Placement[]`: moves, clamps into grid, pushes others down, compacts.
  - `resizeCard(ps, id, size: {w;h}, limits: Limits, cols): Placement[]`: clamps to limits and grid, pushes others down, compacts.
  - `appendCard(ps, id, size, cols): Placement[]`: place at the bottom.
  - `removeCard(ps, id, cols): Placement[]`
  - `deriveRowMajor(large: Placement[], phoneDefaults: Map<string,{w;h}>, cols = PHONE_COLS): Placement[]`: phone layout derived from large order (sort by y then x), full-width unless the card's phone default is narrower.
  - `moveInOrder(ps: Placement[], id, delta: -1 | 1, cols): Placement[]`: swap with the neighbouring card in row-major order (the phone "move up/down" button).

- [ ] **Step 1: Write failing tests**: overlapping input becomes non-overlapping and in-bounds; `compact` removes gaps; `moveCard` to an occupied slot pushes the occupant down and keeps both in bounds; `moveCard` beyond the right edge clamps; `resizeCard` clamps to min and max and to column count, and pushes a neighbour below instead of overlapping; `resizeCard` of a card at the grid edge cannot grow past `cols`; `deriveRowMajor` orders by y then x; `moveInOrder(-1)` on the first card is a no-op; every operation's output passes an `assertValid(ps, cols)` helper in the test (in bounds, no overlap, no duplicate ids). Include a seeded randomized sequence of 200 operations over 8 cards asserting validity after each.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the signatures. Approach: gravity-based layout as in react-grid-layout (sort by y,x; place each at the lowest free y not colliding).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(dashboard): pure grid operations`.

---

### Task 4: Card type definitions and default layout

**Files:**
- Create: `lib/dashboard/card-types.ts`, `lib/dashboard/card-types.test.ts`

**Interfaces:**
- Consumes: `Features` (`lib/features.ts`), `DashboardLayout`, `Placement`, grid helpers.
- Produces:
  - `type CardTypeDef = { id: string; label: string; description: string; icon: string /* lucide name */; requires?: "health" | "rooms"; min: {w;h}; max: {w;h}; large: {w;h}; phone: {w;h}; tiers: { name: string; minW: number; minH: number }[] /* ascending */; configSchema: z.ZodType<Record<string, unknown>>; defaultConfig: Record<string, unknown> }`
  - `CARD_TYPES: readonly CardTypeDef[]` with ids exactly: `properties`, `vehicles`, `people` (requires health), `equipment`, `rooms` (requires rooms), `records`, `active-warranties`, `due-maintenance`, `intake`, `reminders`, `expiring-warranties`, `spending-trend`, `spending-breakdown`.
  - `cardType(id: string): CardTypeDef | undefined`
  - `availableCardTypes(features: Features): CardTypeDef[]` (picker list)
  - `limitsMap(): Map<string, {min;max;default}>` for `repairLayout`
  - `tierOf(def: CardTypeDef, size: {w;h}): number`: index of the highest tier whose `minW <= w && minH <= h` (0 if none).
  - `defaultLayout(features: Features): DashboardLayout`: reproduces today's dashboard content in this order: Properties, Vehicles, People (if health), Equipment, Records, Active Warranties, Due, then Intake, Reminders, Expiring Warranties, Spending trend; Rooms is not in the default. Large placements mimic today's arrangement (hero tiles top row; the four lower cards below); `phone: null`.
  - Config schemas: `properties`/`vehicles`/`equipment`/`rooms`/`people`: `{ itemId?: string; limit?: number }` where `itemId` filters the card to one item; `reminders`/`expiring-warranties`: `{ windowDays?: number; assetType?: ... ; limit?: number }`; `spending-trend`/`spending-breakdown`: `{ range?: "ytd" | "12m" }`; `intake`, `records`, `active-warranties`, `due-maintenance`: `{}`. All fields optional with defaults in `defaultConfig`.

- [ ] **Step 1: Write failing tests**: ids are unique and the thirteen exist; every def has `min <= large <= max` and `min <= phone <= max` (phone w ≤ `PHONE_COLS`); `tierOf` picks the right tier at boundaries and returns 0 below the first; `availableCardTypes({health:false,...})` omits `people`, `rooms: false` omits `rooms`; `defaultLayout` passes `validateLayout`, contains every current-dashboard element (assert the card type list), omits `people` when health is off; every `defaultConfig` parses with its own `configSchema`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Tier guidance (the designer's guesses, adjust to taste): stat cards `[count, +thumbnails, +list]`; Spending trend `[ytd number+delta, +area chart, +month bars]`; Spending breakdown `[top category, +ranked bars, +composition bar and totals]`; Reminders/Expiring `[next item, short list, grouped by urgency]`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(dashboard): card type definitions and default layout`.

---

### Task 5: Persistence, loading and actions

**Files:**
- Modify: `prisma/schema.prisma` (new model after `FeatureSettings`): `DashboardLayout { id String @id @default("singleton"); data String; revision Int @default(0); updatedAt DateTime @updatedAt }` + migration `add_dashboard_layout`
- Create: `lib/dashboard/layout-server.ts`, `lib/actions/dashboard-layout.ts`, `lib/dashboard/layout-server.test.ts` (pure helper only)

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `loadDashboardLayout(features: Features): Promise<{ layout: DashboardLayout; revision: number }>` (React `cache`): reads the row; on missing row, JSON error, or failed `parseLayout`, returns `defaultLayout(features)` with revision 0; otherwise `repairLayout` against `limitsMap()`.
  - Pure helper `reconcile(raw: string | null, features: Features): DashboardLayout` in `layout-server.ts` (exported for the test; no Prisma import at module top-level beyond what the loader needs, or place it in `lib/dashboard/reconcile.ts`).
  - `saveDashboardLayout(input: { layout: DashboardLayout; baseRevision: number }): Promise<{ success: true; revision: number } | { error: string; conflict?: true }>`: `requireAdmin()`, zod `parseLayout`, `validateLayout`, then a compare-and-set (`updateMany where { id, revision: baseRevision }`; if count 0 and a row exists, return `{ error: "The dashboard was changed somewhere else. Reload to see the latest.", conflict: true }`; create the row when none exists and `baseRevision === 0`). `revalidatePath("/")`.
  - `resetDashboardLayout(): Promise<{ success: true; revision: number } | { error: string }>`: admin only; deletes the row's custom data by writing `defaultLayout(features)` and bumping the revision.

- [ ] **Step 1: Write failing test** for `reconcile`: `null` → default; `"not json"` → default; valid JSON of wrong shape → default; a layout with an unknown type is repaired; with health off `people` cards are kept in the stored layout but filtered later (reconcile must not drop feature-gated cards).
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** model, migration, helper, loader, actions. **Step 4: Run tests PASS**, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(dashboard): layout persistence and actions`.

---

### Task 6: Read-only canvas and page wiring (first cards)

**Files:**
- Create: `lib/dashboard/loaders.ts`, `components/dashboard/customized-dashboard.tsx`, `components/dashboard/canvas/dashboard-canvas.tsx`, `components/dashboard/canvas/card-frame.tsx`, `components/dashboard/canvas/use-card-tier.ts`, `components/dashboard/cards/index.ts`, `components/dashboard/cards/card-shell.tsx`, `components/dashboard/cards/stat-card.tsx` (Properties first)
- Modify: `app/(app)/page.tsx`

**Interfaces:**
- Consumes: `loadDashboardLayout`, `CARD_TYPES`, `tierOf`.
- Produces:
  - `type CardLoader = (config: Record<string, unknown>, ctx: LoaderContext) => Promise<unknown>` and `LOADERS: Record<string, CardLoader>` in `loaders.ts`. `LoaderContext = { now: Date; features: Features; fmt: Formatter }`.
  - `type CardResult = { id: string; type: string; config: Record<string, unknown>; status: "ok"; data: unknown } | { ...; status: "error" }`.
  - Client registry `CARD_VIEWS: Record<string, React.ComponentType<CardViewProps>>` with `CardViewProps = { data: unknown; config: Record<string, unknown>; tier: number; size: { w: number; h: number }; editing: boolean }`.
  - `<DashboardCanvas cards={CardResult[]} layout={DashboardLayout} revision={number} isAdmin={boolean} />` (client).
  - `useCardTier(typeId: string, size: {w;h}): number` using `tierOf`.
- Behavior: `customized-dashboard.tsx` (server) loads features + layout, filters out cards whose type is unknown or whose feature is off, runs loaders with `Promise.all` where each is wrapped so a throw becomes `status: "error"`, and renders `<DashboardCanvas>`. Placement is CSS grid: both layouts are emitted as CSS variables per card and a media query (`min-width: 768px`) switches between the phone grid (`PHONE_COLS`) and the large grid (`LARGE_COLS`), so there is no hydration mismatch. Row unit and gap are constants in `canvas/` (builder's choice; ~88px rows, 16px gap). `CardFrame` wraps each view in an error boundary (client) showing a calm "This card couldn't load" state. `app/(app)/page.tsx`: keep the greeting and `FreshStartCard`; when `features.customizedDashboards` is true render `<CustomizedDashboard />` instead of the old grid and skip the old `Promise.all` (restructure by moving the legacy body into a function `LegacyDashboard`, untouched in behavior).
- Phone grid: size units are `PHONE_COLS = 2` wide; a `phone: null` layout is derived with `deriveRowMajor` at load time (Task 5's loader or the server component; builder's choice, test it).

- [ ] **Step 1: Write failing test** (in `lib/dashboard/`) for a `resolvePhoneLayout(layout, features): Placement[]` helper: returns stored phone placements when present, otherwise derived from large in row-major order, and always contains exactly the placed cards.
- [ ] **Step 2: Run FAIL; implement helper PASS.**
- [ ] **Step 3: Implement the canvas, frame, error boundary, Properties stat card** (count at tier 0, thumbnails at tier 1, per-property list at tier 2, empty state "No properties yet" with a link) and its loader (reuse `mostRecentlyActive`, `loadActivityIndex`, `loadAssetIndex` as in the current page; honor `config.itemId`, `config.limit`; a missing `itemId` target yields data `{ missing: true }` the view renders as the reconfigure message).
- [ ] **Step 4: Run the app** (`run` skill), enable the toggle in Settings, confirm a Properties card renders from the default layout; confirm turning the toggle off shows the legacy dashboard unchanged.
- [ ] **Step 5: `npx tsc --noEmit`, `npm run lint`, commit** `feat(dashboard): read-only canvas behind feature flag`.

---

### Task 7: Remaining stat cards

**Files:**
- Create: card views for `vehicles`, `people`, `equipment`, `rooms`, `records`, `active-warranties`, `due-maintenance` under `components/dashboard/cards/` (reuse one parametrized `stat-card.tsx` where behavior is identical); extend `loaders.ts`.

**Interfaces:** Consumes Task 6 contracts (`CardLoader`, `CardViewProps`). Produces registered entries in `LOADERS` and `CARD_VIEWS` for those ids.

- [ ] **Step 1: Write failing tests** for any pure data shaping extracted to `lib/dashboard/` (e.g. `dueMaintenanceCount(candidates, mileage, now)` mirroring the current page logic: overdue, dueSoon, or `daysLeft <= 30`), matching today's counts on fixed fixtures.
- [ ] **Step 2: Run FAIL, implement, PASS.**
- [ ] **Step 3: Implement the views and loaders.** Use the current query logic from `app/(app)/page.tsx` (with `ownedWhere(features)` for Records/Warranties/Due). Rooms: count + rooms per property at larger tiers, only when `features.rooms`. Due card keeps the `urgent` styling when count > 0. Each has an empty state.
- [ ] **Step 4: Run the app** and confirm default-layout numbers equal the legacy dashboard's numbers with the toggle flipped back and forth.
- [ ] **Step 5: Verify (tsc, lint) and commit** `feat(dashboard): stat cards`.

---

### Task 8: Reminders, Expiring Warranties, Intake cards

**Files:** Create views under `components/dashboard/cards/` for `reminders`, `expiring-warranties`, `intake`; extend `loaders.ts`. Reuse `ReminderRow`, `IntakeCard`.

**Interfaces:** Consumes Task 6 contracts. Config as defined in Task 4 (`windowDays` default 30 for reminders, 60 for warranties; `limit`).

- [ ] **Step 1: Write failing tests** for pure shaping extracted to `lib/dashboard/`: `urgentMaintenance(candidates, mileage, now, limit)` (severity sort identical to the current page, ties by id), `dueLabel` moved out of `page.tsx` into `lib/dashboard/due-label.ts` with tests for mileage-over, days-late, today, and null days.
- [ ] **Step 2: Run FAIL, implement, PASS.**
- [ ] **Step 3: Implement cards.** Tiers: Reminders `[next item, list, grouped by urgency]`; Expiring `[next expiring, list, grouped by month]`; Intake adapts `IntakeCard` to the frame (it already exists; make it fill its frame at any size). The legacy page keeps using its own inlined versions (do not delete them).
- [ ] **Step 4: Run the app**, resize via the default layout (temporarily different sizes) to check each tier renders, empty states are clear.
- [ ] **Step 5: Verify and commit** `feat(dashboard): reminders, warranties and intake cards`.

---

### Task 9: Spending cards

**Files:** Create `components/dashboard/cards/spending-trend.tsx`, `spending-breakdown.tsx`; extend `loaders.ts`; pure shaping in `lib/dashboard/spending.ts` (+ test).

**Interfaces:**
- Produces `spendingByCategory(rows: CostRow[], range: "ytd" | "12m", now: Date): { category: string; total: number }[]` (sorted descending); uses `loadCostRecords`, `bucketed`, `sum`, `yearToDate`, `priorPeriod` from `lib/costs.ts`.

- [ ] **Step 1: Write failing tests** for `spendingByCategory` (totals, ordering, range filtering, empty input returns `[]`).
- [ ] **Step 2: Run FAIL, implement, PASS.**
- [ ] **Step 3: Implement.** Trend tiers `[ytd number + delta pill, + SpendArea, + month bars]`; breakdown tiers `[top category + share, + ranked bars (existing `ranked-bars`), + composition bar and total]`. A chart renders only when there are at least two non-zero data points; otherwise show the number/list. Reuse components in `components/charts/`.
- [ ] **Step 4: Run the app** with demo data (`npm run db:seed:demo`), check light and dark themes.
- [ ] **Step 5: Verify and commit** `feat(dashboard): spending cards`.

---

### Task 10: Edit state reducer and autosave

**Files:**
- Create: `lib/dashboard/edit-state.ts`, `lib/dashboard/edit-state.test.ts`, `components/dashboard/canvas/use-autosave.ts`

**Interfaces:**
- Produces:
  - `type Mode = "large" | "phone"`
  - `type EditState = { layout: DashboardLayout; revision: number; mode: Mode; dirty: boolean; conflict: boolean }`
  - `type EditAction = { type: "move"; id; to: {x;y} } | { type: "resize"; id; size: {w;h} } | { type: "moveOrder"; id; delta: -1 | 1 } | { type: "add"; cardType: string } | { type: "remove"; id } | { type: "config"; id; config: Record<string, unknown> } | { type: "saved"; revision: number } | { type: "conflict" } | { type: "replace"; layout: DashboardLayout; revision: number }`
  - `editReducer(state: EditState, action: EditAction): EditState`: applies the action to the layout for the current `mode`; `add` appends the card to **both** layouts (phone at the end, creating the phone layout from `deriveRowMajor` first if it is `null`), `remove` removes from both; `config` is shared; the first phone-mode edit materializes `phone` from the derived layout; all results satisfy `validateLayout`.
  - `useAutosave(state, dispatch)` (client hook): debounced (~600 ms) call to `saveDashboardLayout({ layout, baseRevision })` when `dirty`; on `{ success }` dispatches `saved`; on `conflict` dispatches `conflict`; flushes on leaving edit mode and on `visibilitychange`.

- [ ] **Step 1: Write failing tests** for the reducer: move/resize in `large` mode do not touch `phone`; a `moveOrder` in `phone` mode on `phone: null` materializes `phone` and leaves `large` unchanged; `add` appears in both layouts and is valid; `remove` removes from both; `config` change keeps placements; `saved` clears `dirty` and updates `revision`; every reachable state is valid per `validateLayout` after a randomized sequence.
- [ ] **Step 2: Run FAIL, implement, PASS.**
- [ ] **Step 3: Implement `useAutosave`** (no test; verified in Task 11).
- [ ] **Step 4: Commit** `feat(dashboard): edit state and autosave`.

---

### Task 11: Edit mode on tablet/desktop

**Files:**
- Create: `components/dashboard/canvas/edit-bar.tsx`, `resize-handle.tsx`; modify `dashboard-canvas.tsx`, `card-frame.tsx`; modify `package.json` (`npm install @dnd-kit/core`).

**Behavior:**
- Admin sees an "Edit dashboard" button (top right of the dashboard header area); non-admins see nothing. Edit mode: cards show a calm outline and grip, a visible grid underlay, a bottom or top `EditBar` with **Done**, **Add card**, **Reset to default** (confirm dialog), and a saving indicator ("Saving…" / "All changes saved"; on conflict, a banner with a Reload action).
- Drag by the card grip (and the whole card header) with `@dnd-kit/core` `PointerSensor` (mouse) and `TouchSensor` with an activation delay (~200 ms) and tolerance so scrolling still works; `KeyboardSensor` for keyboard movement. During drag, a ghost snaps to grid cells, others animate out of the way (live preview using `moveCard`).
- Resize by dragging the right, bottom, and corner edges (`ResizeHandle` using pointer events with `setPointerCapture`; `touch-action: none` on the handles only), snapping to grid units and clamped to the type's limits via `resizeCard`; keyboard: focused handle + arrow keys. Content switches tier live as the size crosses a threshold, with a short fade/ease (respect `prefers-reduced-motion`).
- Remove: an "×" in the card chrome with a short undo toast (use `sonner`; undo re-adds with the same config).
- Edit controls render only when `isAdmin` (server-checked again by the actions).
- Exiting edit mode flushes autosave first.

- [ ] **Step 1: Implement** the above using `editReducer` from Task 10 as the single source of truth.
- [ ] **Step 2: Run the app on desktop width**, exercise: drag a card, drag onto an occupied slot, resize to min/max and past the grid edge, remove + undo, Done, reload and confirm persistence, reset. Open a second browser tab as a second admin edit, then save in the first: expect the conflict banner and no overwrite.
- [ ] **Step 3: Verify tsc, lint; commit** `feat(dashboard): edit mode with drag and resize`.

---

### Task 12: Add-card picker and card settings

**Files:** Create `components/dashboard/canvas/add-card-dialog.tsx`, `card-config-dialog.tsx`; per-type config forms under `components/dashboard/cards/config/`; modify `card-frame.tsx` (gear shown only in edit mode and only for types whose `configSchema` has fields).

**Behavior:**
- Picker: a dialog (full-screen sheet on phone) listing `availableCardTypes(features)` with icon, label, description, and a small live preview or tier hint; adding the same type again is allowed. New card is placed at the bottom of the current layout and scrolled into view.
- Gear opens a dialog (Base UI dialog + react-hook-form + zod using the type's `configSchema`) with controls from the spec: item picker (property/vehicle/person/equipment/room; "All" by default), `limit`, `windowDays`, `range`. Item pickers need item lists: pass the lists from the server component to the canvas (only ids and names) so the dialog needs no fetch.
- A card whose `itemId` target is gone renders a message and, for admins, a "Choose another" button opening this dialog.
- If a card's feature is off it is not offered here either.

- [ ] **Step 1: Write failing test** for a pure `configFieldsFor(typeId): { key: string; kind: "item" | "number" | "choice"; ... }[]` in `lib/dashboard/card-types.ts` (every key in a `configSchema` is described exactly once; types without config return `[]`).
- [ ] **Step 2: Run FAIL, implement, PASS.**
- [ ] **Step 3: Implement dialogs**; verify in the app: add a second Properties card filtered to one property; configure Reminders to 14 days; delete that property and confirm the card shows the reconfigure message.
- [ ] **Step 4: Verify and commit** `feat(dashboard): add-card picker and card settings`.

---

### Task 13: Phone editing

**Files:** Create `components/dashboard/canvas/phone-controls.tsx`; modify `dashboard-canvas.tsx`, `edit-bar.tsx`.

**Behavior:**
- On widths below 768 px the canvas uses the 2-column phone grid and edit actions dispatch with `mode: "phone"`. Each card in edit mode shows large touch targets: **Move up / Move down** buttons (`moveOrder`), a **size control** with Small / Medium / Large presets (mapped by each type's `phone` presets within its limits; width options only those allowed by `PHONE_COLS`), the gear and remove. Long-press drag reorders using the TouchSensor delay; page scroll remains smooth outside the grip.
- The edit bar is sticky at the bottom with thumb-reachable Done / Add / Reset. Editing on phone never changes the `large` layout (Task 10 reducer guarantees it); desktop editing never changes `phone` once it exists.

- [ ] **Step 1: Write failing test** for `phoneSizePresets(def: CardTypeDef): { name: "Small" | "Medium" | "Large"; w: number; h: number }[]` in `card-types.ts` (within limits, `w <= PHONE_COLS`, at least one preset, ascending area).
- [ ] **Step 2: Run FAIL, implement, PASS.**
- [ ] **Step 3: Implement the phone controls** and verify at a 390 px viewport and on a real or emulated Android touch device: reorder with buttons and with long-press, resize presets, add/remove, and that vertical scroll still works with a finger on a card body.
- [ ] **Step 4: Verify and commit** `feat(dashboard): phone layout editing`.

---

### Task 14: Polish and final verification

**Files:** touch only what review finds; update `README.md` with a short "Customized dashboards" section (what it is, how to enable, edit mode basics, how to add a card type: one definition in `card-types.ts`, one loader in `loaders.ts`, one view in `cards/`).

- [ ] **Step 1: Theme pass**: cycle all 12 themes in light/dark; fix any hardcoded color or contrast issue in cards, edit chrome, and the grid underlay.
- [ ] **Step 2: Accessibility pass**: every drag/resize action reachable by keyboard and by buttons; focus returns sensibly after dialogs; `aria-live` announcements for moves ("Properties moved to position 3"); `prefers-reduced-motion` respected.
- [ ] **Step 3: Resilience pass** (Review Focus): corrupt layout JSON in the DB, a layout with a removed card type, a household with zero data, ten properties; each renders without error.
- [ ] **Step 4: Run** `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`; all pass.
- [ ] **Step 5: Commit** `docs/chore(dashboard): polish and README`.

---

## Self-Review

- **Spec coverage:** flag (1); layout model/repair (2); grid ops (3); catalog, tiers, config, default parity (4, 7–9); persistence, admin-only, revision conflicts, dormant-on-toggle (5); cards load only their own data and fail in isolation (6); size-as-lens and useful-chart rule (7–9); edit mode, drag/resize, undo (11); picker/config/multiple instances/deleted-item message (12); separate phone layout and mobile editing (10, 13); themes/a11y/resilience (14).
- **Type consistency:** `Placement`, `DashboardLayout`, `CardInstance`, `CardTypeDef`, `CardLoader`, `CardViewProps`, `EditState`, `EditAction` are defined once (Tasks 2, 4, 6, 10) and reused by name. `Placement` lives in `grid.ts` and is re-exported from `layout.ts`.
- **Known tension called out:** the spec says phones use a single column and also allows width on phones; this plan uses a 2-column phone grid so small stat cards can pair up while most cards default to full width. Confirm during review.
- **Ordering:** do Task 3 before Task 2's repair step (repair uses `resolveOverlaps`); tasks otherwise run in order.
