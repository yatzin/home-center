# Customized Dashboards — Design

## Intent

The dashboard is the first thing people see of the product, and households differ a lot: one house and five cards; ten houses; or no interest in houses and cars at all and a focus on family medical needs. Today's dashboard is a fixed, hand-built layout. This feature lets an admin shape the dashboard to the household, with an editing experience that feels Apple-like: simple and fluid on the surface, powerful underneath. It should wow people with ease of use and customizability.

Enabled by a new feature toggle, **Customized Dashboards**, in Settings > Features. When off, today's dashboard is untouched.

## Goals

- A grid of **cards** the admin can add, remove, move (drag and drop), and resize (drag an edge, vertically and horizontally).
- **Edit mode**: admins enter it, rearrange and configure, then leave it. Outside edit mode the dashboard simply shows as configured. Non-admins never see edit controls.
- **Per-card configuration** via a gear in edit mode, for cards that have config (filters, display options).
- **Multiple instances** of the same card, each with its own size and config (e.g. ten Property cards, each filtered to one property, or one card showing all).
- **Distinct card types for genuinely different views** of the same data (e.g. Spending as headline trend vs category breakdown). A new card type exists only when it is a different view, not a re-skin.
- **Size is a lens**: widening or heightening a card reveals richer, useful content (more fields, thumbnails, lists, a chart). The admin should feel "this is worth keeping wider". Charts appear only when they are useful: enough data and enough room; otherwise show a number or list.
- **Site-wide layout**: one layout for the whole household, not per person. Only admins can edit.
- **Mobile friendly**, including editing on phones and tablets (the owner tests on Android phone and tablet).
- **Extensible**: more cards will come. Adding a card must be one self-contained module registered in one place.
- Looks like this site (its themes and card styling). Dockhand's dashboard is a functionality reference more than a visual one; draw on both while keeping the site's flavor.

## Non-goals

- Per-user dashboards or per-user layouts.
- Draft/publish or versioned layouts. Changes apply to everyone as soon as they are saved.
- Cards beyond the first-round catalog below (more later).
- Replacing or changing the existing dashboard when the feature is off.
- Cross-page widget embedding (cards live on the dashboard only).

## Anti-goals (a failure even if it technically works)

- A broken or confusing dashboard. This was called out as a big problem.
- Cards that overlap, disappear, or become unreachable.
- Edit mode that is hard to understand or leave.
- Empty cards with no explanation.
- Content that looks cramped at a card's minimum size, or decorative charts on thin data.
- Dragging that fights page scrolling on touch devices.

## First-round card catalog

Properties, Vehicles, People (only when health is enabled), Equipment, Rooms (only when rooms is enabled), Intake, Reminders, Expiring Warranties, Spending (at least two distinct views: headline trend; category breakdown), Upcoming Maintenance (due within 30 days), Records, Active Warranties.

