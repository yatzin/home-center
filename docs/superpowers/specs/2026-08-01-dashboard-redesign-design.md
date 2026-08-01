# Dashboard + shared chrome redesign

Date: 2026-08-01
Status: approved

## Goal

Redesign the dashboard page and the shared app chrome (sidebar, header) to feel
like a premium, calm, professional desktop application — comparable to Linear,
Vercel, Raycast, Notion Calendar — without changing existing functionality or
business logic, except where a small, obvious usability win is called out
explicitly below.

## Scope

- `app/(app)/page.tsx` — dashboard content
- `components/sidebar.tsx` — nav
- `app/(app)/layout.tsx` — header shell
- `components/theme-toggle.tsx`, `components/notification-bell.tsx`,
  `components/user-menu.tsx` — header controls (styling only)
- `app/globals.css` — design tokens (colors, radius) that these components draw from

Out of scope: other app pages (`/records`, `/warranties`, `/maintenance`,
`/assets/*`, `/settings`, `/notifications`) are not being redesigned in this
pass, though they inherit any shared primitive changes (e.g. `Card`) since
those are global design-system tokens/components, not page-specific.

## Non-goals

- No new business logic, no new data fetched, no new pages/routes.
- No new dependencies (no animation libraries, no icon set changes — stays on
  `lucide-react`, Tailwind v4, shadcn primitives, `next-themes`).
- No gradients, glow effects, oversized icons, or multi-color palettes.

## Design tokens (`app/globals.css`)

**Accent color** — one indigo/blue-violet accent replaces the current
near-zero-chroma `--primary`. Used consistently for: active nav indicator,
primary buttons, links, focus rings, urgent/alert numerals, and nowhere else.

- Dark: `--primary: oklch(0.62 0.19 264)`
- Light: `--primary: oklch(0.52 0.19 264)`
- `--ring` in both themes tracks the accent (currently pure gray) so
  `:focus-visible` states read as "accent," not generic gray.

**Layered dark surfaces** — spread `--background` / `--card` / `--sidebar` /
`--popover` so elevation is visible without relying on borders:

- `--background: oklch(0.145 0 0)` (unchanged — deepest layer)
- `--card: oklch(0.19 0 0)` (was 0.205, tuned down slightly against the new sidebar value)
- `--sidebar: oklch(0.17 0 0)` (was 0.205 — distinct from card now)
- `--popover: oklch(0.22 0 0)` (was 0.205 — sits above card/sidebar)

Light theme keeps its existing near-white layering (already has enough
separation at that end of the scale) but adopts the same accent and radius
treatment so both themes share one system.

**Borders → shadows** — `Card` (`components/ui/card.tsx`) drops
`ring-1 ring-foreground/10` as the primary separator in favor of `shadow-sm`
(elevating to `shadow-md` on hover for interactive cards), keeping only a very
faint 1px hairline under the shadow. This is a shared primitive, so the effect
is visible on every page that uses `Card`, not just the dashboard — that's
intended (one consistent system) but noted since it's outside the literal
page scope above.

