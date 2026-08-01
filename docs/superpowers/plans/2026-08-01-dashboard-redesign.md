# Dashboard + Shared Chrome Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the dashboard page and shared app chrome (sidebar, header) to a premium, calm, dark-first design system, per `docs/superpowers/specs/2026-08-01-dashboard-redesign-design.md`, with no changes to data fetching or business logic beyond wiring existing asset routes onto dashboard list rows.

**Architecture:** Pure presentation-layer change. One new accent color and a handful of token adjustments in `app/globals.css` cascade through existing shadcn primitives (`Card`, `Badge`); `components/sidebar.tsx`, `app/(app)/layout.tsx`, and the three header-control components get targeted className/structure edits; `app/(app)/page.tsx` gets its `SummaryCard` helper rewritten and its three list panels restructured with a new `EmptyPanel` helper.

**Tech Stack:** Next.js 16 (App Router, RSC), Tailwind CSS v4, shadcn/ui primitives (base-ui under the hood), lucide-react icons, no test runner configured.

## Global Constraints

- No new dependencies (no animation libraries, no new icon packs).
- No gradients, glow/blur decoration beyond the header's `backdrop-blur-sm`, oversized icons, or additional colors beyond the one accent + existing destructive/amber semantic colors.
- Spacing must land on the 8px scale (Tailwind steps: 1=4px, 2=8px, 3=12px is the one allowed half-step already in use, 4=16px, 5=20px, 6=24px, 8=32px) — prefer 2/4/5/6/8 over 3 where the spec calls for it.
- Transitions: 150ms for hover/focus color/shadow/background, 200ms for the existing mobile `Sheet`.
- **No test runner exists in this repo** (`package.json` has no `test` script, no jest/vitest/playwright). Verification for every task is: `npm run lint`, `npx tsc --noEmit`, and a manual check with `npm run dev` — confirm in both light and dark mode (toggle via the existing `ThemeToggle` button) and at a narrow (mobile, <768px) and wide viewport. Do not invent or add a test framework as part of this work.
- Follow existing code conventions: inline per-row `assetType === "PROPERTY" ? ... : ...` ternaries (as already used in `app/(app)/maintenance/page.tsx`) rather than extracting a new shared helper — the codebase already does this three times in `app/(app)/page.tsx` and once in `maintenance/page.tsx`; don't be the fourth pattern.

---

### Task 1: Design tokens — accent color, layered dark surfaces, Card shadow

**Files:**
- Modify: `app/globals.css:52-118`
- Modify: `components/ui/card.tsx:14-17`

