# HomeCenter — Planning Document

## Vision

A containerized web application for households to track houses and vehicles: service history, warranties, maintenance schedules with reminders, and file attachments (receipts, manuals, PDFs). Professionally designed, simple to use. Future path includes LLM-powered receipt parsing.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Single app (web + API), strong ecosystem, ideal LLM integration path via Server Actions / API Routes |
| Database ORM | Prisma + `better-sqlite3` | Type-safe queries, SQLite support, easy migrations |
| Auth | Auth.js v5 (NextAuth) | Credentials provider for local users, role support, session handling |
| UI | Tailwind CSS + shadcn/ui | Polished component library, consistent design system, accessible |
| File Storage | Local disk (`/data/uploads/`) | Alongside SQLite DB, mounted as a Docker volume |
| Container | Docker + Docker Compose | Single container, volumes for DB + uploads |
| Notifications | In-app (DB-backed), extensible to email/push | Interface-driven, swap implementations without changing call sites |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Docker Container                  │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐  │
│  │  Next.js App │    │       /data volume        │  │
│  │              │◄──►│  ├── homecenter.db        │  │
│  │  App Router  │    │  └── uploads/             │  │
│  │  API Routes  │    └──────────────────────────┘  │
│  │  Server Actn │                                   │
│  └──────────────┘                                   │
│         │                                           │
│   Auth.js v5 (local credentials)                   │
└─────────────────────────────────────────────────────┘
         ▲
         │ HTTPS (reverse proxy / Traefik / Nginx)
         │
      Browser
```

**Key architectural decisions:**
- All data mutations go through Server Actions or API Route handlers — never direct DB calls from client components
- File uploads stream to disk via a dedicated `/api/uploads` route; records store only the relative path
- The notification system uses a `NotificationChannel` interface, making it easy to add email (e.g., nodemailer) later
- LLM calls happen in Server Actions only, keeping API keys server-side

---

## Data Model

### Users
| Field | Type | Notes |
|---|---|---|
| id | string (cuid) | |
| name | string | |
| email | string | unique |
| passwordHash | string | bcrypt |
| role | enum | `ADMIN`, `USER`, `READONLY` |
| createdAt | DateTime | |

### Properties (Houses, Condos, etc.)
| Field | Type | Notes |
|---|---|---|
| id | string | |
| name | string | e.g. "Main House", "Cabin" |
| type | enum | `HOUSE`, `CONDO`, `TOWNHOUSE`, `OTHER` |
| address | string | |
| purchaseDate | DateTime? | |
| purchasePrice | Decimal? | |
| yearBuilt | int? | |
| sqFt | int? | |
| notes | string? | |

### Vehicles
| Field | Type | Notes |
|---|---|---|
| id | string | |
| name | string | e.g. "Family SUV" |
| make | string | |
| model | string | |
| year | int | |
| vin | string? | |
| color | string? | |
| purchaseDate | DateTime? | |
| currentMileage | int? | updated manually |
| notes | string? | |

### ServiceRecords
| Field | Type | Notes |
|---|---|---|
| id | string | |
| assetId | string | FK to Property or Vehicle |
| assetType | enum | `PROPERTY`, `VEHICLE` |
| date | DateTime | |
| title | string | e.g. "Oil Change", "Roof Repair" |
| description | string? | |
| vendor | string? | |
| cost | Decimal? | |
| mileageAtService | int? | vehicles only |
| createdBy | string | FK User |

### Warranties
| Field | Type | Notes |
|---|---|---|
| id | string | |
| assetId | string | FK to Property or Vehicle |
| assetType | enum | `PROPERTY`, `VEHICLE` |
| productName | string | e.g. "Roof — GAF Timberline" |
| purchaseDate | DateTime? | |
| expirationDate | DateTime? | |
| vendor | string? | |
| vendorPhone | string? | |
| vendorEmail | string? | |
| notes | string? | |

### MaintenanceSchedules
| Field | Type | Notes |
|---|---|---|
| id | string | |
| assetId | string | |
| assetType | enum | |
| title | string | e.g. "Oil Change", "HVAC Filter" |
| description | string? | |
| intervalDays | int? | e.g. 90 for quarterly |
| intervalMiles | int? | vehicles only, e.g. 5000 |
| lastCompletedDate | DateTime? | |
| lastCompletedMileage | int? | |
| nextDueDate | DateTime? | computed or manually set |
| nextDueMileage | int? | |
| reminderDaysBefore | int | default 14 |
| isActive | boolean | |

### Attachments
| Field | Type | Notes |
|---|---|---|
| id | string | |
| recordId | string | FK to ServiceRecord, Warranty, etc. |
| recordType | enum | `SERVICE`, `WARRANTY`, `MAINTENANCE` |
| filename | string | UUID-based name on disk |
| originalName | string | display name |
| mimeType | string | |
| sizeBytes | int | |
| uploadedAt | DateTime | |
| uploadedBy | string | FK User |

### Notifications
| Field | Type | Notes |
|---|---|---|
| id | string | |
| userId | string | FK User |
| type | enum | `MAINTENANCE_DUE`, `WARRANTY_EXPIRING`, `CUSTOM` |
| title | string | |
| message | string | |
| isRead | boolean | |
| relatedEntityId | string? | |
| relatedEntityType | string? | |
| createdAt | DateTime | |

---

## Application Pages

### Dashboard (`/`)
- Upcoming maintenance (next 30 days, sorted by urgency)
- Expiring warranties (next 60 days)
- Recent service activity across all assets
- Quick-add service record button
- Asset summary cards (houses + vehicles)

### Assets
- `/assets` — Grid/list of all properties and vehicles
- `/assets/properties/[id]` — Property detail (service history, warranties, maintenance, files)
- `/assets/vehicles/[id]` — Vehicle detail (same, plus mileage log)
- `/assets/new` — Add property or vehicle

### Service Records
- `/records` — Filterable list across all assets (date range, asset, cost, vendor)
- `/records/[id]` — Detail view with attachments
- `/records/new` — Inline form (pre-select asset)

### Warranties
- `/warranties` — All warranties, sortable by expiration date
- Expiration status indicators (active / expiring soon / expired)

### Maintenance
- `/maintenance` — All schedules, grouped by asset
- Mark complete (updates lastCompleted, computes next due)
- Skip / snooze

### Settings (`/settings`)
- User management (admin only)
- Invite / create local users
- Assign roles

### Notifications
- Bell icon in nav with unread count
- `/notifications` — Full list with mark-read

---

## File Storage

```
/data/
  homecenter.db
  uploads/
    service/
      {recordId}/
        {uuid}.pdf
        {uuid}.jpg
    warranty/
      {recordId}/
        {uuid}.pdf
    maintenance/
      {recordId}/
        {uuid}.jpg
