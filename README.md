# HomeCenter

A self-hosted app for tracking your homes and vehicles — service history, warranties, maintenance reminders, and receipts — in one place, behind your own login.

## Features

- **Properties & vehicles** — houses, condos, land, cars, whatever you own
- **Service records** — log repairs and maintenance as they happen
- **Warranties** — track coverage so you know what's still protected
- **Maintenance reminders** — get notified before something's due
- **Receipts & photos** — attach files to any record
- **Multiple users** — admin, standard, and read-only accounts
- **Local login** — no third-party account required, your data stays on your hardware

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

Everything else can stay at its default.

**4. Start it:**

```bash
docker compose up -d
```

(Portainer: click **Deploy the stack**.)

The container sets up its database and admin account automatically on first boot.

**5. Log in** at `http://<your-server-ip>:3000/login` with the admin email/password from step 3.

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