**Interfaces:**
- Produces: `--primary` / `--primary-foreground` / `--ring` now resolve to the indigo accent `oklch(0.488 0.243 264.376)` (reused from the existing unused `--sidebar-primary` dark value) in **both** light and dark themes. Every later task that uses `bg-primary`, `text-primary`, `border-primary`, `ring-ring`, or `bg-primary/NN` opacity variants is relying on this.
- Produces: `Card` (`components/ui/card.tsx`) renders with `shadow-sm` + a faint `border-border/60` instead of `ring-1 ring-foreground/10`, and gains `hover:shadow-md` is **not** applied here (that's per-usage in Task 5, since not every card should lift on hover) — this task only changes the base resting elevation.

- [ ] **Step 1: Update the light theme accent tokens**

In `app/globals.css`, inside the `:root { ... }` block, change these three lines:

```css
  --primary: oklch(0.205 0 0);
```
to
```css
  --primary: oklch(0.488 0.243 264.376);
```

and
```css
  --ring: oklch(0.708 0 0);
```
to
```css
  --ring: oklch(0.488 0.243 264.376);
```

Leave `--primary-foreground: oklch(0.985 0 0);` unchanged (white text on the new accent already has sufficient contrast).

- [ ] **Step 2: Update the dark theme accent tokens**

In the `.dark { ... }` block, change:

```css
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
```
to
```css
  --primary: oklch(0.488 0.243 264.376);
  --primary-foreground: oklch(0.985 0 0);
```

(The foreground flips from dark-on-light to light-on-accent because the old `--primary` was near-white; the new one is a mid-tone saturated color.)

Change:
```css
  --ring: oklch(0.556 0 0);
```
to
```css
  --ring: oklch(0.488 0.243 264.376);
```

- [ ] **Step 3: Spread dark-theme surface layering**

Still in `.dark { ... }`, change:

```css
  --card: oklch(0.205 0 0);
```
to
```css
  --card: oklch(0.19 0 0);
```

```css
  --popover: oklch(0.205 0 0);
```
to
```css
  --popover: oklch(0.22 0 0);
```

```css
  --sidebar: oklch(0.205 0 0);
```
to
```css
  --sidebar: oklch(0.17 0 0);
```

`--background` (`oklch(0.145 0 0)`) stays unchanged — it's the deepest layer everything else sits above.

- [ ] **Step 4: Swap Card's border treatment for shadow-based elevation**

In `components/ui/card.tsx`, in the `Card` function's `className`, find:

```
ring-1 ring-foreground/10
```

and replace with:

```
border border-border/60 shadow-sm transition-shadow duration-150
```

So the full class string reads (only this fragment changes, rest of the string is unchanged):

```tsx
"group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground border border-border/60 shadow-sm transition-shadow duration-150 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl"
```

- [ ] **Step 5: Verify**

Run:
```bash
npm run lint
npx tsc --noEmit
npm run dev
```
Open the app in a browser, toggle dark/light with the theme switch in the header. Expected: every `Card`-based panel across the app (dashboard, properties, records, etc.) now shows a soft shadow instead of a hard 1px ring; in dark mode, the sidebar, card panels, and any popovers/dropdowns are visibly different shades of near-black rather than identical. No layout breakage on any page.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css components/ui/card.tsx
git commit -m "Add indigo accent token and layered dark surfaces"
```

---

### Task 2: Sidebar — logo, active-item indicator, spacing

**Files:**
- Modify: `components/sidebar.tsx`

**Interfaces:**
- Consumes: `--primary` accent from Task 1 (via `bg-primary`, `text-primary`, `bg-primary/10`).
- Produces: no exported signature changes — `Sidebar`, `MobileSidebarTrigger` keep the same names/props consumed by `app/(app)/layout.tsx`.

- [ ] **Step 1: Replace the `NavLink` component**

In `components/sidebar.tsx`, replace the entire `NavLink` function (currently lines 25-41) with:

```tsx
function NavLink({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: React.ElementType; onClick?: () => void }) {
  const pathname = usePathname()
  const active = pathname === href || (href !== "/" && pathname.startsWith(href))
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0"
        )}
      />
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
      {label}
    </Link>
  )
}
```

- [ ] **Step 2: Polish the logo mark**

In `SidebarContent`, find:

```tsx
      <div className="mb-6 flex items-center gap-2 px-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">HC</div>
        <span className="font-semibold">HomeCenter</span>
      </div>
```

Replace with:

```tsx
      <div className="mb-6 flex items-center gap-2 px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">HC</div>
        <span className="font-semibold tracking-tight">HomeCenter</span>
      </div>
```

- [ ] **Step 3: Verify**

Run:
```bash
npm run lint
npx tsc --noEmit
npm run dev
```
In the browser, click through each sidebar item (Dashboard, Properties, Vehicles, Service Records, Warranties, Maintenance, Notifications, Settings). Expected: the active item shows a thin accent-colored bar on its left edge, tinted accent background, and accent-colored icon/text — no solid filled block. Inactive items show a subtle background on hover only. Check both light and dark themes and the mobile sheet (narrow viewport, hamburger menu).

- [ ] **Step 4: Commit**

```bash
git add components/sidebar.tsx
git commit -m "Redesign sidebar nav with left-bar active indicator"
```

---

### Task 3: Header shell — height, translucency, hairline

**Files:**
- Modify: `app/(app)/layout.tsx:21`

**Interfaces:**
- Consumes: `--card`, `--border` tokens from Task 1.
- Produces: no signature change.

- [ ] **Step 1: Update the header className**

In `app/(app)/layout.tsx`, find:

```tsx
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-card px-4">
```

Replace with:

```tsx
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-card/80 backdrop-blur-sm px-4">
```

- [ ] **Step 2: Verify**

Run:
```bash
npm run lint
npx tsc --noEmit
npm run dev
```
Confirm the header is visibly taller (56px vs 48px) and the bottom border reads as a soft hairline rather than a hard line, in both themes. No content clipping in the header row.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "Increase header height and soften its border"
```

