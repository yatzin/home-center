# Demo data

`prisma/seed-demo.ts` wipes the database and rebuilds it with a realistic,
lived-in dataset — three houses, five vehicles, thirty pieces of equipment, and
several years of service history, warranties, and reminders behind them. It
exists so the app can be screenshotted with content that looks like somebody
actually uses it.

Every date is written **relative to the moment you run it**. Re-running in six
months refreshes the whole timeline: what was overdue is overdue again, "due
soon" is soon again, and recent service is recent again. Nothing goes stale.

---

## ⚠️ It wipes everything

This is not additive. Before it writes anything it deletes:

- every property, vehicle, and piece of equipment
- every service record, warranty, maintenance reminder, and attachment
- every room (and its paint rows), health observation, medication, and intake item
- the saved dashboard layout
- every notification
- **every user account, including yours**
- the uploaded files in the folders the seed manages under `UPLOAD_DIR`

It prints a row count and the exact database and uploads paths it is about to
destroy, then waits for you to type `WIPE`. Anything else aborts without
touching a thing. If stdin isn't a terminal it refuses outright rather than
guessing. Pass `--keep` to delete nothing instead.

**Do not point this at anything but a local development database.**

---

## Running it

```bash
npm run db:seed:demo
```

or directly:

```bash
npx tsx prisma/seed-demo.ts
```

| Flag | Effect |
|---|---|
| `--yes` / `-y` | Skip the confirmation prompt. Required for non-interactive shells. |
| `--no-images` | Skip photo lookup entirely and use generated placeholders. Fast. |
| `--keep` | Wipe nothing and ask nothing: add the demo data beside what is already there, written by your first admin login. Run it twice and you get two copies. |
| `--refresh-photos` | Ignore the photo cache and re-download everything. |

Environment overrides:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./prisma/dev.db` | Which database gets wiped. |
| `UPLOAD_DIR` | `./uploads` | Where asset photos and attachments are written. |
| `DEMO_EMAIL` | `demo@homecenter.local` | Login created by the seed. |
| `DEMO_PASSWORD` | `demo1234` | Password for that login. |
| `DEMO_NAME` | `Alex Rivera` | Display name, shown in the header and on records. |
| `DEMO_PHOTO_CACHE` | `prisma/.demo-photos` | Where downloaded photos are cached. |

### Signing in afterwards

The wipe deletes all users, so the script creates one and prints it when it
finishes:

```
demo@homecenter.local  /  demo1234
```

It is created as an ADMIN with `mustResetPassword` off, so it drops straight
onto the dashboard — no password-change interstitial in your screenshots.

---

## What you get

| | |
|---|---|
| **3 properties** | Maple Street House (primary), Lake Cabin (seasonal), Cedar Street Rental (tenant-occupied) |
| **5 vehicles** | RAV4, Civic, F-150, Outback, Odyssey — with mileage, VINs, and mileage-based reminders |
| **30 equipment** | Spread 14 / 9 / 7 across the three houses: appliances, HVAC, water, tools, outdoor, security |
| **41 service records** | Spanning about two years, seven of them in the last 30 days so "Recent Service" isn't empty. Equipment records, plus a few painting, foundation and bathroom jobs, are tagged to a room. |
| **16 warranties** | 3 expired, 3 expiring within 60 days, the rest comfortably active, 1 deliberately unknown |
| **26 reminders** | 3 overdue, 6 due within 30 days, the rest further out (plus 2 health reminders for the people). Reminders on Maple Street equipment carry that equipment's room. |
| **21 attachments** | Generated PDF invoices, warranty certificates, visit receipts, the furnace manual and the three intake files, so records show paperclip counts |
| **7 rooms** | On Maple Street House: Kitchen, Living room, Primary bedroom, Bathroom, Laundry room, Basement and Garage, with level, area, dimensions, flooring (type, product, install date) and 12 painted surfaces (brand, color, code, finish). 12 pieces of equipment sit in a room. |
| **Intake** | 3 items waiting to be filed (an Ace Hardware receipt, a plumber invoice, a tire receipt) with a parsed vendor, date and total and a suggested asset. Each has a small generated PDF under `UPLOAD_DIR/inbox`. |
| **Dashboard** | A saved custom layout: a "Good morning, {user}" greeting, a date line, Clock, Planned Spend, Equipment Life, Spending Breakdown, Health Observations and Service Activity calendars, Reminders, Intake, Rooms and People. Without it the app shows its default layout. With `--keep`, an existing layout is not overwritten. |
| **Insurance** | 6 policies. A home policy on Maple Street House renewing in 21 days, an auto policy on the Work Truck (premiums every 6 months), an umbrella policy renewing in 18 days that covers nothing yet (monthly premium), and a term life policy covering both people (monthly premium that went up), plus medical and dental. The first four have coverage lines. |
| **People** | Two people (the demo user and a child), three providers, three conditions (managed hypertension, resolved high cholesterol, active asthma), a severe penicillin allergy, five visits with PDF receipts, and two health reminders |
| **7 medications** | A timeline with starts and stops: lisinopril 5 mg then 10 mg (the current one due for refill), atorvastatin stopped months ago, ongoing vitamin D3, the child's albuterol inhaler, and finished amoxicillin and cetirizine courses |
| **57 health observations** | About six months for the adult (blood pressure drifting down, weight, resting heart rate, a headache and a bad night) and the child (asthma flares, night cough, poor sleep, a meltdown). The model has no numeric fields, so readings like `128/82 mmHg` are in the notes. |

The mix is deliberate: the dashboard's "Upcoming Maintenance" and "Expiring
Warranties" panels both have content, warranty and maintenance status filters
each match something, and the service list has enough rows to page through.

Equipment is linked to properties, so the equipment list's Property column and
the property filter are both meaningful.

---

## Photos

Photos come from **Wikimedia Commons**, searched per item ("Toyota RAV4", "sump
pump", "gas furnace"). They're real photographs, subject-matched, and — unlike
the usual placeholder services — carry no watermark or attribution bar burned
into the pixels.

Wikimedia rate-limits anonymous traffic, so the script makes its requests one at
a time with backoff. **The first run takes a couple of minutes.** Downloads are
then cached in `prisma/.demo-photos/` (gitignored), so every later run is
effectively instant and works offline. `--refresh-photos` re-downloads.

If a lookup fails or you pass `--no-images`, the item falls back to a generated
gradient image so the layout still holds together.

Commons files are freely licensed but individual files carry individual licenses
(CC-BY, CC-BY-SA, public domain, and others). That's fine for local screenshots
and demos. If a screenshot is going somewhere public where attribution matters,
check the license on the specific file, or swap in your own photos.

---

## Refreshing months later

Just run it again:

```bash
npm run db:seed:demo
```

The photo cache means it won't re-download, and every date is recomputed from
today. You get the same dataset with a freshly relevant timeline.

---

## Relationship to `prisma/seed.ts`

They are different tools and don't overlap:

| | `db:seed` (`prisma/seed.ts`) | `db:seed:demo` (`prisma/seed-demo.ts`) |
|---|---|---|
| Purpose | Bootstrap a real install | Fill a dev database for screenshots |
| Destructive | No — it no-ops if an admin exists | Yes — wipes everything first |
| Creates | One admin user | A full dataset with photos and history |
| Safe on real data | Yes | **No** |