```

- Max file size: 25 MB per file (configurable via env var)
- Accepted types: PDF, JPG, PNG, HEIC, WEBP
- Files served via a Next.js API route that validates the requesting user's session before streaming the file — no direct static access
- On record delete: files are deleted from disk (or archived to a `_deleted/` directory as a safety option)

---

## Authentication & Authorization

- **Auth.js v5** with `Credentials` provider
- Passwords hashed with `bcrypt` (12 rounds)
- Session stored as JWT (stateless, works in single-container setup)
- Role enforcement via middleware (`middleware.ts`) — checks session role against route requirements

| Role | Can Do |
|---|---|
| `ADMIN` | Full access, user management, delete records |
| `USER` | Create/edit all records, cannot manage users |
| `READONLY` | View everything, no writes |

- No self-registration — an admin creates accounts
- Password change on first login for new accounts

---

## Notification System (Extensible Design)

```typescript
// Core interface — never changes regardless of channel
interface NotificationChannel {
  send(notification: NotificationPayload): Promise<void>
}

// Implementations
class InAppChannel implements NotificationChannel { ... }    // ← built now
class EmailChannel implements NotificationChannel { ... }    // ← stub now, fill in later
class PushChannel implements NotificationChannel { ... }     // ← future

// Registry — add channels without touching call sites
const notificationService = new NotificationService([
  new InAppChannel(db),
  // new EmailChannel(smtpConfig),  // uncomment to enable
])
```

A background job (Next.js scheduled route or a lightweight cron on container startup) runs daily to:
1. Find maintenance schedules where `nextDueDate <= now + reminderDaysBefore`
2. Find warranties expiring within 60 days
3. Create `Notification` records for affected users
4. Push through `notificationService`

---

## Financial Tracking (Future Phase)

The polymorphic `assetId` / `assetType` pattern used throughout the schema accommodates financial tracking without structural changes.

### FinancialTransactions table
| Field | Type | Notes |
|---|---|---|
| id | string | |
| assetId | string | FK to Property or Vehicle |
| assetType | enum | `PROPERTY`, `VEHICLE` |
| type | enum | `INCOME`, `EXPENSE` |
| category | enum | `RENT`, `MORTGAGE`, `TAX`, `INSURANCE`, `HOA`, `REPAIR`, `UTILITY`, `OTHER` |
| amount | Decimal | |
| date | DateTime | |
| description | string? | |
| isRecurring | boolean | |
| serviceRecordId | string? | FK to ServiceRecord — links cost to a repair event |

### Design decision: service record costs

A repair is both a service event and an expense. Rather than duplicate data, a `ServiceRecord` can optionally generate a linked `FinancialTransaction` of type `EXPENSE` / category `REPAIR` when a cost is entered. The service record remains the source of truth for *what was done*; the transaction record is the source of truth for *money flow*.

This means:
- Deleting a service record cascades to its linked transaction
- The financial P&L view includes repair costs automatically without double-entry
- Non-repair expenses (rent income, property tax, insurance) are created directly as transactions

### Views this enables
- Per-property income vs. expense over time
- Annual summary for tax purposes
- Net cash flow across all investment properties

---

## LLM Integration (Future Phase)

The app is structured so this drops in cleanly:

1. **Receipt Upload Flow** — user uploads a receipt image/PDF to a new "Parse Receipt" dialog
2. **Server Action** calls an AI provider (OpenAI, Anthropic, or local via Ollama) with the file content
3. Returns a structured suggestion: `{ vendor, date, amount, suggestedCategory, assetId }`
4. User reviews and confirms before any record is created — AI pre-fills the form, human approves

```typescript
// server action — keys never leave server
async function parseReceiptWithAI(fileBuffer: Buffer): Promise<ReceiptSuggestion> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  // ...
}
```

Provider is configured via `AI_PROVIDER` env var (`openai` | `anthropic` | `ollama`), with an adapter layer so switching providers is a one-line env change.

---

## Docker Setup

```yaml
# docker-compose.yml
services:
  homecenter:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - homecenter_data:/data
    environment:
      - DATABASE_URL=file:/data/homecenter.db
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - UPLOAD_DIR=/data/uploads
      - MAX_UPLOAD_BYTES=26214400  # 25MB
    restart: unless-stopped