---

### Task 4: Header controls — theme toggle, notification bell, user menu

**Files:**
- Modify: `components/theme-toggle.tsx`
- Modify: `components/notification-bell.tsx`
- Modify: `components/user-menu.tsx`

**Interfaces:**
- Consumes: `--primary` accent from Task 1.
- Produces: no signature changes — all three keep their existing exported names/props.

- [ ] **Step 1: Update `ThemeToggle`**

In `components/theme-toggle.tsx`, replace:

```tsx
  if (!mounted) {
    return <div className="h-8 w-8" aria-hidden="true" />
  }

  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
```

with:

```tsx
  if (!mounted) {
    return <div className="h-9 w-9" aria-hidden="true" />
  }

  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="group inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 transition-transform duration-150 group-hover:scale-110" />
      ) : (
        <Moon className="h-4 w-4 transition-transform duration-150 group-hover:scale-110" />
      )}
    </button>
  )
```

- [ ] **Step 2: Update `NotificationBell`**

In `components/notification-bell.tsx`, replace the whole return statement:

```tsx
  return (
    <Link
      href="/notifications"
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors"
      aria-label={`${unreadCount} unread notifications`}
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none flex items-center justify-center"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </Link>
  )
```

with:

```tsx
  return (
    <Link
      href="/notifications"
      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
      aria-label={`${unreadCount} unread notifications`}
    >
      <Bell className="h-4 w-4 transition-transform duration-150 group-hover:scale-110" />
      {unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] font-semibold leading-none flex items-center justify-center ring-2 ring-card"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </Link>
  )
```

- [ ] **Step 3: Update `UserMenu`**

In `components/user-menu.tsx`, replace:

```tsx
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors outline-none">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
```

with:

```tsx
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted outline-none">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary/15 text-xs font-medium text-primary">{initials}</AvatarFallback>
        </Avatar>
```

- [ ] **Step 4: Verify**

Run:
```bash
npm run lint
npx tsc --noEmit
npm run dev
```
In the browser: hover each of the three header controls — expect a soft background plus the icon nudging slightly larger (theme toggle, bell). Trigger a notification (or check with existing unread notifications) to confirm the badge sits cleanly on the bell corner with a visible separation ring in both themes. Open the user menu and confirm the avatar initials now sit on a tinted accent background instead of plain gray.

- [ ] **Step 5: Commit**

```bash
git add components/theme-toggle.tsx components/notification-bell.tsx components/user-menu.tsx
git commit -m "Refine header control hover/focus states and avatar tint"
```

---

### Task 5: Dashboard page header + summary cards

**Files:**
- Modify: `app/(app)/page.tsx`

**Interfaces:**
- Consumes: `--primary`/`--destructive` accents, `Card`/`CardContent` from `components/ui/card.tsx` (Task 1), `cn` from `@/lib/utils`.
- Produces: `SummaryCard` keeps the same props (`icon`, `label`, `value`, `href`, `urgent`) — Task 6 doesn't touch it, but note it for context.

- [ ] **Step 1: Add the `cn` import**

At the top of `app/(app)/page.tsx`, add to the imports:

```tsx
import { cn } from "@/lib/utils"
```

- [ ] **Step 2: Restyle the page header**

Replace:

```tsx
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Here&apos;s an overview of your homes and vehicles.</p>
      </div>
```

with:

```tsx
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome back{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">Here&apos;s an overview of your homes and vehicles.</p>
      </div>
```

- [ ] **Step 3: Fix the summary-card grid gap to the 8px scale**

Replace:

```tsx
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
```

with:

```tsx
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
```

- [ ] **Step 4: Rewrite `SummaryCard`**

Replace the entire `SummaryCard` function (currently at the bottom of the file) with:

```tsx
function SummaryCard({ icon: Icon, label, value, href, urgent }: {
  icon: React.ElementType; label: string; value: number; href: string; urgent?: boolean
}) {
  return (
    <Link href={href} className="block">
      <Card className="py-5 transition-all duration-150 hover:-translate-y-px hover:shadow-md">
        <CardContent className="flex flex-col gap-3 px-5">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              urgent ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div>
            <div className={cn("text-[28px] font-semibold leading-none tabular-nums", urgent && "text-destructive")}>
              {value}
            </div>
            <div className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 5: Verify**

Run:
```bash
npm run lint
npx tsc --noEmit
npm run dev
```
Confirm: page title reads smaller/calmer than before; the five summary cards show an icon in a tinted rounded swatch above a large number and an uppercase label beneath, with a soft shadow that lifts slightly on hover; the "Due (30d)" card shows destructive-red swatch/number only when its count is greater than 0. Check the 2/3/5-column responsive breakpoints by resizing the browser.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "Redesign dashboard header and summary cards"
```

---

### Task 6: Dashboard list panels — headers, row links, empty states

**Files:**
- Modify: `app/(app)/page.tsx`

**Interfaces:**
- Consumes: `Card`, `CardHeader`, `CardTitle`, `CardContent` from `components/ui/card.tsx`; `Badge` from `components/ui/badge.tsx`; `Link` from `next/link`; icons `AlertTriangle`, `Clock`, `ShieldCheck`, `Wrench` already imported at the top of the file.
- Produces: new `EmptyPanel` helper (`icon: React.ElementType`, `message: string`) defined in this file, used only here.
- Functional change: each row in all three panels becomes a `Link` to `/assets/properties/[id]` or `/assets/vehicles/[id]` (same asset-routing convention already used in `app/(app)/maintenance/page.tsx`), instead of being static text.

- [ ] **Step 1: Replace the three-panel grid**

Replace the entire block from `<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">` through its closing `</div>` (the section containing "Upcoming Maintenance", "Expiring Warranties", "Recent Service") with:

```tsx
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Upcoming maintenance */}
        <Card className="py-5">
          <CardHeader className="px-5 pb-1">
            <CardTitle className="flex items-center justify-between text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              Upcoming Maintenance
              <Link
                href="/maintenance"
                className="rounded-md px-2 py-1 text-xs font-medium normal-case tracking-normal text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
              >
                View all →
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-5">
            {urgentMaintenance.length === 0 ? (
              <EmptyPanel icon={Clock} message="Nothing due in the next 30 days." />
            ) : urgentMaintenance.map((s) => {
              const assetName = s.assetType === "PROPERTY" ? propMap[s.assetId] : vehMap[s.assetId]
              const assetHref = s.assetType === "PROPERTY" ? `/assets/properties/${s.assetId}` : `/assets/vehicles/${s.assetId}`
              const daysLeft = s.nextDueDate ? Math.ceil((new Date(s.nextDueDate).getTime() - now.getTime()) / 86400000) : null
              const overdue = daysLeft !== null && daysLeft < 0
              return (
                <Link
                  key={s.id}
                  href={assetHref}
                  className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm transition-colors duration-150 hover:bg-muted/60"
                >
                  {overdue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" /> : <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{assetName}</span>
                  <Badge variant={overdue ? "destructive" : "secondary"} className="shrink-0 text-xs">
                    {daysLeft === null ? "—" : daysLeft < 0 ? `${Math.abs(daysLeft)}d late` : daysLeft === 0 ? "Today" : `${daysLeft}d`}
                  </Badge>
                </Link>
              )
            })}
          </CardContent>
        </Card>

        {/* Expiring warranties */}
        <Card className="py-5">
          <CardHeader className="px-5 pb-1">
            <CardTitle className="flex items-center justify-between text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              Expiring Warranties
              <Link
                href="/warranties"
                className="rounded-md px-2 py-1 text-xs font-medium normal-case tracking-normal text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
              >
                View all →
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-5">
            {expiringWarranties.length === 0 ? (
              <EmptyPanel icon={ShieldCheck} message="No warranties expiring in the next 60 days." />
            ) : expiringWarranties.map((w) => {
              const assetName = w.assetType === "PROPERTY" ? propMap[w.assetId] : vehMap[w.assetId]
              const assetHref = w.assetType === "PROPERTY" ? `/assets/properties/${w.assetId}` : `/assets/vehicles/${w.assetId}`
              const daysLeft = w.expirationDate ? Math.ceil((new Date(w.expirationDate).getTime() - now.getTime()) / 86400000) : null
              return (
                <Link
                  key={w.id}
                  href={assetHref}
                  className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm transition-colors duration-150 hover:bg-muted/60"
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{w.productName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{assetName}</span>
                  <Badge variant="secondary" className="shrink-0 text-xs">{daysLeft}d</Badge>
                </Link>
              )
            })}
          </CardContent>
        </Card>

        {/* Recent service */}
        <Card className="py-5">
          <CardHeader className="px-5 pb-1">
            <CardTitle className="flex items-center justify-between text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              Recent Service
              <Link
                href="/records"
                className="rounded-md px-2 py-1 text-xs font-medium normal-case tracking-normal text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
              >
                View all →
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-5">
            {recentRecords.length === 0 ? (
              <EmptyPanel icon={Wrench} message="No service records yet." />
            ) : recentRecords.map((r) => {
              const assetName = r.assetType === "PROPERTY" ? propMap[r.assetId] : vehMap[r.assetId]
              const assetHref = r.assetType === "PROPERTY" ? `/assets/properties/${r.assetId}` : `/assets/vehicles/${r.assetId}`
              return (
                <Link
                  key={r.id}
                  href={assetHref}
                  className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm transition-colors duration-150 hover:bg-muted/60"
                >
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{r.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{assetName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{new Date(r.date).toLocaleDateString()}</span>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>
```

