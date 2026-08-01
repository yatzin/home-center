# HomeCenter

Track your homes and vehicles — repairs, services, warranties, and upcoming maintenance reminders — behind simple local-user authentication. Runs as a single container with a SQLite database.

## Quick start (Docker / Portainer)

This is the recommended way to run HomeCenter — no Node.js or build tools required, just Docker.

### 1. Get the compose file

Copy `docker-compose.yml` from this repo, or in Portainer: **Stacks → Add stack → paste the contents of `docker-compose.yml`**.

### 2. Set your environment variables

Create a `.env` file next to `docker-compose.yml` (or add these as stack environment variables in Portainer):

```env
AUTH_SECRET=q8fJZ3n0X9pQe2vT7yB1kR4mL6cW8dS0uA5hN3zP9io=
AUTH_URL=http://192.168.1.50:3000
ADMIN_NAME=Jane Homeowner
ADMIN_EMAIL=jane@example.com
ADMIN_PASSWORD=correct-horse-battery-staple
```

- **`AUTH_SECRET`** *(required)* — a random key used to encrypt login sessions. If it's missing, sessions can't be created and login will fail. Generate a real one yourself, don't reuse the example above:
  ```bash
  openssl rand -base64 32
  ```
  No `openssl` handy? Any long random string works — e.g. generate one at [generate-secret.vercel.app](https://generate-secret.vercel.app/32) or with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

- **`AUTH_URL`** *(recommended)* — the exact address you'll type into a browser to reach the app, including port. This is how the app validates login redirects. Examples:
  - On a home network, reachable by IP: `http://192.168.1.50:3000`
  - Same machine only: `http://localhost:3000`
  - Behind a reverse proxy with a domain: `https://homecenter.example.com`

  If you leave this blank it defaults to `http://localhost:3000`, which only works if you're browsing from the NAS itself.

- **`ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`** *(optional)* — your own login, created once when the database is first seeded. `ADMIN_EMAIL` is just a login identifier here, not a real mailbox — it never needs to receive mail, so `jane@example.com` or `admin@home.local` both work fine. Leave all three unset and the app creates `admin@localhost` / `changeme` instead, forcing you to pick a new password the moment you log in.

### 3. Start it

```bash
docker compose up -d
```

Or in Portainer, click **Deploy the stack**.

On first boot the container automatically:
- runs any pending database migrations,
- creates the admin account (from `ADMIN_*` above, or the `admin@localhost` / `changeme` default if unset — safe to leave running, it skips seeding once an admin already exists).

### 4. Log in

Visit `http://<your-nas-ip-or-domain>:3000/login`.

- If you set `ADMIN_EMAIL`/`ADMIN_PASSWORD`: use those.
- If you didn't: log in with `admin@localhost` / `changeme` — you'll be forced to set a new password immediately.

### Updating

Pull the new image and recreate the stack (Portainer: **Pull and redeploy**, or `docker compose pull && docker compose up -d`). Your database and uploads persist in the `homecenter_data` volume across updates.

### Data persistence

Everything that matters — the SQLite database and uploaded files — lives in the `homecenter_data` Docker volume (mounted at `/data` in the container). Removing the stack keeps this volume; `docker compose down -v` deletes it.

## Environment variables reference

| Variable | Required | Example value | What it actually does |
|---|---|---|---|
| `AUTH_SECRET` | **Yes** | `q8fJZ3n0X9pQe2vT7yB1kR4mL6cW8dS0uA5hN3zP9io=` | Encrypts/signs login sessions. Any long random string works; generate your own with `openssl rand -base64 32`. Changing it later logs everyone out. |
| `AUTH_URL` | Recommended | `http://192.168.1.50:3000` | The exact URL you browse to. Wrong value here → login redirects break. Defaults to `http://localhost:3000` (only correct if browsing from the NAS itself). |
| `ADMIN_NAME` | No | `Jane Homeowner` | Display name for the auto-created admin account. Only read once, at first seed. Default: `Admin`. |
| `ADMIN_EMAIL` | No | `jane@example.com` | Login username for the auto-created admin. Just an identifier — doesn't need to be a real inbox. Default: `admin@localhost`. |
| `ADMIN_PASSWORD` | No | `correct-horse-battery-staple` | Initial admin password. Leave unset and the app uses `changeme`, then forces a password change on first login. If you set this, no forced reset happens — pick something real. |
| `DATABASE_URL` | No | `file:/data/homecenter.db` | Where the SQLite file lives inside the container. Already correct in `docker-compose.yml` — only change if you know why. |
| `UPLOAD_DIR` | No | `/data/uploads` | Where uploaded receipts/photos are stored inside the container. Already correct in `docker-compose.yml`. |
| `MAX_UPLOAD_BYTES` | No | `26214400` | Max size (in bytes) for a single upload. The default, `26214400`, is 25 MiB. |

**"Only used at first seed"** means: `ADMIN_*` create the account the very first time the database is empty. Once that admin exists, changing these env vars later does nothing — update your name/password from inside the app instead.

## Local development

Requires Node.js 22+.

```bash
npm install
cp .env.example .env    # then fill in AUTH_SECRET at minimum
npm run db:seed         # creates the admin user
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev database lives at `prisma/dev.db`.

Other useful scripts:

```bash
npm run db:migrate   # create/apply a migration during schema changes
npm run db:studio    # browse the database with Prisma Studio
npm run build         # production build
```

## Building the container image yourself

A GitHub Actions workflow (`.github/workflows/docker-publish.yml`) builds and publishes the image to GitHub Container Registry on every push to `main`. To build locally instead:

```bash
docker build -t home-center .
```