Per-card size tiers (below are the designer's guesses; refine during planning):
- Properties: small = count; wider = thumbnails and status; large = per-property list.
- Spending: small = year-to-date number with trend; wider = category breakdown; large = month-by-month bars.
- Reminders: small = next item; larger = dated list grouped by urgency.

## Behavior (decided)

- Feature flag `Customized Dashboards` on the existing `FeatureSettings` singleton, following the pattern of `healthEnabled`, `roomsEnabled`, `equipmentTabEnabled` (schema, migration, `lib/features.ts`, `loadFeatures`, the zod schema in `lib/actions/feature-settings.ts`, and `components/settings/feature-settings.tsx`).
- Only admins can enter edit mode and save layouts (`requireAdmin()`).
- The layout is stored once for the whole site (singleton row, like other settings models).

## Behavior (designer's calls — owner has not confirmed; mark and revisit)

- When first enabled, the dashboard looks like today's, rebuilt from the new cards, so nothing is blank. "Reset to default" returns to it at any time.
- Changes save automatically while editing; a clear "Done" leaves edit mode. No draft step.
- Fixed-column grid with snapping. Each card type declares min/max sizes and size tiers so content is never unreadable.
- Responsive: two saved layouts (phone, and tablet/desktop; see "Phone layout" below). Phones use a single column; editing on phone = long-press drag to reorder plus explicit move up/down buttons as a fallback, with height via drag handle or small/medium/large and width limited to what fits. Tablet and desktop get the full multi-column grid with free drag and edge-resize.
- Touch targets are large; controls (gear, remove, resize) are reachable by thumb.
- Content changes between size tiers should ease rather than jump.
- Safety nets: invalid layouts cannot be saved; deleted data or a disabled feature degrades a card into a clear message instead of an error; one failing card does not take down the page; "Reset to default" is always available.
- Cards fetch only their own data, so cards not on the dashboard cost nothing. (Today everything is fetched in one `Promise.all` in `app/(app)/page.tsx`.)
- Adding a card uses a "+ Add card" picker showing the available card types.

## Additional designer's calls (from builder check; owner has not confirmed)

- **Default layout = parity of content, not pixels.** Every current dashboard element must map to a card in the catalog (add a card type if one is missing). Any fixed header/greeting stays fixed and non-editable above the grid.
- **Disabled features:** cards for a disabled feature (People without health, Rooms without rooms) are hidden from the "+ Add card" picker and hidden from the rendered dashboard for everyone, including admins outside edit mode. If an already-placed card's feature is turned off, the card is skipped (not shown), and its saved config is kept.
- **Toggle off/on:** the saved layout is kept dormant when Customized Dashboards is turned off and reused when it is turned on again. Only "Reset to default" discards it.
- **Concurrent editing:** last-write-wins is not enough to be safe; saves carry a layout version, and a stale save is rejected with a friendly "dashboard changed elsewhere, reload" message. Autosave is debounced. The server rejects invalid layouts and also repairs layouts on load (unknown card types dropped, sizes clamped, overlaps resolved), so a bad stored layout can never break the page.
- **Phone layout (owner decided: separate):** phones have their own layout, stored alongside the tablet/desktop layout in the same site-wide record. Editing on a phone changes only the phone layout; editing on tablet/desktop changes only the large-screen layout. The set of cards and each card's config are shared; only order and size are per layout. When a card is added or removed, it is added to or removed from both layouts (a new card is appended at the end of the phone layout). If the phone layout has never been edited, it is derived from the large layout in row-major order (top to bottom, then left to right) until first edited. "Reset to default" resets both.
- **Config:** per-card config stores IDs (e.g. property). If a configured item is deleted, the card shows a clear message with a one-tap way to reconfigure (admins) rather than silently clearing.
- **Cards respect existing access rules** of the pages they link to; the layout itself is shared.
- **Tests:** vitest for layout validation/repair/migration and size-tier selection; UI interaction checks as practical; verify all 12 themes visually.

## Constraints and existing context

- This is NOT the Next.js you know (Next 16.2, React 19.2): read `node_modules/next/dist/docs/` before writing code.
- Tailwind 4, `@base-ui/react`, shadcn 4, lucide-react, sonner, next-themes, react-hook-form with zod 3, Prisma 7 (libsql), vitest.
- No drag-and-drop or grid library is installed; charts are custom SVG in `components/charts/` (spend-area, sparkline, trend-chart, ranked-bars, composition-bar, meter). Reuse them.
- Use semantic tokens (`bg-card`, `text-muted-foreground`, `--chart-1..5`); 12 themes (6 dark) must all look right. Card style: shadcn `Card`, title `text-[13px] font-medium uppercase tracking-wide text-muted-foreground`.
- Existing dashboard: `app/(app)/page.tsx`; components in `components/dashboard/`. Intake, Reminders, Expiring Warranties and Spending cards are inlined in the page and need extracting into standalone cards.
- Data helpers: `lib/costs.ts`, `lib/costs-server.ts`, `lib/maintenance-due(-server).ts`, `lib/inbox-server.ts`, `lib/assets-server.ts`, `lib/asset-activity.ts`; formatting via `getFormat()` in `lib/regional-server.ts`.
- Server actions live in `lib/actions/*.ts` (`"use server"`, `auth()`, zod, `revalidatePath`).

## Left to the builder

- Drag/resize implementation. The owner approved adding a new dependency; dnd-kit is the designer's suggestion (touch and keyboard support), the builder may choose another if justified. Also grid column count and animation approach.
- Layout data model and JSON shape (including versioning so old layouts survive card changes).
- Exact size tiers, minimum/maximum sizes, and per-card config options.
- Visual design of edit mode, the card picker, and empty states.
- Implementation model: the owner suggested Opus may suit the build; recommend it for implementation.