- [ ] **Step 2: Add the `EmptyPanel` helper**

Add this function next to `SummaryCard` at the bottom of the file (after `SummaryCard`'s closing brace):

```tsx
function EmptyPanel({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Icon className="h-5 w-5 text-muted-foreground/40" strokeWidth={1.5} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
```

- [ ] **Step 3: Verify**

Run:
```bash
npm run lint
npx tsc --noEmit
npm run dev
```
In the browser: confirm each of the three panel headers now shows as a small uppercase label with a pill-like "View all →" that highlights accent-colored on hover. Confirm each row in all three panels is now clickable and navigates to the correct property/vehicle detail page (test at least one row per panel, including both a property-type and vehicle-type row if your seed data has both). Confirm rows show a subtle hover background. Temporarily test empty states if possible (e.g. by checking a fresh/empty seed, or reading the code path) — otherwise confirm visually via the existing empty-state copy that the icon-above-text layout renders correctly when a panel is empty (if all three panels currently have data, at minimum verify `EmptyPanel` renders correctly by temporarily forcing one array to `[]` in a local scratch edit, viewing it, then reverting — do not commit a forced-empty state).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "Restyle dashboard list panels and link rows to asset pages"
```

---

### Task 7: Final pass — full-app verification

**Files:** none (verification only)

**Interfaces:** none — this task validates the combined output of Tasks 1-6.

- [ ] **Step 1: Full lint + typecheck + build**

```bash
npm run lint
npx tsc --noEmit
npm run build
```
Expected: all three succeed with no errors.

- [ ] **Step 2: Manual walkthrough**

```bash
npm run dev
```
With the app running, check:
1. Dashboard (`/`) in dark mode: page header, 5 summary cards, 3 list panels all match the spec's layered/shadow/accent treatment.
2. Toggle to light mode via `ThemeToggle`: same page, confirm the accent color, shadows, and spacing still read cleanly (light theme was explicitly in scope, not an afterthought).
3. Resize to a narrow viewport (<768px): sidebar collapses to the hamburger `Sheet`, summary cards go to 2 columns, list panels stack to 1 column — no overflow or clipped text.
4. Visit at least one other page that uses `Card` (e.g. `/assets/properties` or `/records`) in both themes, to confirm the shared token/Card changes from Task 1 didn't break anything outside the dashboard.
5. Keyboard-only pass: `Tab` through the sidebar nav, header controls, and dashboard summary cards/list rows — confirm visible focus rings appear (accent-colored) on every interactive element, including the newly-linked list rows.

- [ ] **Step 3: Commit (only if Step 2 surfaced fixes)**

If the walkthrough required any small fixes, commit them individually with a descriptive message. If nothing needed fixing, there's nothing to commit for this task.
