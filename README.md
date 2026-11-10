<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/yatzin/home-center?style=flat&logo=github&label=GitHub%20stars)](https://github.com/yatzin/home-center/stargazers) [![Docker pulls](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fyatzin%2Fhome-center%2Fmain%2Fdocs%2Fbadges%2Fpulls.json&style=flat&logo=docker&logoColor=white)](https://github.com/yatzin/home-center/pkgs/container/homecenter)

# HomeCenter

**Every repair, warranty and receipt for your home, cars and family, on your own server.**

Service history, costs, insurance and reminders for your homes, vehicles, equipment and family health. Every receipt and manual is searchable, and it all runs in one Docker container.

**[More details at home-center.dazzos.com](https://home-center.dazzos.com/)**

**[Install in 5 minutes](#get-started)** · [Demos](#see-it-in-action) · [What's new](#whats-new-since-20) · [Features](#features) · [Settings](#settings-reference) · [FAQ](#faq) · [Updating](#updating)

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue)](LICENSE) ![Version 3.2.0](https://img.shields.io/badge/version-3.2.0-informational) ![Self-hosted](https://img.shields.io/badge/self--hosted-Docker-2496ED) ![amd64 and arm64](https://img.shields.io/badge/arch-amd64%20%7C%20arm64-555) ![No cloud](https://img.shields.io/badge/cloud-none-success)
[![Docker image build](https://github.com/yatzin/home-center/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/yatzin/home-center/actions/workflows/docker-publish.yml) [![Last commit](https://img.shields.io/github/last-commit/yatzin/home-center)](https://github.com/yatzin/home-center/commits/main)

</div>

![HomeCenter dashboard: photo tiles for properties, vehicles, people and equipment, with reminders, expiring warranties, intake, planned spend and spending](docs/screenshots/01-dashboard.png)

<p align="center">
✓ Runs on your NAS or server &nbsp;·&nbsp; ✓ No third-party sign-in &nbsp;·&nbsp; ✓ OCR and search run on-device &nbsp;·&nbsp; ✓ Works with local AI models
</p>

When was the furnace last serviced? Is the fridge still under warranty? What did the truck cost last year? What will the house cost next year? HomeCenter keeps the answers in one place, and reminds you before things are due.

## See it in action

Short walkthroughs recorded on the demo data. Click one to play it.

<table>
<tr>
<td width="33%" valign="top"><a href="docs/screenshots/demos/tour.gif"><img src="docs/screenshots/demos/posters/tour-play.jpg" alt="A quick tour demo"></a><br><b>A quick tour</b> <sub>1:06</sub><br><sub>Dashboard, a house with rooms, a truck, insurance, a person, costs</sub></td>
<td width="33%" valign="top"><a href="docs/screenshots/demos/ask-ai-warranty.gif"><img src="docs/screenshots/demos/posters/ask-ai-warranty-play.jpg" alt="Ask the assistant demo"></a><br><b>Ask the assistant</b> <sub>0:26</sub><br><sub>From a question to the warranty answer</sub></td>
<td width="33%" valign="top"><a href="docs/screenshots/demos/reminder-to-done.gif"><img src="docs/screenshots/demos/posters/reminder-to-done-play.jpg" alt="Reminder to done demo"></a><br><b>Reminder to done</b> <sub>0:40</sub><br><sub>An overdue reminder, completed, next date set</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><a href="docs/screenshots/demos/costs-to-receipt.gif"><img src="docs/screenshots/demos/posters/costs-to-receipt-play.jpg" alt="Costs to receipt demo"></a><br><b>Costs to receipt</b> <sub>0:36</sub><br><sub>From the spending chart to the invoice receipt</sub></td>
<td width="33%" valign="top"><a href="docs/screenshots/demos/search-documents.gif"><img src="docs/screenshots/demos/posters/search-documents-play.jpg" alt="Search your paperwork demo"></a><br><b>Search your paperwork</b> <sub>0:28</sub><br><sub>“roof” finds the 30-year shingle warranty</sub></td>
<td width="33%" valign="top"><a href="docs/screenshots/demos/health-summary.gif"><img src="docs/screenshots/demos/posters/health-summary-play.jpg" alt="Health summary demo"></a><br><b>Health summary</b> <sub>0:28</sub><br><sub>Observations, medication timeline and printable summary</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><a href="docs/screenshots/demos/dashboards-your-way.gif"><img src="docs/screenshots/demos/posters/dashboards-your-way-play.jpg" alt="Dashboards your way demo"></a><br><b>Dashboards your way</b> <sub>0:43</sub><br><sub>Drag, resize, add cards, switch theme</sub></td>
<td width="33%" valign="top"><a href="docs/screenshots/demos/insurance-and-planning.gif"><img src="docs/screenshots/demos/posters/insurance-and-planning-play.jpg" alt="Insurance and planning demo"></a><br><b>Insurance and planning</b> <sub>0:38</sub><br><sub>Policies, planned spend, equipment life</sub></td>
<td width="33%" valign="top"><a href="docs/screenshots/demos/paperless-import.gif"><img src="docs/screenshots/demos/posters/paperless-import-play.jpg" alt="Paperless-ngx import demo"></a><br><b>Paperless-ngx import</b> <sub>0:47</sub><br><sub>Pull documents in from Paperless-ngx</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><a href="docs/screenshots/demos/backup-and-restore.gif"><img src="docs/screenshots/demos/posters/backup-and-restore-play.jpg" alt="Backup and restore demo"></a><br><b>Backup and restore</b> <sub>0:34</sub><br><sub>Verified backups, offline export, restore with a dry run</sub></td>
</tr>
</table>

## What's new since 2.0

- **3.1, Paperless-ngx:** pull documents from your Paperless-ngx server into any asset or into Intake. A scheduled check refreshes copies and flags broken links. ([details](#paperless-ngx-optional))
- **3.0, dashboards, push, planning, insurance, security:** a card catalog with heatmaps, Planned Spend and Equipment Life; push notifications to Discord, ntfy, Telegram or a JSON endpoint; estimated costs on reminders and a 12-month planned spend; equipment life and replacement cost; a top-level Insurance page for home, auto, umbrella, life and renters; a per-device property filter; and a security hardening pass.
- **2.4, rooms, password reset, customizable dashboards:** paint and flooring per room, rooms on service records, reset by email, and a dashboard you can rearrange.
- **2.3, health:** a medication timeline with dose changes, and an assistant that drafts health observations for you to save.
- **2.2, regional settings:** currency, distance and area units, date format and 12/24-hour time, applied everywhere.
- **2.1, backups:** scheduled, verified backups with optional protection, in-app restore with a dry run, and an offline export you can read without HomeCenter.
- **2.0, Intake, reminder controls, themes:** drop receipts anywhere and file them in a click, snooze, pause or skip reminders, twelve themes.

## Features

| | |
|---|---|
| **Home** | Properties, vehicles and equipment, with service records, warranties, reminders, rooms and insurance |
| **Health** *(optional)* | People, providers and health insurance, with visits, medications, immunizations and observations |
| **Money** | Costs by asset, category and vendor, a 12-month chart, and planned spend for the months ahead |
| **Finding things** | Global search across records and documents, plus an optional AI assistant |
| **Reminders** | In-app bell, per-person email digests and push notifications |
| **Documents** | Attachments, Intake for receipts, Paperless-ngx import, printable reports |
| **Records & export** | Scheduled backups with restore, a full offline export, and a zip of every file on any asset |
| **Your layout** | A customizable dashboard, 12 themes, regional units and currency, install as an app on a phone |
| **Security** | Local login, admin and standard users, sign-in throttling, encrypted secrets |

### Your dashboard, arranged your way

Pick the cards, resize them, and let each one show as much as it has room for. Admins edit it in place; everyone in the household sees the same layout, and phones get a layout of their own.

![Dashboard edit mode](docs/screenshots/02-dashboard-edit.png)

<p>
<a href="docs/screenshots/03-add-card.png"><img src="docs/screenshots/03-add-card.png" width="49%" alt="The Add a card picker"></a>
<a href="docs/screenshots/31-dark-theme-dashboard.png"><img src="docs/screenshots/31-dark-theme-dashboard.png" width="49%" alt="The dashboard in the Spruce Night dark theme"></a>
</p>

[How the dashboard works](#customized-dashboards)

### Every house, car and appliance, with its whole history

Give each thing you own a page: photo, details, and every repair, warranty and reminder attached to it.

- **Properties:** houses, condos, cabins and land.
- **Vehicles:** service history that tracks mileage.
- **Equipment:** part of the home or belongings, with model and serial numbers, expected life, replacement cost and the room it is in.
- **Rooms** *(optional)*: each room's paint colors and flooring, and the equipment, service and reminders in it. Turn them off under **Settings → Features**.
- **Documents** that belong to the thing itself, like a deed, a car title or a manual, with no service record needed.
- **Download all files** for any asset as a zip.

![Maple Street House with its service history](docs/screenshots/05-property.png)

<p>
<a href="docs/screenshots/04-properties.png"><img src="docs/screenshots/04-properties.png" width="24%" alt="Properties grid with photos"></a>
<a href="docs/screenshots/06-rooms.png"><img src="docs/screenshots/06-rooms.png" width="24%" alt="Rooms tab: paint and flooring per room"></a>
<a href="docs/screenshots/09-vehicle.png"><img src="docs/screenshots/09-vehicle.png" width="24%" alt="Vehicle detail for the Work Truck"></a>
<a href="docs/screenshots/11-equipment-detail.png"><img src="docs/screenshots/11-equipment-detail.png" width="24%" alt="Gas Furnace: expected life, replacement cost, location"></a>
</p>

### Know what's due before it's overdue

Set a reminder once. HomeCenter works out the next due date and tells you in time.

- **Every N days or miles, in specific months, or once.** As much warning as you want.
- **Estimated cost and a manual page** on a reminder, so the job links to the right page of the manual and you know roughly what it will cost.
- **Warranty status** at a glance: active, expiring or expired.
- **Overviews** across every asset, sortable and filterable.
- **Closing the loop:** completing a reminder logs it in the service history with cost, vendor and receipt, and a service you log can mark its reminder done.
- **Snooze, pause or skip** a reminder from the dashboard or its asset page.

![Maintenance reminders overview](docs/screenshots/13-maintenance.png)

<p>
<a href="docs/screenshots/07-maintenance-reminders.png"><img src="docs/screenshots/07-maintenance-reminders.png" width="32%" alt="Property reminders with estimated cost and manual page links"></a>
<a href="docs/screenshots/12-warranties.png"><img src="docs/screenshots/12-warranties.png" width="32%" alt="Warranties overview"></a>
<a href="docs/screenshots/26-notifications.png"><img src="docs/screenshots/26-notifications.png" width="32%" alt="Notifications"></a>
</p>

### See where the money goes, and what is coming

Every service record carries a cost. Estimated costs on reminders add up to a **planned spend** for the months ahead, so a roof inspection or a water heater replacement does not surprise you.

- **Monthly, quarterly or yearly** trends with a rolling average, by asset, category and vendor.
- **Planned spend** from your reminders' estimated costs, on the Costs page, on asset pages and as a dashboard card.
- **Equipment life:** what is past its expected life, and what replacing it will cost.
- Amounts and units follow your [regional settings](#settings-reference).

![Costs with a monthly chart by category and planned spend](docs/screenshots/15-costs.png)

### Insurance in one place

Home, auto, umbrella, life and renters policies, plus medical and dental, each with coverage lines, premium history and renewal dates. Link a policy to the people, properties and vehicles it covers.

![Insurance page: auto, home, umbrella and life policies with coverages, premium history and renewals](docs/screenshots/14-insurance.png)

### Drop a receipt, file it in a click

Drag receipts, photos, PDFs or forwarded emails (`.eml`, `.msg`) anywhere in the app. Intake reads the date, vendor and total, suggests which asset they belong to, and files them as a new service record or attaches them to an existing one. Filing a receipt also offers to complete the matching reminder.

<p>
<a href="docs/screenshots/16-intake.png"><img src="docs/screenshots/16-intake.png" width="49%" alt="Intake: dropped receipts read, with a suggested filing"></a>
<a href="docs/screenshots/17-paperless-picker.png"><img src="docs/screenshots/17-paperless-picker.png" width="49%" alt="The Choose from Paperless picker"></a>
</p>

### Your family's health records, close at hand *(optional)*

Keep each person's medical picture in one place, and print a clean summary for the next appointment.

- **Conditions, medications, allergies** and immunizations.
- **Visits** linked to providers, with costs.
- **Observation log and heatmap** to spot patterns in symptoms, readings and sleep.
- **Medication timeline** with dose changes, and a **before and after** view around a change.
- **Refill, vaccine and insurance** reminders.
- If you don't need it, turn the whole section off in **Settings → Features**. It is then off on the server too, not only hidden.

![Person page for Alex Rivera](docs/screenshots/18-person.png)

<p>
<a href="docs/screenshots/19-observations.png"><img src="docs/screenshots/19-observations.png" width="32%" alt="Observations heatmap and log"></a>
<a href="docs/screenshots/20-medications-timeline.png"><img src="docs/screenshots/20-medications-timeline.png" width="32%" alt="Medication timeline with dose changes"></a>
<a href="docs/screenshots/21-medication-before-after.png"><img src="docs/screenshots/21-medication-before-after.png" width="32%" alt="Before and after a medication change"></a>
</p>

<p>
<a href="docs/screenshots/22-providers.png"><img src="docs/screenshots/22-providers.png" width="49%" alt="Providers directory"></a>
<a href="docs/screenshots/33-report-medical.png"><img src="docs/screenshots/33-report-medical.png" width="49%" alt="Printable medical summary with medication history chart"></a>
</p>

### Find anything, even inside the manual

One search box covers assets, records and the text of every file you've uploaded. Ask in your own words and it finds what you meant.

- **Reads** PDF, Word, Excel, PowerPoint, OpenDocument, RTF and text files.
- **OCR** for photos and scanned PDFs.
- **Search by meaning**, using a small model that runs on your server.
- Indexing and OCR run in the background, on your server.

![Search results for roof](docs/screenshots/23-search.png)

### Ask your house a question

The assistant *(optional)* looks up your records and documents to answer plain-language questions, with links back to the source. It can also draft a health observation from what you tell it, then show a Save card so you stay in control.

- Works with OpenAI, OpenRouter, Ollama, LM Studio or any OpenAI-compatible server.
- **Run it fully local** and nothing leaves your network.
- You choose whether it may read documents and health data.
- Chats stay in your browser and are never stored on the server.

<p>
<a href="docs/screenshots/24-assistant.png"><img src="docs/screenshots/24-assistant.png" width="49%" alt="The assistant answering: when was the furnace last serviced?"></a>
<a href="docs/screenshots/25-assistant-observation-draft.png"><img src="docs/screenshots/25-assistant-observation-draft.png" width="49%" alt="The assistant drafting a health observation with a Save card"></a>
</p>

### Reminders, reports and notifications

Reminders arrive in the app and, if you like, by email and push. Reports turn an asset's history into a document you can hand to a buyer, a mechanic or a doctor.

- **Email digests** for each person: as soon as possible, daily or weekly.
- **Push** to Discord, ntfy, Telegram or a JSON endpoint.
- **Printable asset reports** and medical summaries.

<p>
<a href="docs/screenshots/32-report-property.png"><img src="docs/screenshots/32-report-property.png" width="49%" alt="Printable property report"></a>
<a href="docs/screenshots/30-settings-notifications.png"><img src="docs/screenshots/30-settings-notifications.png" width="49%" alt="Notification settings: digest and push"></a>
</p>

### Backups you can trust

Scheduled backups are checked after they are written. Restore in the app with a dry run first, or export everything as a zip you can read offline. [How it works](#how-do-i-back-it-up) · [Export format](docs/export-format.md)

![Data and backups: schedule, password-zip protection, backup list, export and restore](docs/screenshots/27-settings-data-backups.png)

### On your phone, in your theme

Install HomeCenter as an app from the Install page (`/settings/install`). Twelve themes, light and dark, from the top bar.

<p>
<a href="docs/screenshots/36-phone-dashboard.png"><img src="docs/screenshots/36-phone-dashboard.png" width="24%" alt="The dashboard on a phone"></a>
<a href="docs/screenshots/37-themes-menu.png"><img src="docs/screenshots/37-themes-menu.png" width="40%" alt="The 12-theme menu"></a>
</p>

## Private by design

HomeCenter is one container and one data folder, and you own both.

- **Self-hosted:** runs on a Synology, Unraid or any Docker host. Updates never touch your data folder.
- **On-device processing:** OCR and meaning search run inside the container. Their only network call is an optional model download.
- **You decide:** the AI assistant stays off until you turn it on, and Health can be hidden entirely. Login is local, users are admin or standard, repeated failed sign-ins are slowed down, and stored secrets (mail password, AI key, push URL and token, Paperless token, backup passphrase) are encrypted at rest. The assistant warns you when its server is not on your own network.
- **Optional connections:** if you turn on Paperless-ngx, push notifications, a cloud AI provider or email, the server contacts only the addresses an admin set.

<sub>Photos in the screenshots are from <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>, by various authors, under their individual licenses (mostly CC BY-SA).</sub>

## Get started

Setup takes about five minutes. You need:

| Requirement | Why |
|---|---|
| Docker + Docker Compose | How the app runs. No Node.js or build setup needed. |
| A folder on the host for data | Holds the database and uploaded files, and survives updates |
| A second folder or disk for backups *(recommended)* | A backup on the same disk as your data doesn't survive that disk failing |
| ~5 minutes | To set one required value and start the container |

### Install (Docker)

This is the recommended way to run HomeCenter.

**1. Create a folder for its data**, e.g. on a Synology NAS:

```bash
mkdir -p /volume1/docker/homecenter
```

**2. Save this as `docker-compose.yml`** (or paste it into Portainer → Stacks → Add stack):

```yaml
services:
  homecenter:
    image: ghcr.io/yatzin/homecenter:latest
    ports:
      - "3000:3000"
    volumes:
      - /volume1/docker/homecenter:/data
      # Recommended: a second disk or NAS share for backups.
      # Then set Settings → Data & backups → Folder to /backups.
      - /volume2/backups/homecenter:/backups
    environment:
      DATABASE_URL: "file:/data/homecenter.db"
      AUTH_SECRET: ""            # required: openssl rand -base64 32
      AUTH_URL: ""
      MAX_UPLOAD_BYTES: "26214400"
      ADMIN_NAME: "Admin"
      ADMIN_EMAIL: "your@email.com"
      ADMIN_PASSWORD: "changeme"
      # TZ: "America/Chicago"    # clock for backup and sync schedules
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

Update both volume paths to folders on your host (remove the `/backups` line if you have no second location yet).

**3. Set these values:**

| Variable | Required? | What to put |
|---|---|---|
| `AUTH_SECRET` | **Yes** | A random secret: `openssl rand -base64 32`. Without it, logins won't work. |
| `AUTH_URL` | No | The address you'll browse to, e.g. `http://192.168.1.50:3000`. Leave blank to auto-detect it. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | No | Your login, used once on first boot to create the admin account and ignored after that. If you remove `ADMIN_PASSWORD`, the password is `changeme` and you must change it on first login. Without `ADMIN_EMAIL`, the email is `admin@localhost`. |
| `NOTIFY_INTERVAL_MINUTES` | No | How often to check for due maintenance and expiring warranties. Defaults to `360` (6 hours). Set `0` to turn reminders off. An admin can override it under Settings → Notifications (minimum 5), no restart needed. |
| `SMTP_HOST` | No | Your mail server, e.g. `smtp.gmail.com`. **Leave blank and no email is ever sent.** The in-app bell still works. |
| `TZ` | No | Your time zone, e.g. `America/Chicago`. Backup and Paperless schedules run on the server's local time, which in a container is UTC unless you set this. |

Everything else can stay at its default. Uploads (`/data/uploads`) and downloaded models (`/data/models`) are kept in the data folder automatically. The [full list of variables](#environment-variables) is below.

**4. Start it:**

```bash
docker compose up -d
```

(Portainer: click **Deploy the stack**.)

The container sets up its database and admin account automatically on first boot.

**5. Log in** at `http://<your-server-ip>:3000/login` with the admin email/password from step 3. If you later forget the password, set a **Public URL** and a mail server under Settings → Mail server and the login page can send a reset email.

> **Keep it off the open internet.** HomeCenter holds your household's records, and optionally your family's health records, behind a single login. It serves plain HTTP on port 3000 and has no built-in HTTPS. Don't forward that port from your router or publish it to the web. For access away from home, use a VPN to your home network (WireGuard, Tailscale or your router's own). If you must publish it, put it behind a reverse proxy that adds HTTPS, set `AUTH_URL` to the public address, and use a long admin password.

### Environment variables

Only `AUTH_SECRET` is required. A value set in the app's Settings wins over the environment where both exist.

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | `file:/data/homecenter.db` in the compose file | Where the SQLite database lives. |
| `AUTH_SECRET` | none, required | Signs sessions and encrypts stored secrets. Changing it logs everyone out and means re-entering the mail, AI, push and Paperless secrets (protected backups carry them). |
| `AUTH_URL` | auto-detected | The address you browse to. |
| `MAX_UPLOAD_BYTES` | `26214400` (25 MiB) | Largest single upload. |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `Admin` / `admin@localhost` / `changeme` | First-boot admin account only. |
| `NOTIFY_INTERVAL_MINUTES` | `360` | Reminder check interval. `0` turns it off. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM`, `DIGEST_HOUR`, `MAIL_DRY_RUN` | none | Mail. See [Email notifications](#email-notifications-optional). |
| `UPLOAD_DIR` | `/data/uploads` in the image | Where uploaded files are stored. |
| `MODELS_DIR` | `/data/models` in the image | Downloaded search models. |
| `SEARCH_INDEX_PATH`, `DOCUMENT_REINDEX_HOURS`, `EMBEDDING_IDLE_MINUTES` | see [Document search](#document-search-optional) | Search index location, reindex timer and model unload time. |
| `TESSDATA_PATH` | the English OCR data bundled in the image | Folder of OCR language data. Rarely needed. |
| `PORT` | `3000` in the image | Port the app listens on inside the container. Change the published port in compose instead. If you change `PORT`, update the healthcheck too. |
| `HOMECENTER_SUPERVISED` | `1` in the image | Lets an in-app restore restart the process, relying on `restart: unless-stopped` to bring it back. Leave it alone in Docker. |
| `TZ` | UTC in a container | Time zone for scheduled backups and Paperless checks. |

## Customized dashboards

Choose which cards the dashboard shows, how big each one is, and what each one covers. A card shows more as it grows, from a single number to a chart to a ranked list, and you can add the same card more than once, say one Reminders card for vehicles and another for the house. The layout is shared by everyone in the household. Phones get a layout of their own.

![A customized dashboard: greeting, clock, planned spend, equipment life, spending by category, health observations and service heatmaps, reminders, intake and rooms](docs/screenshots/38-dashboard-customized.png)

The card catalog:

- **Assets:** Properties, Vehicles, Equipment and People, from a grid of photos down to a single row of round avatars.
- **Dated lists:** Records, Active Warranties, Due Maintenance, Reminders and Expiring Warranties, from a self-advancing carousel to a full list.
- **Money:** Spending Trend, Spending Breakdown and **Planned Spend** (what the estimated costs on your reminders add up to over the next 1 to 24 months).
- **Equipment Life:** how old your equipment is against how long it should last, and what replacing what is nearing the end will cost. Equipment needs an install or purchase date and an expected life to appear.
- **Heatmaps:** Service Activity, Health Visits & Expenses and Health Observations, each a calendar of the last X months with a square per day, darker the busier, for everything or for one asset or person.
- **Intake:** what is waiting to be filed.
- **Text and Clock:** your own greeting or notes with live values, and the time and date.

- **Edit:** admins hover the wrench tab in the top-right corner of the page, touching the header (it slides out to read **Edit dashboard**) and click it. Drag a card to move it and drag its edges to resize it. Cards in the way slide down to make room and slide back if you drag on. Cards stay where you put them, so you can leave empty space between them (up to 5 empty rows; a card dropped further down stops 5 rows below the card above it). Every card also has a **Move & resize** button (and arrow keys on its handle) for moving without dragging. Use the gear for a card's settings (or double-click, or double-tap on a phone, the card itself; cards without settings ignore it), **×** to remove it (with Undo) and **Add card** to add one. Changes save as you go; click **Done** when you're finished. **Reset to default** brings back the standard layout on both desktop and phone.
- **On a phone:** tap the wrench tab in the top-right corner, then use a card's **Move & resize** menu to move it up or down and pick Small, Medium or Large. You can also press and hold its handle to drag it.
- **Text cards:** a **Text** card (under **Add card → Text & time**) shows a line or a few lines of your own: a heading, a note, a reminder for the household. Pick its style (Heading 1 to 4, Body, Small or Muted), its alignment, and whether it has a border; without one, the text sits straight on the page. The greeting at the top of the dashboard ("Welcome back, {user}") is a borderless Heading 1 Text card, so you can reword it, move it or remove it. The text is plain (you can't add formatting or links of your own); line breaks are kept, and text that doesn't fit ends in "…" with the full text in its tooltip. Text can include live values in braces, filled in each time the dashboard loads (the card's settings list them, and clicking one inserts it where the cursor is). Counts and lists follow the property filter, like the other cards:

  | Group | Value | Shows | Links to |
  | --- | --- | --- | --- |
  | You & time | `{user}` | Your first name. | — |
  | You & time | `{user_full}` | Your full name. | — |
  | You & time | `{date}` | Today's date, in your regional date format. | — |
  | You & time | `{weekday}` | Today's day of the week, like Tuesday. | — |
  | You & time | `{year}` | This year, like 2026. | — |
  | Attention | `{overdue}` | How many reminders are overdue. | Maintenance |
  | Attention | `{due_soon}` | How many more are due within 30 days (overdue ones not included). | Maintenance |
  | Attention | `{next_due}` | The most urgent reminder's name. | Maintenance (opens that reminder) |
  | Attention | `{next_due_date}` | The most urgent reminder's due date (empty when it is due by mileage). | Maintenance (opens that reminder) |
  | Attention | `{expiring_warranties}` | How many warranties end within 60 days. | Warranties |
  | Attention | `{next_expiring}` | The name of the warranty that ends soonest, within 60 days. | Warranties (opens that warranty) |
  | Attention | `{next_expiring_date}` | The date that warranty ends. | Warranties (opens that warranty) |
  | Attention | `{intake}` | How many items are waiting in Intake. | Intake |
  | Money | `{spend_ytd}` | Spending so far this year. | Costs |
  | Money | `{spend_month}` | Spending so far this month. | Costs |
  | Counts | `{properties}` | How many properties. | Properties |
  | Counts | `{vehicles}` | How many vehicles. | Vehicles |
  | Counts | `{equipment}` | How many pieces of equipment. | Equipment |
  | Counts | `{records}` | How many service records. | Records |
  | Counts | `{people}` | How many people. (needs Health on) | People |

  A value that has nothing to show (no next reminder, or `{people}` with Health off) is left out, along with the ", " or space just before it: "Welcome back, {user}" reads "Welcome back" for an account with no name. Names are exact (`{User}` is not `{user}`); anything in braces that isn't a value, like `{usr}`, shows as typed, and the settings warn about it. Double braces (`{{user}}`) and braces with spaces (`{ user }`) are always shown as typed.

  Values about a page or an item are links (the **Links to** column): click "14" in "{equipment} items" to open Equipment, or the next reminder's name to open the property, vehicle, piece of equipment or person it's for. They look like the rest of the text with a faint underline that darkens on hover, and a tooltip names where they go. A value that is left out is not a link, and links don't work while you're editing the dashboard.
- **Clock card:** the **Clock** (top right on the standard layout; **Add card → Text & time** to add one) shows the time and today's date. It shows your device's time, in the 12- or 24-hour format and the date format chosen in **Settings → Regional** (the card has no format setting of its own). Its settings: show seconds, show the date, and the clock face (automatic, whenever it fits, or never). One cell wide it shows just the time; two wide, the time over the date; two rows tall or more, an analog clock face with the time.

## Optional extras

HomeCenter works fully without these. Add them when you want them.

### Email notifications (optional)

Until a mail server is set up, reminders only appear in the app. There are two
ways to configure one.

**In the app** (easiest): sign in as an admin and go to **Settings → Mail
server**. Fill in the server, port, and login, save, then use **Send test
email** to confirm it works. No restart needed, and the password is stored
encrypted with your `AUTH_SECRET`.

**Or by environment variable**, if you'd rather bake it into the container:

| Variable | Default | What it does |
|---|---|---|
| `SMTP_HOST` | — | Mail server hostname. Nothing sends until this is set. |
| `SMTP_PORT` | `587` | `465` for implicit TLS, `587` for STARTTLS. |
| `SMTP_USER` / `SMTP_PASS` | — | Login for the mail server. With Gmail or iCloud, use an **app password**, not your account password. Omit both for an unauthenticated LAN relay. |
| `SMTP_SECURE` | auto | `true` forces TLS. Defaults to on for port 465, off otherwise. |
| `MAIL_FROM` | `HomeCenter <no-reply@homecenter.local>` | The From address. Many providers require this to match the authenticated account. |
| `DIGEST_HOUR` | `8` | Hour of day (0–23) for daily and weekly digests. |
| `MAIL_DRY_RUN` | — | `1` logs each message instead of sending it, so you can check the setup safely. |

**Anything set in Settings wins over the environment variable**, and clearing a
field in Settings falls back to it. The form labels which values came from the
environment, so it's clear what's in effect.

Because the stored password is encrypted with `AUTH_SECRET`, **changing
`AUTH_SECRET` makes it unreadable**. The app detects this, stops sending rather
than failing silently, and Settings prompts you to enter the password again.

Each user picks their own cadence under **Settings → Notifications**: off,
as soon as possible, daily, or weekly. New accounts default to daily.

Two caveats:

- Delivery is driven by the same timer as the reminder check, so a digest goes
  out on the first pass **at or after** `DIGEST_HOUR`, not exactly at it. With
  the default 6-hour interval it can be up to 6 hours late. Lower
  `NOTIFY_INTERVAL_MINUTES` if you want tighter timing.
- "As soon as possible" likewise means the next pass, not instantly.

**Who and how often.** An admin picks which accounts get notifications under
**Settings → Notifications → Who gets notifications** (everyone, by default).
Each person then chooses how often the same due item is raised again:

| Option | What you get |
|---|---|
| When it's coming up, and on the due date *(default)* | One heads-up, then one on the day |
| Only once | A single reminder |
| Every check until dismissed | Comes back after you read it, until you dismiss it |

A new due date always starts afresh, for example after you log the service or
move a refill date. Emails cover only new or re-raised reminders, so lowering
the interval doesn't mean repeat messages, except with "every check until
dismissed".

### Push notifications (optional)

Under **Settings → Notifications**, an admin can add a push destination: Discord, ntfy, Telegram or a JSON endpoint. The URL or token is stored encrypted, and the page shows the last result or error. Push follows the same rules as email for who gets notifications and how often a due item is raised again.

### AI assistant (optional)

Sign in as an admin and go to **Settings → Assistant**. Pick a provider (OpenAI,
Ollama, LM Studio, OpenRouter or any OpenAI-compatible server), enter the model
name and, if the provider needs one, an API key (stored encrypted). Use **Test
connection** to confirm the model supports tool calling, which the assistant needs.

Questions, and the records needed to answer them, are sent to that server,
including health records. Point it at a local model if that matters to you. When
HomeCenter runs in Docker, `localhost` means the container: use the host's
address (e.g. `http://host.docker.internal:11434/v1`) for a model running on the
host.

For Ollama, raise the context length. The default is too short for the tool
definitions and results, so answers get cut off or ignore the data. Set
`OLLAMA_CONTEXT_LENGTH=16384` (or more) on the Ollama server. Models of 7B
parameters or larger are recommended; small models often call the tools wrongly
or not at all.

For slow local models, **Time limit per question** (default 180 seconds) caps the
whole answer, including waiting for the model to load or read the prompt.
Raise it if answers time out. Once a reply starts streaming, it also stops if
the server then sends nothing for 60 seconds. **Extra request JSON** passes
server-specific options with every request, e.g.
`{"chat_template_kwargs": {"enable_thinking": true}}` to turn on a model's
thinking in llama.cpp or vLLM, or `{"reasoning_effort": "low"}` for OpenAI
reasoning models.

Chats stay in your browser tab and are never stored on the server.

### Paperless-ngx (optional)

Off by default. Sign in as an admin, go to **Settings → Paperless-ngx**, enter
the server URL and an API token (create one in your Paperless user profile) and
turn it on. It needs Paperless-ngx with API version 9 or newer. HomeCenter
contacts only the Paperless server the admin set.

**Choose from Paperless** then appears next to the upload button and in Intake.
An import copies the file and Paperless's OCR text into HomeCenter and keeps a
pointer to the document. **Who can import from Paperless** lets everyone who is
signed in import, or only admins.

A scheduled check (off, daily or weekly, plus **Check now**) replaces a copy when
its document gets a new version in Paperless, and marks it **Paperless link
broken** when the document is gone. Your copy is never deleted.

### Document search (optional)

HomeCenter reads the text of uploaded files in the background (PDF, Word
(.doc/.docx), OpenDocument, PowerPoint, Excel, RTF, text/CSV, and photos or
scanned PDFs via OCR) and indexes it so the assistant can search it. It runs
entirely inside the container; nothing is sent anywhere until the assistant
uses a passage to answer a question.

**Settings → Documents & search** turns indexing and OCR on or off and shows progress.
**Settings → Assistant** decides whether the assistant may read documents at
all, and separately whether it may read health documents (files on anything
that belongs to a person, such as their visits, reminders and medications). That one is off
by default.

| Variable | Default | Meaning |
|---|---|---|
| `SEARCH_INDEX_PATH` | next to the database (`/data/search-index.db`) | The keyword index. Derived data: it doesn't need backing up and is rebuilt automatically if missing. |
| `DOCUMENT_REINDEX_HOURS` | `6` | How often to pick up missed or failed files. `0` disables the timer (uploads are still indexed immediately). |

Not indexed: iWork files, .zip, legacy .xls/.ppt and HEIC photos.

#### Search by meaning

Besides exact words, HomeCenter can find passages by meaning ("how often do I
swap the furnace filter?" finds "replace every 90 days"). A small AI model runs
**on your server**, so no document text leaves it for this. The model loads only
while documents are being indexed or searched, and unloads when idle.

**Settings → Documents & search → Find documents by meaning** turns it on or off and
picks the model:

| Model | Size | Good for |
|---|---|---|
| BGE small (built in) | 34 MB | Fast, English |
| Arctic Embed M | 110 MB | Best quality for its size, English (recommended upgrade) |
| BGE base | 110 MB | Better quality, English |
| Nomic Embed Text | 137 MB | Good quality, English |
| E5 base | 279 MB | Many languages |
| BGE large | 337 MB | Highest quality, slow on small hosts |

Larger models download from Hugging Face when you click **Download** (the
only time HomeCenter goes online for this) and are stored in `/data/models`.
Switching models re-processes your documents in the background.

| Variable | Default | Meaning |
|---|---|---|
| `MODELS_DIR` | `/data/models` | Where downloaded models are kept. |
| `EMBEDDING_IDLE_MINUTES` | `10` | Unload the model this long after the last search. `0` unloads right after each search. |

## Settings reference

**Settings** has tabs for everyone and tabs for admins only.

| Tab | Who | What it covers |
|---|---|---|
| **Notifications** | Everyone, plus admin controls | Your email digest (off, as soon as possible, daily, weekly) and repeat preference. Admins pick who gets notifications, override the check interval (minimum 5 minutes), turn on debug logging and set up push (Discord, ntfy, Telegram, JSON). |
| **Appearance** | Everyone, per device | Where the assistant button and Intake sit. Themes are in the top bar. |
| **Features** | Admin | Turn Health, Rooms, the Equipment tab, equipment in property costs and the **property filter** on or off. The property filter adds a header dropdown (per device) that scopes lists, cards, totals, reports, notifications, search and the assistant to one property. It is off by default. |
| **Regional** | Admin | Currency (ISO 4217), distance unit, area unit, date format and 12 or 24-hour time. Applied to screens, reports, notifications, the assistant, receipt capture and search. |
| **Mail server** | Admin | SMTP host, port, login, From address and digest hour, a **Public URL** (used in links and password-reset emails) and a **Send test email** button. |
| **Assistant** | Admin | Turn it on or hide it, base URL, API key, model, temperature, token limit, system prompt, time limit, tool rounds, extra request JSON, and whether it may read documents and health documents. A test page checks the model. |
| **Documents & search** | Admin | Indexing, OCR, search by meaning with a model picker, and the receipt parser (built-in or a local AI model). |
| **Paperless-ngx** | Admin | Turn it on, server URL and API token, who can import, a daily or weekly check, and **Check now**. |
| **Users** | Admin | Add and remove users, set admin or standard. |
| **Data & backups** | Admin | Back up now, schedule, keep count, folder, protection, verify, restore with dry run, offline export and the backup list. |

![Regional settings](docs/screenshots/28-settings-regional.png)

<p>
<a href="docs/screenshots/29-settings-features.png"><img src="docs/screenshots/29-settings-features.png" width="32%" alt="Feature toggles"></a>
<a href="docs/screenshots/34-settings-paperless.png"><img src="docs/screenshots/34-settings-paperless.png" width="32%" alt="Paperless-ngx settings, connected"></a>
<a href="docs/screenshots/35-settings-mail.png"><img src="docs/screenshots/35-settings-mail.png" width="32%" alt="Mail server settings"></a>
</p>

## FAQ

### Does it need an internet connection?

No. HomeCenter runs on your local network. It goes online only for things you turn on: email or push reminders, a cloud AI provider, Paperless-ngx, or downloading a larger search model.

### What does the AI assistant send, and where?

Your question and the records needed to answer it go to the AI provider you configure, including health records if you allow it. Point it at Ollama or LM Studio on your own network and nothing leaves. The assistant is off until an admin sets it up, and chats are never stored on the server.

### How do I back it up?

Settings → Data & backups. **Back up now** makes a verified backup; a daily or weekly **schedule** keeps the newest 14 (configurable) and runs on the server's local time, so set `TZ` in compose. Point the folder at a different disk or NAS share (mount it in `docker-compose.yml` as `/backups`, then enter `/backups` as the folder), because a backup on the same disk as your data doesn't survive that disk failing.

Each backup is one file holding the database and every uploaded file. Protection is optional: none, a **recovery key** (the server can't open its own backups), or a **password zip** (opens in 7-Zip, WinRAR or Keka). From the command line: `npm run backup` and `npm run backup:verify -- <file>`.

Keep your `AUTH_SECRET`: an unprotected backup restored under a different one asks you to re-enter the mail password, AI key and push URL. Protected backups carry them.

**Restoring** is done in the app (Settings → Data), or from the command line when the app won't start: stop HomeCenter, then `npm run restore -- <file>` (`--dry-run` to only look). The command line swaps the data in right away. The next start upgrades the database if the backup is older and finishes the restore (everyone is signed out, carried secrets are put back); in Docker that start is the container restarting. `npm start` outside Docker does not run `prisma migrate deploy`, so run `npx prisma migrate deploy` before starting if the backup came from an older version. A restore made in the app waits for a restart; `npm run restore -- --cancel` (or **Cancel staged restore** in Settings → Data) takes it back. In Docker, `docker compose run --rm --no-deps --user nextjs --entrypoint npm homecenter run restore -- /data/backups/<file> --yes` runs it in a fresh container.

### Can I reach it from outside my home?

Not safely by opening a port. HomeCenter has no built-in HTTPS and its login is the only protection, so don't expose port 3000 to the internet. Use a VPN into your home network instead, or put the app behind a reverse proxy that adds HTTPS and set `AUTH_URL` to the public address.

### Will it run on my NAS?

Images are built for amd64 and arm64, so it runs on Synology, Unraid and other Docker hosts, including 64-bit ARM boards such as a Raspberry Pi.

### Can everyone in the house have their own login?

Yes. An admin adds users under Settings → Users as admin or standard. Everyone sees the same household records. Admins also manage users, features, regional settings, mail, the assistant, Paperless-ngx and backups, and each person chooses their own email reminders.

### How is health data protected?

It stays in the database on your server, behind HomeCenter's login with sign-in throttling. The database file itself isn't encrypted, so protect the data folder like any other private files. The assistant can't read health documents unless an admin allows it, and you can hide the Health section entirely.

### Can I install it as an app?

Yes. The Install page (`/settings/install`) has steps for your phone or computer. Browsers only offer a full install over HTTPS or on localhost, so over plain HTTP on your LAN you may only be able to add a shortcut.

## Updating

Pull the new image and recreate the container. Your data folder is untouched, and the database upgrades itself on start:

```bash
docker compose pull && docker compose up -d
```

In Portainer: **Pull and redeploy**. Take a backup first (Settings → Data & backups → **Back up now**).

## Local development

For working on the app itself, not for regular use.

```bash
npm install
cp .env.example .env   # fill in AUTH_SECRET
npm run db:seed
npm run dev
```

Runs at [http://localhost:3000](http://localhost:3000), database at `prisma/dev.db`.

```bash
npm run db:migrate   # create/apply a migration
npm run db:studio    # browse the database
npm run build         # production build
```

**Adding a dashboard card type:** add its definition (sizes, tiers, settings) to `CARD_TYPES` in `lib/dashboard/card-types.ts`, a loader that fetches its data in `lib/dashboard/loaders.ts` (`LOADERS`), and a view in `components/dashboard/cards/` registered in `components/dashboard/cards/index.ts`. Unit tests for the pure layout logic live beside it in `lib/dashboard/*.test.ts`.

**Text card values:** the tokens live in one table, `TEXT_TOKENS` in `lib/dashboard/text-template.ts` (name, group, help line, the data it needs); the settings dialog's help list and the table above are both made from it (a test checks this README against it). The `text` loader parses the card's text, works out which kinds of data its known tokens need (`textNeeds`), and runs one count query per kind, in parallel and only for those (plain text, `{user}` and the date run none). The Attention values share the Due Maintenance card's list (`dueMaintenance`), the money values the Spending cards' rows and helpers (`spendingSummary`, `spendThisMonth`), and `{intake}` the Intake card's list; all follow the device's property filter and the Health setting. A query that fails leaves its values empty (and is logged) rather than failing the card. The card receives the finished text as segments, plain or link (`renderSegments`; `renderText` is the same as one string, for the tooltip and the settings preview), so the browser fetches nothing more. A token's link comes only from `TEXT_TOKENS` (`href`, the page the neighbouring card's "view all" opens) or, for `{next_due}`, `{next_due_date}`, `{next_expiring}` and `{next_expiring_date}`, from the loader (`dueTokenLinks`, `expiringTokenLinks`: the item's page with `?tab=…&open=<id>`, built by `lib/deep-link.ts`, which opens that reminder's or warranty's edit dialog; the lists drop `open` from the address once it has opened the dialog); the text has no link syntax, so a user can't make a link, and the view keeps a link only for a path on this site.

`npm run models:fetch-builtin` downloads the built-in model into `./models/builtin/` (needed once for meaning search in development).

Images are built and published automatically by `.github/workflows/docker-publish.yml` on every push to `main`. To build locally: `docker build -t home-center .`

---
## License

HomeCenter is source-available software licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/).

You may use, modify, and redistribute HomeCenter for permitted noncommercial purposes, subject to the license terms. Commercial use requires separate permission from the copyright holder.

HomeCenter is not open source under the standard Open Source Definition because the license restricts commercial use.