**Spacing** — 8px system: layout gaps snap to 8/16/24/32px
(`gap-2/4/6/8` in Tailwind's 4px scale). Card internal padding moves from
16px to 20px where cards are the primary content unit (summary cards).

**Type scale** — page title 20px/semibold (was 24px/bold); section labels
13px/medium, uppercase, tracked, muted; summary-card numerals 28px/semibold,
tabular-nums (was 24px/bold); body 14px unchanged.

**Motion** — 150ms ease-out CSS transitions for hover/focus (color, shadow,
background); 200ms for the existing mobile sidebar `Sheet`. No new
animation library.

## Sidebar (`components/sidebar.tsx`)

- Width unchanged (`w-56` / 240px).
- Logo mark: solid accent-tinted rounded square (no gradient), product name
  at medium weight, slightly tighter tracking.
- Active nav item: replace the current solid `bg-primary` block with a 2px
  accent-colored left bar + soft tinted background (`bg-accent/40`-equivalent)
  + accent-colored icon and label. Inactive hover: subtle background lift
  only, 150ms transition (upgrade from `transition-colors` default duration).
- Icons: consistent 18px, stroke width 1.5.
- Item vertical padding: `py-2` → `py-2.5` for more breathing room.
- No section grouping/labels added — 7 items is short enough that grouping
  would add visual noise, not hierarchy.
- Bottom "Settings" item keeps its hairline separation from the main nav.

## Header (`app/(app)/layout.tsx`)

- Height: `h-12` (48px) → `h-14` (56px).
- Bottom hairline kept, plus `bg-card/80 backdrop-blur` so scrolled content
  passes underneath with a sense of layering rather than a flat divider.
- Icon buttons (theme toggle, bell, user-menu trigger): consistent 36px hit
  targets; hover gets a soft background plus a subtle icon
  opacity/scale shift instead of a flat background swap only.
- Notification bell: keep the destructive-red badge (real alert state, not
  decorative) but tighten to a clean dot-with-count sitting on the bell's
  corner.
- User menu avatar fallback: accent-tinted background instead of default
  muted gray, so it doesn't read as a disabled/placeholder state.

## Dashboard content (`app/(app)/page.tsx`)

**Page header** — "Welcome back, {name}" at 20px/semibold (was 24px/bold),
8px gap to the existing 14px muted subtitle. Copy and logic unchanged.

**Summary cards (5-up strip)**
- Existing responsive grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`) kept;
  gaps standardized to the 8px system.
- Each card: icon moves into a 32px rounded-lg tinted swatch above the label
  (was a bare icon top-right next to the label). Swatch is neutral gray
  normally; accent/destructive-tinted only when the card is genuinely urgent
  (existing `urgent` prop on the "Due (30d)" card) — the tint becomes a status
  signal, not decoration.
- Label (12px muted, uppercase-tracked) sits below the icon row; numeral
  (28px/semibold/tabular-nums) is the primary visual anchor.
- Card padding 16px → 20px.
- Shadow-based elevation (see Card token change above) with a 1px hover lift
  (`translate-y-[-1px]`, 150ms) — replaces the current `hover:border-primary/50`
  treatment.

**Three list panels (Upcoming Maintenance / Expiring Warranties / Recent Service)**
- Header: 13px/medium section label pattern; "View all →" restyled as a
  small ghost-button-style affordance, accent-colored on hover (was plain
  muted-to-foreground text color swap).
- Rows: vertical padding 8px → 10–12px, subtle background on hover.
- **Functional addition:** each row becomes a link to its asset's detail page
  (`/assets/properties/[id]` or `/assets/vehicles/[id]`), matching the
  pattern `app/(app)/maintenance/page.tsx` already uses for its own rows.
  There are no per-item detail routes for maintenance schedules, warranties,
  or service records themselves (they live inline on the asset's page), so
  linking to the asset is the correct target — not a new route, just wiring
  an existing one from a second place.
- Badges (days-left pills) keep current semantic colors (destructive for
  overdue, secondary otherwise); shape/weight refined to match the new card
  system.
- Empty states: existing single muted line gets the panel's own icon (Clock /
  ShieldCheck / Wrench) shown above it at low opacity, ~24px vertical
  padding. No new copy.

## Accessibility

- Accent indigo verified at ≥4.5:1 against both theme backgrounds when used
  as text; fill-only uses (swatches, nav bar) aren't contrast-load-bearing.
- All newly-clickable elements (list rows, view-all links) get
  `:focus-visible` rings using the (now accent-tinted) `--ring` token —
  currently these have hover-only affordance with nothing for keyboard users.
- Existing `aria-label`s on icon-only buttons (theme toggle, bell) are
  unaffected.

## Responsive

- Summary-card and three-panel grids keep their existing breakpoints;
  changes are internal spacing/density only.
- Mobile sidebar `Sheet` unaffected structurally, inherits new nav-item
  styling.

## Explicitly not changing

- No new dependencies.
- No changes to data fetching, Prisma queries, or route structure beyond the
  row-to-asset links described above.
- `/records`, `/warranties`, `/maintenance`, `/assets/*`, `/settings`,
  `/notifications` pages are not redesigned in this pass.