volumes:
  homecenter_data:
```

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Development Phases

### Phase 1 — Foundation
- [ ] Project scaffold (Next.js 15, Prisma, shadcn/ui, Tailwind)
- [ ] Docker + docker-compose setup
- [ ] Database schema + migrations
- [ ] Auth.js credentials provider, role middleware
- [ ] Admin user seed script

### Phase 2 — Core Asset Management
- [ ] Properties CRUD
- [ ] Vehicles CRUD (with mileage tracking)
- [ ] Dashboard skeleton

### Phase 3 — Records & Warranties
- [ ] Service records (create, list, detail, edit, delete)
- [ ] Warranties (create, list, expiration tracking)
- [ ] File upload + attachment display

### Phase 4 — Maintenance & Notifications
- [ ] Maintenance schedule CRUD
- [ ] Date + mileage trigger logic
- [ ] Mark complete → compute next due
- [ ] In-app notification generation (daily job)
- [ ] Notification bell + `/notifications` page

### Phase 5 — Polish
- [ ] Dashboard — real data, urgency indicators
- [ ] Search + filter across records
- [ ] User management page (admin)
- [ ] Mobile-responsive review pass
- [ ] Bulk file download per asset

### Phase 6 — LLM Integration (Future)
- [ ] AI provider adapter layer
- [ ] Receipt parsing dialog
- [ ] Ollama local model option (no external API key needed)

---

## Open Questions / Decisions to Revisit

- **Mileage entry**: Manual only for now. Later could pull from OBD2 integrations or odometer photo + OCR.
- **Multi-currency**: Single currency assumed. Add `currency` field to cost columns if needed later.
- **Backup strategy**: `homecenter_data` Docker volume — user is responsible for host-level backups. Could add a `/settings/backup` page that exports a ZIP of the DB + uploads.
- **HTTPS/TLS**: Assumed to be handled by a reverse proxy (Nginx, Traefik, Caddy) in front of the container. Document this in the README.
- **Recurring service auto-schedule**: When a service record is saved, optionally auto-advance the related maintenance schedule's `lastCompletedDate`.











Things to add?
Do we make odometer reads more official?
if, when adding or updating service, and odemeter reading it shared, add it to odemeter reading entry? Maybe not add it perse, but have it pick up and show...
Service Records should have a spend total and even a graph of spend over each month?
Have Service records have each data point aligned almost like a table
Expenses pie chart?  expenses vs distance by month?  
total cost on vehical/property item.