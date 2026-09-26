# HomeCenter

A self-hosted app for tracking your homes and vehicles — service history, warranties, maintenance reminders, and receipts — in one place, behind your own login.

## Features

- **Properties & vehicles** — houses, condos, land, cars, whatever you own
- **Equipment** — appliances, HVAC, tools, electronics, and other gear tied to a property, with category, manufacturer, model/serial, and purchase info
- **Service records** — log repairs and maintenance as they happen
- **Warranties** — track coverage on a property, vehicle, or piece of equipment so you know what's still protected
- **Maintenance reminders** — get notified before something's due
- **Receipts & photos** — attach files to any record
- **Multiple users** — admin and standard accounts
- **Local login** — no third-party account required, your data stays on your hardware
- **Email notifications** — optional digest or as-it-happens emails for due maintenance and expiring warranties, configurable per-user and via in-app mail server settings
- **AI assistant** — optional chat that answers questions about your data ("what did we spend on the truck last year?", "which meds need refills?") using any OpenAI-compatible model, including local ones via Ollama or LM Studio

## Screenshots

![HomeCenter dashboard](docs/screenshots/1.Dashboard.png)

<p>
<a href="docs/screenshots/2.Properties.png"><img src="docs/screenshots/2.Properties.png" width="32%" alt="Properties"></a>
<a href="docs/screenshots/3.House.png"><img src="docs/screenshots/3.House.png" width="32%" alt="House"></a>
<a href="docs/screenshots/4.ServiceRecord.png"><img src="docs/screenshots/4.ServiceRecord.png" width="32%" alt="Service record"></a>
<a href="docs/screenshots/5.Warranties.png"><img src="docs/screenshots/5.Warranties.png" width="32%" alt="Warranties"></a>
<a href="docs/screenshots/6.MaintenanceReminders.png"><img src="docs/screenshots/6.MaintenanceReminders.png" width="32%" alt="Maintenance reminders"></a>
<a href="docs/screenshots/7.Vehicles.png"><img src="docs/screenshots/7.Vehicles.png" width="32%" alt="Vehicles"></a>
<a href="docs/screenshots/8.VehicleService.png"><img src="docs/screenshots/8.VehicleService.png" width="32%" alt="Vehicle service"></a>
<a href="docs/screenshots/9.Equipment.png"><img src="docs/screenshots/9.Equipment.png" width="32%" alt="Equipment"></a>
<a href="docs/screenshots/10.WarrantyOverview.png"><img src="docs/screenshots/10.WarrantyOverview.png" width="32%" alt="Warranty overview"></a>
<a href="docs/screenshots/11.MaintenanceReminderOverview.png"><img src="docs/screenshots/11.MaintenanceReminderOverview.png" width="32%" alt="Maintenance reminder overview"></a>
<a href="docs/screenshots/12.EmailNotifications.png"><img src="docs/screenshots/12.EmailNotifications.png" width="32%" alt="Email notifications"></a>
</p>

## Requirements

| Requirement | Why |
|---|---|
| Docker + Docker Compose | How the app runs — no manual Node.js/build setup needed |
| A folder on the host for data | Holds the database and uploaded files, survives updates |
| ~5 minutes | To set two required values and start the container |

## Install (Docker)

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
    environment:
      DATABASE_URL: "file:/data/homecenter.db"
      AUTH_SECRET: ""
      AUTH_URL: ""
      UPLOAD_DIR: "/data/uploads"
      MAX_UPLOAD_BYTES: "26214400"
      ADMIN_NAME: "Admin"
      ADMIN_EMAIL: "your@email.com"
      ADMIN_PASSWORD: "changeme"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

Update the volume path to the folder you created in step 1.

**3. Set these values:**

| Variable | Required? | What to put |
|---|---|---|
| `AUTH_SECRET` | **Yes** | A random secret: `openssl rand -base64 32`. Without it, logins won't work. |
| `AUTH_URL` | No | The address you'll browse to, e.g. `http://192.168.1.50:3000`. Leave blank — it's auto-detected. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | No | Your login. Leave as-is and use `admin@localhost` / `changeme` instead (you'll be forced to change it on first login).  Once the app has your password, this field is ignored in the future. |
| `NOTIFY_INTERVAL_MINUTES` | No | How often to check for due maintenance and expiring warranties. Defaults to `360` (6 hours). Set `0` to turn reminders off. |
| `SMTP_HOST` | No | Your mail server, e.g. `smtp.gmail.com`. **Leave blank and no email is ever sent** — the in-app bell still works. |

Everything else can stay at its default.

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

Each user picks their own cadence under **Settings → Email notifications**: off,
as soon as possible, daily, or weekly. New accounts default to daily.

Two caveats worth knowing:

- Delivery is driven by the same timer as the reminder check, so a digest goes
  out on the first pass **at or after** `DIGEST_HOUR`, not exactly at it. With
  the default 6-hour interval it can be up to 6 hours late. Lower
  `NOTIFY_INTERVAL_MINUTES` if you want tighter timing.
- "As soon as possible" likewise means the next pass, not instantly.

Emails are only sent for items you haven't already been emailed about, so
lowering the interval doesn't mean repeat messages.

**4. Start it:**

```bash
docker compose up -d
```

(Portainer: click **Deploy the stack**.)

The container sets up its database and admin account automatically on first boot.

**5. Log in** at `http://<your-server-ip>:3000/login` with the admin email/password from step 3.

### AI assistant (optional)

Sign in as an admin and go to **Settings → Assistant**. Pick a provider (OpenAI,
Ollama, LM Studio, OpenRouter or any OpenAI-compatible server), enter the model
name and, if the provider needs one, an API key (stored encrypted). Use **Test
connection** to confirm the model supports tool calling — the assistant needs it.

Questions, and the records needed to answer them, are sent to that server —
including health records. Point it at a local model if that matters to you. When
HomeCenter runs in Docker, `localhost` means the container: use the host's
address (e.g. `http://host.docker.internal:11434/v1`) for a model running on the
host.

For Ollama, raise the context length — the default is too short for the tool
definitions and results, so answers get cut off or ignore the data. Set
`OLLAMA_CONTEXT_LENGTH=16384` (or more) on the Ollama server. Models of 7B
parameters or larger are recommended; small models often call the tools wrongly
or not at all.

Chats stay in your browser tab and are never stored on the server.

## Updating

Pull the new image and recreate the container — your data folder is untouched:

```bash
docker compose pull && docker compose up -d
```

In Portainer: **Pull and redeploy**.

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

Images are built and published automatically by `.github/workflows/docker-publish.yml` on every push to `main`. To build locally: `docker build -t home-center .`
