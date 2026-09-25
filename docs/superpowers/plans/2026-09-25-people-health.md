# People & Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a People section — a household health record — beside Properties, Vehicles and Equipment: visits and medical expenses with receipts, conditions, medications, allergies, immunizations, providers, insurance, health reminders, medical spend, and a printable medical summary.

**Architecture:** `PERSON` joins the `AssetType` enum, so visits (`ServiceRecord`), reminders (`MaintenanceSchedule`), attachments, costs, the zip download and the printable report all work for people through the existing polymorphic `assetType + assetId` layer. Health-specific data gets its own tables (`Person`, `Provider`, `HealthCondition`, `Medication`, `Allergy`, `Immunization`, `InsurancePolicy`). The new CRUD screens share one config-driven form dialog and one table component instead of seven hand-written ones. Phase 0 hardens the upload/delete paths before any medical file is stored.

**Tech Stack:** Next.js 16.2 (App Router, server actions), React 19, Prisma 7 + SQLite (libsql adapter), zod 3, shadcn/Base UI components, Tailwind 4, Vitest (added in Task 1).

**Spec:** `docs/superpowers/specs/2026-09-25-people-health-design.md`

## Global Constraints

- Branch: `people-health`. Commit after every task. Commit messages end with the attribution lines from the session.
- This is Next.js 16 — `params`/`searchParams` are Promises and must be awaited. Before creating any new page or route file, read the matching guide under `node_modules/next/dist/docs/01-app/` and copy the shape of an existing sibling file (`app/(app)/assets/equipment/...`).
- Prisma client types import from `@/app/generated/prisma/client` (type-only in client components). Enum *values* in pure/client modules import from `@/app/generated/prisma/enums`, never from `client` (that pulls the Prisma runtime into the bundle).
- Pure, client-safe logic lives in `lib/*.ts` without DB imports; anything touching `prisma` lives in `lib/*-server.ts`, `lib/actions/*` or route handlers.
- Server actions: first line `const session = await auth(); if (!session) redirect("/login")`. Validation errors return `{ error: parsed.error.flatten().fieldErrors }`.
- Every `rm` / `mkdir` / `writeFile` under the upload directory goes through `resolveUploadPath()` (Task 1). No `path.join(uploadDir, ...)` anywhere after Task 2.
- Upload types allowed: `.pdf .jpg .jpeg .png .webp .heic .heif`. The stored extension and MIME come from the server-side table, never the client.
- Visibility: every signed-in user sees every person (spec decision). Do not add per-person access checks.
- Notification windows: medication refill 7 days, immunization due 30 days, insurance expiring 60 days.
- Medical categories are offered only when `assetType === "PERSON"`; asset categories only otherwise.
- Verification per task: `npm test` (from Task 1 on), `npx tsc --noEmit`, `npm run lint`. UI tasks also: `npm run dev`, click through the described flow.

## Review Focus

1. **Dates in the wrong order or the future** — a date of birth in the future, a medication ending before it started, an immunization "next due" before it was given, a condition resolved before diagnosis, a policy ending before it starts: the field shows an error, nothing is saved. Pinned in Task 4 schema tests.
2. **Deleting a person leaves nothing behind** — their visits, reminders, conditions, medications, allergies, immunizations, insurance memberships, and every upload directory (`people/<id>`, `service/<visit>`, `maintenance/<schedule>`, `condition/<id>`) are gone. Pinned by Task 11 Step 7.
3. **Upload aimed at a record that doesn't exist** — `POST /api/uploads` with `recordType=CONDITION` and a made-up `recordId` returns 404 and creates no directory. Pinned in Task 2 Step 14 (existing types) and Task 14 Step 5 (new types).
4. **A medication that ended stops nagging** — an ended medication is shown under "Past", gets no refill notification and no "Refilled" button; one whose end date is today is still active today. Pinned in Task 4 `isMedicationActive`/`refillDue` tests.
5. **A sparse person** — a person with only a name (no DOB, no provider, no records) renders on the list, the detail page, and the report with no "NaN", "Invalid Date" or crash. Pinned by the manual checks in Tasks 8, 11 and 16.

---

## File Map

**Create**
| File | Responsibility |
|---|---|
| `vitest.config.ts` | Test runner config, `@/` alias |
| `lib/upload-path.ts` (+ `.test.ts`) | `resolveUploadPath` — the only way to build a path under the upload root |
| `lib/upload-types.ts` (+ `.test.ts`) | Allowed extensions → MIME |
| `lib/attachment-location.ts` (+ `.test.ts`) | Attachment → `[subdir, recordId]` from its own foreign keys |
| `lib/health.ts` (+ `.test.ts`) | Enum option lists, labels, age, medication/immunization/insurance date logic |
| `lib/health-schemas.ts` (+ `.test.ts`) | zod schemas: string form values → Prisma data, incl. date-order rules |
| `lib/form-types.ts` | `FormValues`, `FieldConfig`, `ActionResult` |
| `lib/actions/people.ts` | Person CRUD |
| `lib/actions/providers.ts` | Provider CRUD |
| `lib/actions/health.ts` | Condition / Medication / Allergy / Immunization CRUD, mark refilled |
| `lib/actions/insurance.ts` | Insurance policy CRUD |
| `components/forms/entity-form-dialog.tsx` | Generic config-driven dialog |
| `components/forms/entity-table.tsx` | Generic edit/delete/expand table |
| `components/people/person-fields.ts` | Person dialog field config + initial values |
| `components/people/people-list.tsx` | People list/grid |
| `components/people/person-edit-button.tsx` | Edit button on detail page |
| `components/health/allergy-callout.tsx` | Always-visible allergy box |
| `components/health/allergies-section.tsx` | Allergies tab |
| `components/health/immunizations-section.tsx` | Immunizations tab |
| `components/health/conditions-section.tsx` | Conditions tab |
| `components/health/medications-section.tsx` | Medications tab |
| `components/providers/providers-table.tsx` | Providers page body |
| `components/insurance/insurance-list.tsx` | Insurance page body |
| `components/report/report-parts.tsx` | `SectionTitle`, `Empty` shared by report components |
| `components/report/health-summary.tsx` | Person-only report sections |
| `app/(app)/assets/people/page.tsx` | People list |
| `app/(app)/assets/people/[id]/page.tsx` | Person detail |
| `app/(app)/providers/page.tsx` | Providers |
| `app/(app)/insurance/page.tsx` | Insurance |

**Modify** — `prisma/schema.prisma`, `package.json`, `app/api/uploads/route.ts`, `app/api/files/[...path]/route.ts`, `app/api/assets/[type]/[id]/image/route.ts`, `app/api/assets/[type]/[id]/download/route.ts`, `lib/actions/{attachments,service-records,warranties,maintenance,equipment,properties,vehicles}.ts`, `lib/assets.ts`, `lib/assets-server.ts`, `lib/asset-view.ts`, `lib/costs.ts`, `lib/report-server.ts`, `lib/notifications/checker.ts`, `app/globals.css`, `app/(app)/costs/page.tsx`, `app/(app)/notifications/page.tsx`, `app/reports/[type]/[id]/page.tsx`, `components/sidebar.tsx`, `components/attachments/attachment-list.tsx`, `components/service-records/*`, `components/warranties/*`, `components/maintenance/*`, `components/report/asset-report.tsx`, `prisma/seed-demo.ts`.

---

## Phase 0 — Upload hardening

### Task 1: Test runner and path/type helpers

**Files:**
- Create: `vitest.config.ts`, `lib/upload-path.ts`, `lib/upload-path.test.ts`, `lib/upload-types.ts`, `lib/upload-types.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `uploadRoot(): string`, `resolveUploadPath(...segments: string[]): string` (throws on escape, on the root itself, on empty segments); `UPLOAD_TYPES: Record<string, string>`, `mimeForFilename(name: string): string | null`, `extensionForFilename(name: string): string | null`.

- [ ] **Step 1: Install Vitest and add the script**

Run: `npm install --save-dev vitest`

In `package.json` `"scripts"`, add after `"lint": "eslint",`:

```json
    "test": "vitest run",
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"
import { fileURLToPath } from "url"

// Pure logic only — nothing under test touches the database or Next.js. The
// alias mirrors tsconfig's "@/*" so modules import exactly as they do in the app.
const root = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: root }] },
  test: { include: ["lib/**/*.test.ts"], environment: "node" },
})
```

- [ ] **Step 3: Write the failing tests**

`lib/upload-path.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import path from "path"
import { resolveUploadPath, uploadRoot } from "./upload-path"

describe("resolveUploadPath", () => {
  beforeEach(() => {
    process.env.UPLOAD_DIR = path.resolve("test-uploads")
  })

  it("resolves a record directory inside the root", () => {
    expect(resolveUploadPath("service", "clx123")).toBe(path.join(uploadRoot(), "service", "clx123"))
  })

  it("resolves a file inside a record directory", () => {
    expect(resolveUploadPath("service", "clx123", "a.pdf")).toBe(path.join(uploadRoot(), "service", "clx123", "a.pdf"))
  })

  it("rejects parent traversal out of the root", () => {
    expect(() => resolveUploadPath("service", "../..")).toThrow()
  })

  it("rejects a path that resolves to the root itself", () => {
    expect(() => resolveUploadPath("service", "..")).toThrow()
  })

  it("rejects an empty segment", () => {
    expect(() => resolveUploadPath("service", "")).toThrow()
  })

  it("rejects an absolute segment", () => {
    expect(() => resolveUploadPath(path.resolve("/etc"))).toThrow()
  })

  it("rejects a sibling directory that shares the root's name as a prefix", () => {
    expect(() => resolveUploadPath("..", "test-uploads-evil", "x")).toThrow()
  })
})
```

`lib/upload-types.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { extensionForFilename, mimeForFilename } from "./upload-types"

describe("upload types", () => {
  it("maps allowed extensions case-insensitively", () => {
    expect(mimeForFilename("receipt.PDF")).toBe("application/pdf")
    expect(mimeForFilename("card.jpeg")).toBe("image/jpeg")
    expect(extensionForFilename("Scan.HEIC")).toBe(".heic")
  })

  it("rejects anything not on the list", () => {
    expect(mimeForFilename("page.html")).toBeNull()
    expect(mimeForFilename("receipt.pdf.exe")).toBeNull()
    expect(extensionForFilename("noextension")).toBeNull()
    expect(extensionForFilename(".")).toBeNull()
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./upload-path"` and `"./upload-types"`.

- [ ] **Step 5: Implement `lib/upload-path.ts`**

```ts
import path from "path"

// Every filesystem path built from a record id goes through here. Ids arrive
// from the client, so a path is only trusted once it is proven to sit strictly
// inside the upload root — see SEC-001 and SEC-004 in SECURITY-REVIEW.md.

export function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? "./uploads")
}

export function resolveUploadPath(...segments: string[]): string {
  if (segments.length === 0 || segments.some((s) => !s)) {
    throw new Error("Upload path segments must be non-empty")
  }
  const root = uploadRoot()
  const full = path.resolve(root, ...segments)
  // Equal to the root is rejected too: a recursive rm of the root is exactly
  // the failure this exists to prevent.
  if (!full.startsWith(root + path.sep)) {
    throw new Error("Refusing a path outside the upload directory")
  }
  return full
}
```

- [ ] **Step 6: Implement `lib/upload-types.ts`**

```ts
// The only file types an upload may be stored as. The stored extension and the
// served MIME type both come from this table, never from what the client sent,
// so a file named "x.html" cannot land on disk as HTML.
export const UPLOAD_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
}

export function extensionForFilename(name: string): string | null {
  const dot = name.lastIndexOf(".")
  if (dot < 0) return null
  const ext = name.slice(dot).toLowerCase()
  return ext in UPLOAD_TYPES ? ext : null
}

export function mimeForFilename(name: string): string | null {
  const ext = extensionForFilename(name)
  return ext ? UPLOAD_TYPES[ext] : null
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 9 tests.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/upload-path.ts lib/upload-path.test.ts lib/upload-types.ts lib/upload-types.test.ts
git commit -m "test: add vitest and upload path/type guards"
```

---

### Task 2: Route every upload path through the guard

**Files:**
- Create: `lib/attachment-location.ts`, `lib/attachment-location.test.ts`
- Modify: `app/api/uploads/route.ts`, `app/api/files/[...path]/route.ts`, `app/api/assets/[type]/[id]/image/route.ts`, `app/api/assets/[type]/[id]/download/route.ts`, `lib/actions/attachments.ts`, `lib/actions/service-records.ts`, `lib/actions/warranties.ts`, `lib/actions/equipment.ts`, `lib/actions/properties.ts`, `lib/actions/vehicles.ts`, `components/attachments/attachment-list.tsx`, `components/service-records/service-record-form-dialog.tsx`, `components/warranties/warranty-form-dialog.tsx`

**Interfaces:**
- Consumes: `resolveUploadPath`, `uploadRoot`, `UPLOAD_TYPES`, `extensionForFilename`, `mimeForFilename` (Task 1).
- Produces: `attachmentDir(a: AttachmentLocation): [string, string] | null`; `deleteAttachment(id: string)` — **signature changes to one argument**; the path is derived from the attachment row, not the caller.

- [ ] **Step 1: Write the failing test** — `lib/attachment-location.test.ts`

```ts
import { describe, expect, it } from "vitest"
import { attachmentDir } from "./attachment-location"

const base = { serviceRecordId: null, warrantyId: null, maintenanceScheduleId: null }

describe("attachmentDir", () => {
  it("uses the foreign key that matches the record type", () => {
    expect(attachmentDir({ ...base, recordType: "SERVICE", serviceRecordId: "s1" })).toEqual(["service", "s1"])
    expect(attachmentDir({ ...base, recordType: "WARRANTY", warrantyId: "w1" })).toEqual(["warranty", "w1"])
    expect(attachmentDir({ ...base, recordType: "MAINTENANCE", maintenanceScheduleId: "m1" })).toEqual(["maintenance", "m1"])
  })

  it("returns null when the matching key is missing", () => {
    expect(attachmentDir({ ...base, recordType: "SERVICE", warrantyId: "w1" })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./attachment-location`.

- [ ] **Step 3: Implement `lib/attachment-location.ts`**

```ts
import type { AttachmentRecordType } from "@/app/generated/prisma/client"

export type AttachmentLocation = {
  recordType: AttachmentRecordType
  serviceRecordId: string | null
  warrantyId: string | null
  maintenanceScheduleId: string | null
}

/// Where an attachment's file lives, read from the attachment's own foreign
/// keys. Callers never supply the directory — that is what let a forged
/// recordId reach the filesystem before.
export function attachmentDir(a: AttachmentLocation): [string, string] | null {
  const id =
    a.recordType === "SERVICE" ? a.serviceRecordId
    : a.recordType === "WARRANTY" ? a.warrantyId
    : a.recordType === "MAINTENANCE" ? a.maintenanceScheduleId
    : null
  return id ? [a.recordType.toLowerCase(), id] : null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Replace `app/api/uploads/route.ts` entirely**

```ts
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { resolveUploadPath } from "@/lib/upload-path"
import { extensionForFilename, UPLOAD_TYPES } from "@/lib/upload-types"

const RECORD_TYPES = ["SERVICE", "WARRANTY", "MAINTENANCE"] as const
type RecordType = (typeof RECORD_TYPES)[number]

function isRecordType(v: string | null): v is RecordType {
  return v !== null && (RECORD_TYPES as readonly string[]).includes(v)
}

// The record must exist before anything touches the disk: the id becomes a
// directory name, and a made-up id must not be able to create one.
async function recordExists(type: RecordType, id: string): Promise<boolean> {
  const where = { where: { id }, select: { id: true } } as const
  if (type === "SERVICE") return !!(await prisma.serviceRecord.findUnique(where))
  if (type === "WARRANTY") return !!(await prisma.warranty.findUnique(where))
  return !!(await prisma.maintenanceSchedule.findUnique(where))
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const maxBytes = parseInt(process.env.MAX_UPLOAD_BYTES ?? "26214400")
  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const recordId = formData.get("recordId") as string | null
  const recordType = formData.get("recordType") as string | null

  if (!file || !recordId || !isRecordType(recordType)) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 })
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File exceeds maximum size of ${Math.round(maxBytes / 1024 / 1024)} MB.` }, { status: 400 })
  }
  const ext = extensionForFilename(file.name)
  if (!ext) {
    return NextResponse.json({ error: "File type not allowed. Use PDF, JPG, PNG, WEBP or HEIC." }, { status: 400 })
  }
  if (!(await recordExists(recordType, recordId))) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 })
  }

  const dirPath = resolveUploadPath(recordType.toLowerCase(), recordId)
  const filename = `${randomUUID()}${ext}`
  await mkdir(dirPath, { recursive: true })
  await writeFile(path.join(dirPath, filename), Buffer.from(await file.arrayBuffer()))

  const attachment = await prisma.attachment.create({
    data: {
      recordType,
      filename,
      originalName: file.name,
      mimeType: UPLOAD_TYPES[ext],
      sizeBytes: file.size,
      uploadedById: session.user.id,
      serviceRecordId: recordType === "SERVICE" ? recordId : null,
      warrantyId: recordType === "WARRANTY" ? recordId : null,
      maintenanceScheduleId: recordType === "MAINTENANCE" ? recordId : null,
    },
  })

  return NextResponse.json({ attachment })
}
```

(`path.join(dirPath, filename)` is safe: `dirPath` is already proven inside the root and `filename` is a server-generated UUID.)

- [ ] **Step 6: Harden `app/api/files/[...path]/route.ts`**

Replace the local `MIME` constant and its use with the shared table, and add headers. Final file:

```ts
import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { resolveUploadPath } from "@/lib/upload-path"
import { UPLOAD_TYPES } from "@/lib/upload-types"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { path: segments } = await params
  let filePath: string
  try {
    filePath = resolveUploadPath(...segments)
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const mime = UPLOAD_TYPES[path.extname(filePath).toLowerCase()]
  const buffer = await readFile(filePath)

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mime ?? "application/octet-stream",
      // Anything not on the allow-list is handed over as a download, never rendered.
      "Content-Disposition": mime ? "inline" : "attachment",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  })
}
```

- [ ] **Step 7: Harden `app/api/assets/[type]/[id]/image/route.ts`**

Imports — add:
```ts
import { resolveUploadPath } from "@/lib/upload-path"
import { extensionForFilename, mimeForFilename } from "@/lib/upload-types"
```
Delete the `ALLOWED_MIME` constant. In `POST`, replace the MIME check:
```ts
  const ext = extensionForFilename(file.name)
  if (!ext || !mimeForFilename(file.name)?.startsWith("image/")) {
    return NextResponse.json({ error: "File type not allowed. Use JPG, PNG, WEBP or HEIC." }, { status: 400 })
  }
```
Replace from `const uploadDir = ...` through the old-image `rm` with:
```ts
  const dirPath = resolveUploadPath(asset.subdir, id)
  await mkdir(dirPath, { recursive: true })

  const filename = `${randomUUID()}${ext}`
  await writeFile(path.join(dirPath, filename), Buffer.from(await file.arrayBuffer()))

  if (asset.record.imageFilename) {
    await rm(resolveUploadPath(asset.subdir, id, asset.record.imageFilename), { force: true })
  }
```
In `DELETE`, replace the two lines inside `if (asset.record.imageFilename)` with:
```ts
    await rm(resolveUploadPath(asset.subdir, id, asset.record.imageFilename), { force: true })
```

- [ ] **Step 8: Harden the download route** — `app/api/assets/[type]/[id]/download/route.ts`

Add `import { resolveUploadPath } from "@/lib/upload-path"`. Delete `const uploadDir = ...`. Replace the two `const filePath = path.join(uploadDir, ...)` lines with:
```ts
    const filePath = resolveUploadPath("service", a.serviceRecordId!, a.filename)
```
and
```ts
    const filePath = resolveUploadPath("warranty", a.warrantyId!, a.filename)
```
Remove the now-unused `path` import if lint flags it.

- [ ] **Step 9: Rewrite `lib/actions/attachments.ts`**

```ts
"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { rm } from "fs/promises"
import { attachmentDir } from "@/lib/attachment-location"
import { resolveUploadPath } from "@/lib/upload-path"

export async function deleteAttachment(id: string) {
  const session = await auth()
  if (!session) redirect("/login")

  const attachment = await prisma.attachment.findUnique({ where: { id } })
  if (!attachment) return { error: "Not found" }

  await prisma.attachment.delete({ where: { id } })

  const dir = attachmentDir(attachment)
  if (dir) await rm(resolveUploadPath(...dir, attachment.filename), { force: true })

  revalidatePath("/records")
  revalidatePath("/warranties")
  return { success: true }
}
```

Update the three callers:
- `components/attachments/attachment-list.tsx`: `await deleteAttachment(id, recordId, recordType)` → `await deleteAttachment(id)`
- `components/service-records/service-record-form-dialog.tsx`: `await deleteAttachment(attachment.id, record.id, "SERVICE")` → `await deleteAttachment(attachment.id)`
- `components/warranties/warranty-form-dialog.tsx`: `await deleteAttachment(attachment.id, warranty.id, "WARRANTY")` → `await deleteAttachment(attachment.id)`

- [ ] **Step 10: Fix delete ordering in `lib/actions/service-records.ts` (SEC-001)**

Replace the body of `deleteServiceRecord` after the session check with:
```ts
  // Look the record up first: the id arrives from the client and must be proven
  // real before it is used to build a directory path.
  const record = await prisma.serviceRecord.findUnique({ where: { id }, select: { id: true } })
  if (!record) return { error: "Not found" }

  await prisma.serviceRecord.delete({ where: { id: record.id } })
  await rm(resolveUploadPath("service", record.id), { recursive: true, force: true })

  revalidatePath(assetHref(assetType, assetId))
  revalidatePath("/records")
  return { success: true }
```
Imports: add `import { resolveUploadPath } from "@/lib/upload-path"`; remove `import path from "path"`.

- [ ] **Step 11: Same for `lib/actions/warranties.ts`**

Replace the body of `deleteWarranty` after the session check with:
```ts
  const warranty = await prisma.warranty.findUnique({ where: { id }, select: { id: true } })
  if (!warranty) return { error: "Not found" }

  await prisma.warranty.delete({ where: { id: warranty.id } })
  await rm(resolveUploadPath("warranty", warranty.id), { recursive: true, force: true })

  revalidatePath(assetHref(assetType, assetId))
  revalidatePath("/warranties")
  return { success: true }
```
Imports: add `resolveUploadPath`; remove `path`.

- [ ] **Step 12: Asset deletes** — `lib/actions/equipment.ts`, `properties.ts`, `vehicles.ts`

In each, replace
```ts
  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads"
  await rm(path.join(uploadDir, "<segment>", id), { recursive: true, force: true })
```
with (keeping each file's own segment: `"equipment"`, `"properties"`, `"vehicles"`):
```ts
  await rm(resolveUploadPath("<segment>", id), { recursive: true, force: true })
```
These already run after the Prisma delete, which throws on an unknown id. Add the `resolveUploadPath` import, remove `path`.

- [ ] **Step 13: Confirm no raw joins remain**

Run: `grep -rn "path.join(uploadDir\|UPLOAD_DIR" lib app --include=*.ts --include=*.tsx | grep -v generated`
Expected: only `lib/upload-path.ts`.

- [ ] **Step 14: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass.

Then `npm run dev`, sign in, and:
1. Open any service record → attach a PDF → it lists and opens in a new tab.
2. Attach a `.txt` file → toast "File type not allowed…".
3. Delete that attachment → gone from list and from `uploads/service/<id>/`.
4. In the browser devtools console on any app page run:
   ```js
   const f = new FormData(); f.append("file", new File(["x"], "a.pdf")); f.append("recordId", "nope"); f.append("recordType", "SERVICE");
   (await fetch("/api/uploads", { method: "POST", body: f })).status
   ```
   Expected `404`, and no `uploads/service/nope` directory.
5. Visit `/api/files/..%2F..%2Fpackage.json` → 403 or 404, never file contents.

- [ ] **Step 15: Commit**

```bash
git add -A lib app components
git commit -m "fix: guard every upload path and look records up before touching disk"
```

---

## Phase 1 — Schema

### Task 3: People & health schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_people_health/migration.sql` (generated)

**Interfaces:**
- Produces Prisma models `Person`, `Provider`, `HealthCondition`, `Medication`, `Allergy`, `Immunization`, `InsurancePolicy`; enums `Relationship`, `ConditionStatus`, `AllergySeverity`, `InsuranceKind`; `AssetType.PERSON`; new `ServiceCategory` values; `AttachmentRecordType.CONDITION|INSURANCE`; `NotificationType.MEDICATION_REFILL|IMMUNIZATION_DUE|INSURANCE_EXPIRING`; `ServiceRecord.providerId/conditionId`; `Attachment.healthConditionId/insurancePolicyId`. Prisma client accessors: `prisma.person`, `prisma.provider`, `prisma.healthCondition`, `prisma.medication`, `prisma.allergy`, `prisma.immunization`, `prisma.insurancePolicy`.

- [ ] **Step 1: Back up the dev database**

Run: `cp prisma/dev.db prisma/dev.db.backup-before-people`
(Do not `git add` this file.)

- [ ] **Step 2: Edit enums in `prisma/schema.prisma`**

```prisma
enum AssetType {
  PROPERTY
  VEHICLE
  EQUIPMENT
  PERSON
}
```

```prisma
/// What kind of spending a service record represents, as distinct from what it was
/// spent on. Nullable on the record: anything logged before categories existed is
/// genuinely uncategorized, and the reports say so rather than guessing.
/// The medical values are offered only on people's records — see lib/costs.ts.
enum ServiceCategory {
  ROUTINE
  REPAIR
  UPGRADE
  INSPECTION
  PARTS
  OTHER
  OFFICE_VISIT
  PRESCRIPTION
  LAB
  DENTAL
  VISION
  PROCEDURE
  THERAPY
}
```

```prisma
enum AttachmentRecordType {
  SERVICE
  WARRANTY
  MAINTENANCE
  CONDITION
  INSURANCE
}

enum NotificationType {
  MAINTENANCE_DUE
  WARRANTY_EXPIRING
  CUSTOM
  MEDICATION_REFILL
  IMMUNIZATION_DUE
  INSURANCE_EXPIRING
}
```

Add after `enum EquipmentCategory { ... }`:

```prisma
enum Relationship {
  SELF
  SPOUSE
  CHILD
  PARENT
  OTHER
}

enum ConditionStatus {
  ACTIVE
  MANAGED
  RESOLVED
}

enum AllergySeverity {
  MILD
  MODERATE
  SEVERE
}

enum InsuranceKind {
  MEDICAL
  DENTAL
  VISION
  OTHER
}
```

- [ ] **Step 3: Add the models** — after `model Equipment { ... }`:

```prisma
// ─── People & health ──────────────────────────────────────────────────────────

model Person {
  id            String       @id @default(cuid())
  name          String
  relationship  Relationship @default(OTHER)
  dateOfBirth   DateTime?
  sex           String?
  bloodType     String?
  notes         String?
  imageFilename String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  primaryProviderId String?
  primaryProvider   Provider? @relation("PrimaryProvider", fields: [primaryProviderId], references: [id], onDelete: SetNull)

  conditions        HealthCondition[]
  medications       Medication[]
  allergies         Allergy[]
  immunizations     Immunization[]
  insurancePolicies InsurancePolicy[]
}

/// Shared household directory, not owned by one person.
model Provider {
  id        String   @id @default(cuid())
  name      String
  specialty String?
  practice  String?
  phone     String?
  email     String?
  address   String?
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  primaryFor     Person[]          @relation("PrimaryProvider")
  conditions     HealthCondition[]
  prescriptions  Medication[]
  serviceRecords ServiceRecord[]
}

model HealthCondition {
  id            String          @id @default(cuid())
  name          String
  status        ConditionStatus @default(ACTIVE)
  diagnosedDate DateTime?
  resolvedDate  DateTime?
  notes         String?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  personId   String
  person     Person    @relation(fields: [personId], references: [id], onDelete: Cascade)
  providerId String?
  provider   Provider? @relation(fields: [providerId], references: [id], onDelete: SetNull)

  medications    Medication[]
  serviceRecords ServiceRecord[]
  attachments    Attachment[]
}

model Medication {
  id                 String    @id @default(cuid())
  name               String
  dosage             String?
  frequency          String?
  pharmacy           String?
  startDate          DateTime?
  endDate            DateTime?
  refillIntervalDays Int?
  nextRefillDate     DateTime?
  notes              String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  personId     String
  person       Person           @relation(fields: [personId], references: [id], onDelete: Cascade)
  prescriberId String?
  prescriber   Provider?        @relation(fields: [prescriberId], references: [id], onDelete: SetNull)
  conditionId  String?
  condition    HealthCondition? @relation(fields: [conditionId], references: [id], onDelete: SetNull)
}

model Allergy {
  id        String          @id @default(cuid())
  substance String
  reaction  String?
  severity  AllergySeverity @default(MODERATE)
  notes     String?
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  personId String
  person   Person @relation(fields: [personId], references: [id], onDelete: Cascade)
}

model Immunization {
  id          String    @id @default(cuid())
  vaccine     String
  dateGiven   DateTime
  dose        String?
  givenBy     String?
  nextDueDate DateTime?
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  personId String
  person   Person @relation(fields: [personId], references: [id], onDelete: Cascade)
}

model InsurancePolicy {
  id             String        @id @default(cuid())
  carrier        String
  planName       String?
  kind           InsuranceKind @default(MEDICAL)
  policyNumber   String?
  groupNumber    String?
  memberId       String?
  phone          String?
  startDate      DateTime?
  endDate        DateTime?
  deductible     Float?
  outOfPocketMax Float?
  notes          String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  members     Person[]
  attachments Attachment[]
}
```

- [ ] **Step 4: Link visits and attachments**

In `model ServiceRecord`, after `mileageAtService Int?`, add:
```prisma
  /// Person records only: who was seen and what for. vendor stays free text for
  /// facilities outside the provider directory.
  providerId       String?
  provider         Provider?        @relation(fields: [providerId], references: [id], onDelete: SetNull)
  conditionId      String?
  condition        HealthCondition? @relation(fields: [conditionId], references: [id], onDelete: SetNull)
```

In `model Attachment`, after the `maintenanceSchedule` relation, add:
```prisma

  healthConditionId     String?
  healthCondition       HealthCondition?     @relation(fields: [healthConditionId], references: [id], onDelete: Cascade)

  insurancePolicyId     String?
  insurancePolicy       InsurancePolicy?     @relation(fields: [insurancePolicyId], references: [id], onDelete: Cascade)
```

- [ ] **Step 5: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_people_health`
Expected: "Your database is now in sync with your schema", a new folder under `prisma/migrations/`, and the client regenerated. Open the generated `migration.sql` and confirm it only `CREATE`s the new tables/join table `_InsurancePolicyToPerson` and rebuilds `ServiceRecord`/`Attachment` via `INSERT INTO "new_..." SELECT ...` — no `DROP` of data without a copy.

- [ ] **Step 6: Verify existing data survived**

Run: `npx prisma studio` (or `sqlite3 prisma/dev.db "select count(*) from ServiceRecord; select count(*) from Attachment;"`) and compare with the backup:
`sqlite3 prisma/dev.db.backup-before-people "select count(*) from ServiceRecord; select count(*) from Attachment;"`
Expected: equal counts.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only of the form "Property 'PERSON' is missing in type ... Record<AssetType, ...>" and missing `CategoryKey` keys (fixed in Task 5). Note the list; nothing else.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add people, providers, health records and insurance"
```

(The build is red until Task 5 — Tasks 3–5 are one reviewable unit.)

---

## Phase 2 — Shared plumbing

### Task 4: Pure health logic and validation schemas

**Files:**
- Create: `lib/health.ts`, `lib/health.test.ts`, `lib/health-schemas.ts`, `lib/health-schemas.test.ts`, `lib/form-types.ts`

**Interfaces:**
- Consumes: enum const objects from `@/app/generated/prisma/enums` (Task 3).
- Produces:
  - `lib/form-types.ts`: `FormValues = Record<string, string>`, `FieldErrors`, `ActionResult = { success?: boolean; id?: string; error?: string | FieldErrors }`, `FieldOption`, `FieldConfig`.
  - `lib/health.ts`: `RELATIONSHIPS`, `CONDITION_STATUSES`, `ALLERGY_SEVERITIES`, `INSURANCE_KINDS` (each `FieldOption[]`), `labelFor(options, value)`, `toDateInput(d)`, `formatDay(d)` (UTC day, `"—"` for null), `ageFrom(dob, now)`, `daysUntil(date, now)`, `isMedicationActive(m, now)`, `refillDue(m, now, windowDays?)`, `immunizationDue(i, now, windowDays?)`, `insuranceExpiring(p, now, windowDays?)`, `nextRefillFrom(from, intervalDays)`, `HEALTH_WINDOWS`.
  - `lib/health-schemas.ts`: `personSchema`, `providerSchema`, `conditionSchema`, `medicationSchema`, `allergySchema`, `immunizationSchema`, `insuranceSchema` — each `safeParse(FormValues)` yields Prisma-ready data (`insuranceSchema` also yields `memberIds: string[]`).

- [ ] **Step 1: Create `lib/form-types.ts`** (types only, nothing to test)

```ts
// Shapes shared by the generic entity dialog and the server actions it calls.
// Values travel as the strings the inputs hold; the zod schemas in
// lib/health-schemas.ts own every conversion to dates, numbers and nulls.

export type FormValues = Record<string, string>

export type FieldErrors = Record<string, string[] | undefined>

export type ActionResult = { success?: boolean; id?: string; error?: string | FieldErrors }

export type FieldOption = { value: string; label: string }

export type FieldConfig = {
  name: string
  label: string
  kind: "text" | "textarea" | "date" | "number" | "email" | "tel" | "select" | "checkboxes"
  required?: boolean
  placeholder?: string
  /// select and checkboxes only. A non-required select gets a "None" choice.
  options?: FieldOption[]
  /// Spans both columns of the dialog grid.
  wide?: boolean
}
```

- [ ] **Step 2: Write the failing tests** — `lib/health.test.ts`

```ts
import { describe, expect, it } from "vitest"
import {
  ageFrom, daysUntil, formatDay, immunizationDue, insuranceExpiring, isMedicationActive,
  labelFor, nextRefillFrom, refillDue, RELATIONSHIPS, toDateInput,
} from "./health"

const d = (s: string) => new Date(s)

describe("ageFrom", () => {
  it("counts completed years", () => {
    expect(ageFrom(d("1980-06-15"), d("2026-06-14T12:00:00Z"))).toBe(45)
    expect(ageFrom(d("1980-06-15"), d("2026-06-15T12:00:00Z"))).toBe(46)
  })
  it("handles a leap-day birthday in a non-leap year", () => {
    expect(ageFrom(d("2000-02-29"), d("2026-02-28T12:00:00Z"))).toBe(25)
    expect(ageFrom(d("2000-02-29"), d("2026-03-01T12:00:00Z"))).toBe(26)
  })
})

describe("daysUntil", () => {
  it("rounds partial days up and never returns -0", () => {
    const now = d("2026-09-25T12:00:00Z")
    expect(daysUntil(d("2026-09-26T00:00:00Z"), now)).toBe(1)
    expect(Object.is(daysUntil(d("2026-09-25T06:00:00Z"), now), 0)).toBe(true)
    expect(daysUntil(d("2026-09-20T00:00:00Z"), now)).toBe(-5)
  })
})

describe("isMedicationActive", () => {
  const now = d("2026-09-25T15:00:00Z")
  it("is active with no end date", () => {
    expect(isMedicationActive({ endDate: null }, now)).toBe(true)
  })
  it("stays active through the whole of its end date", () => {
    expect(isMedicationActive({ endDate: d("2026-09-25") }, now)).toBe(true)
  })
  it("is inactive after its end date", () => {
    expect(isMedicationActive({ endDate: d("2026-09-24") }, now)).toBe(false)
  })
})

describe("refillDue", () => {
  const now = d("2026-09-25T12:00:00Z")
  it("is due within the window, including overdue", () => {
    expect(refillDue({ endDate: null, nextRefillDate: d("2026-09-30") }, now)).toBe(true)
    expect(refillDue({ endDate: null, nextRefillDate: d("2026-09-01") }, now)).toBe(true)
  })
  it("is not due outside the window or without a date", () => {
    expect(refillDue({ endDate: null, nextRefillDate: d("2026-10-30") }, now)).toBe(false)
    expect(refillDue({ endDate: null, nextRefillDate: null }, now)).toBe(false)
  })
  it("is never due once the medication has ended", () => {
    expect(refillDue({ endDate: d("2026-09-01"), nextRefillDate: d("2026-09-01") }, now)).toBe(false)
  })
})

describe("immunizationDue / insuranceExpiring", () => {
  const now = d("2026-09-25T12:00:00Z")
  it("flags immunizations due within 30 days or overdue", () => {
    expect(immunizationDue({ nextDueDate: d("2026-10-20") }, now)).toBe(true)
    expect(immunizationDue({ nextDueDate: d("2025-01-01") }, now)).toBe(true)
    expect(immunizationDue({ nextDueDate: d("2027-01-01") }, now)).toBe(false)
    expect(immunizationDue({ nextDueDate: null }, now)).toBe(false)
  })
  it("flags policies ending within 60 days but not already ended", () => {
    expect(insuranceExpiring({ endDate: d("2026-11-01") }, now)).toBe(true)
    expect(insuranceExpiring({ endDate: d("2026-09-01") }, now)).toBe(false)
    expect(insuranceExpiring({ endDate: null }, now)).toBe(false)
  })
})

describe("helpers", () => {
  it("adds an interval for the next refill", () => {
    expect(nextRefillFrom(d("2026-09-25T00:00:00Z"), 30).toISOString()).toBe("2026-10-25T00:00:00.000Z")
  })
  it("formats dates for <input type=date>", () => {
    expect(toDateInput(d("2026-09-25T00:00:00Z"))).toBe("2026-09-25")
    expect(toDateInput(null)).toBe("")
  })
  it("displays the stored UTC day, whatever the local zone", () => {
    const shown = formatDay(d("2026-01-05"))
    expect(shown).toContain("2026")
    expect(shown).toContain("5")
    expect(shown).not.toContain("4,")
    expect(formatDay(null)).toBe("—")
  })
  it("labels enum values and falls back to the raw value", () => {
    expect(labelFor(RELATIONSHIPS, "SPOUSE")).toBe("Spouse")
    expect(labelFor(RELATIONSHIPS, "NOPE")).toBe("NOPE")
  })
})
```

- [ ] **Step 3: Write the failing tests** — `lib/health-schemas.test.ts`

```ts
import { describe, expect, it } from "vitest"
import {
  allergySchema, conditionSchema, immunizationSchema, insuranceSchema,
  medicationSchema, personSchema, providerSchema,
} from "./health-schemas"

describe("personSchema", () => {
  it("turns blanks into nulls and dates into Dates", () => {
    const r = personSchema.parse({ name: " Sam ", relationship: "CHILD", dateOfBirth: "2015-04-02", sex: "", bloodType: "", primaryProviderId: "", notes: "" })
    expect(r).toEqual({ name: "Sam", relationship: "CHILD", dateOfBirth: new Date("2015-04-02"), sex: null, bloodType: null, primaryProviderId: null, notes: null })
  })
  it("requires a name", () => {
    const r = personSchema.safeParse({ name: "  ", relationship: "SELF" })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.flatten().fieldErrors.name).toBeDefined()
  })
  it("rejects a future date of birth", () => {
    const r = personSchema.safeParse({ name: "A", relationship: "SELF", dateOfBirth: "2999-01-01" })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.flatten().fieldErrors.dateOfBirth).toBeDefined()
  })
  it("rejects an unknown relationship", () => {
    expect(personSchema.safeParse({ name: "A", relationship: "COUSIN" }).success).toBe(false)
  })
})

describe("date-order rules", () => {
  it("medication cannot end before it starts", () => {
    const r = medicationSchema.safeParse({ name: "X", startDate: "2026-05-01", endDate: "2026-04-01" })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.flatten().fieldErrors.endDate).toBeDefined()
  })
  it("immunization cannot be next due before it was given", () => {
    const r = immunizationSchema.safeParse({ vaccine: "Tdap", dateGiven: "2026-05-01", nextDueDate: "2026-01-01" })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.flatten().fieldErrors.nextDueDate).toBeDefined()
  })
  it("condition cannot resolve before diagnosis", () => {
    const r = conditionSchema.safeParse({ name: "X", status: "RESOLVED", diagnosedDate: "2026-05-01", resolvedDate: "2026-01-01" })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.flatten().fieldErrors.resolvedDate).toBeDefined()
  })
  it("policy cannot end before it starts", () => {
    const r = insuranceSchema.safeParse({ carrier: "Aetna", kind: "MEDICAL", startDate: "2026-05-01", endDate: "2026-01-01" })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.flatten().fieldErrors.endDate).toBeDefined()
  })
})

describe("numbers, emails and lists", () => {
  it("parses refill interval as a whole number and rejects decimals", () => {
    expect(medicationSchema.parse({ name: "X", refillIntervalDays: "30" }).refillIntervalDays).toBe(30)
    expect(medicationSchema.safeParse({ name: "X", refillIntervalDays: "2.5" }).success).toBe(false)
  })
  it("rejects a negative deductible", () => {
    expect(insuranceSchema.safeParse({ carrier: "A", kind: "MEDICAL", deductible: "-1" }).success).toBe(false)
  })
  it("splits member ids", () => {
    expect(insuranceSchema.parse({ carrier: "A", kind: "DENTAL", memberIds: "p1,p2" }).memberIds).toEqual(["p1", "p2"])
    expect(insuranceSchema.parse({ carrier: "A", kind: "DENTAL" }).memberIds).toEqual([])
  })
  it("validates provider email only when present", () => {
    expect(providerSchema.safeParse({ name: "Dr A", email: "" }).success).toBe(true)
    expect(providerSchema.safeParse({ name: "Dr A", email: "nope" }).success).toBe(false)
  })
  it("requires allergy severity to be known", () => {
    expect(allergySchema.safeParse({ substance: "Penicillin", severity: "SEVERE" }).success).toBe(true)
    expect(allergySchema.safeParse({ substance: "Penicillin", severity: "LETHAL" }).success).toBe(false)
  })
  it("rejects an unparseable date", () => {
    expect(immunizationSchema.safeParse({ vaccine: "Flu", dateGiven: "not-a-date" }).success).toBe(false)
  })
})
```

- [ ] **Step 4: Run to verify both fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./health`, `./health-schemas`.

- [ ] **Step 5: Implement `lib/health.ts`**

```ts
import type { FieldOption } from "@/lib/form-types"

// Pure, client-safe health helpers. Dates are stored as UTC midnight (that is
// what `new Date("YYYY-MM-DD")` produces), so calendar maths here reads UTC
// fields to stay on the day the user typed.

const DAY = 86_400_000

export const HEALTH_WINDOWS = { refillDays: 7, immunizationDays: 30, insuranceDays: 60 } as const

export const RELATIONSHIPS: FieldOption[] = [
  { value: "SELF", label: "Self" },
  { value: "SPOUSE", label: "Spouse" },
  { value: "CHILD", label: "Child" },
  { value: "PARENT", label: "Parent" },
  { value: "OTHER", label: "Other" },
]

export const CONDITION_STATUSES: FieldOption[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "MANAGED", label: "Managed" },
  { value: "RESOLVED", label: "Resolved" },
]

export const ALLERGY_SEVERITIES: FieldOption[] = [
  { value: "MILD", label: "Mild" },
  { value: "MODERATE", label: "Moderate" },
  { value: "SEVERE", label: "Severe" },
]

export const INSURANCE_KINDS: FieldOption[] = [
  { value: "MEDICAL", label: "Medical" },
  { value: "DENTAL", label: "Dental" },
  { value: "VISION", label: "Vision" },
  { value: "OTHER", label: "Other" },
]

export function labelFor(options: FieldOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value
}

export function toDateInput(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString().split("T")[0] : ""
}

/// Display form of a stored day. Formatted in UTC because that is the day that
/// was typed — local time would show a US user their birthday a day early.
export function formatDay(d: Date | null | undefined): string {
  return d
    ? new Date(d).toLocaleDateString(undefined, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" })
    : "—"
}

export function ageFrom(dob: Date, now: Date): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear()
  const m = now.getUTCMonth() - dob.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--
  return age
}

/// Whole days from now until `date`, rounded up. `|| 0` folds Math.ceil's -0
/// (something due a few hours ago) into 0 so it reads "today", not "overdue".
export function daysUntil(date: Date, now: Date): number {
  return Math.ceil((new Date(date).getTime() - now.getTime()) / DAY) || 0
}

/// A medication is taken through the whole of its end date.
export function isMedicationActive(m: { endDate: Date | null }, now: Date): boolean {
  return !m.endDate || new Date(m.endDate).getTime() + DAY > now.getTime()
}

export function refillDue(
  m: { endDate: Date | null; nextRefillDate: Date | null },
  now: Date,
  windowDays: number = HEALTH_WINDOWS.refillDays
): boolean {
  return isMedicationActive(m, now) && !!m.nextRefillDate && daysUntil(m.nextRefillDate, now) <= windowDays
}

export function immunizationDue(
  i: { nextDueDate: Date | null },
  now: Date,
  windowDays: number = HEALTH_WINDOWS.immunizationDays
): boolean {
  return !!i.nextDueDate && daysUntil(i.nextDueDate, now) <= windowDays
}

export function insuranceExpiring(
  p: { endDate: Date | null },
  now: Date,
  windowDays: number = HEALTH_WINDOWS.insuranceDays
): boolean {
  if (!p.endDate) return false
  const d = daysUntil(p.endDate, now)
  return d >= 0 && d <= windowDays
}

export function nextRefillFrom(from: Date, intervalDays: number): Date {
  return new Date(from.getTime() + intervalDays * DAY)
}
```

- [ ] **Step 6: Implement `lib/health-schemas.ts`**

```ts
import { z } from "zod"
import {
  AllergySeverity, ConditionStatus, InsuranceKind, Relationship,
} from "@/app/generated/prisma/enums"

// Form values arrive as strings exactly as the inputs hold them. Each schema
// trims, turns blanks into null, parses dates and numbers, and enforces the
// date-order rules, so an action can hand `parsed.data` straight to Prisma.

const isDate = (v: string) => !Number.isNaN(Date.parse(v))

const requiredText = (message: string) => z.string().trim().min(1, message)
const optionalText = z.string().trim().optional().transform((v) => v || null)
const optionalId = z.string().optional().transform((v) => v || null)

const optionalDate = z
  .string()
  .optional()
  .refine((v) => !v || isDate(v), "Enter a valid date")
  .transform((v) => (v ? new Date(v) : null))

const requiredDate = (message: string) =>
  z.string().min(1, message).refine(isDate, "Enter a valid date").transform((v) => new Date(v))

const optionalWholeNumber = z
  .string()
  .optional()
  .refine((v) => !v || /^\d+$/.test(v.trim()), "Enter a whole number")
  .transform((v) => (v ? Number(v) : null))

const optionalMoney = z
  .string()
  .optional()
  .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0), "Enter 0 or more")
  .transform((v) => (v ? Number(v) : null))

/// Adds an error on `later` when both dates are set and `later` precedes `earlier`.
function notBefore(later: string, earlier: string, message: string) {
  return (v: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const a = v[earlier]
    const b = v[later]
    if (a instanceof Date && b instanceof Date && b < a) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [later], message })
    }
  }
}

export const personSchema = z.object({
  name: requiredText("Name is required"),
  relationship: z.nativeEnum(Relationship),
  dateOfBirth: optionalDate.refine((d) => !d || d.getTime() <= Date.now(), "Date of birth can't be in the future"),
  sex: optionalText,
  bloodType: optionalText,
  primaryProviderId: optionalId,
  notes: optionalText,
})

export const providerSchema = z.object({
  name: requiredText("Name is required"),
  specialty: optionalText,
  practice: optionalText,
  phone: optionalText,
  email: optionalText.refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email"),
  address: optionalText,
  notes: optionalText,
})

export const conditionSchema = z
  .object({
    name: requiredText("Condition is required"),
    status: z.nativeEnum(ConditionStatus),
    providerId: optionalId,
    diagnosedDate: optionalDate,
    resolvedDate: optionalDate,
    notes: optionalText,
  })
  .superRefine(notBefore("resolvedDate", "diagnosedDate", "Resolved date can't be before diagnosis"))

export const medicationSchema = z
  .object({
    name: requiredText("Medication is required"),
    dosage: optionalText,
    frequency: optionalText,
    prescriberId: optionalId,
    conditionId: optionalId,
    pharmacy: optionalText,
    startDate: optionalDate,
    endDate: optionalDate,
    refillIntervalDays: optionalWholeNumber,
    nextRefillDate: optionalDate,
    notes: optionalText,
  })
  .superRefine(notBefore("endDate", "startDate", "End date can't be before the start date"))

export const allergySchema = z.object({
  substance: requiredText("Substance is required"),
  severity: z.nativeEnum(AllergySeverity),
  reaction: optionalText,
  notes: optionalText,
})

export const immunizationSchema = z
  .object({
    vaccine: requiredText("Vaccine is required"),
    dateGiven: requiredDate("Date given is required"),
    dose: optionalText,
    givenBy: optionalText,
    nextDueDate: optionalDate,
    notes: optionalText,
  })
  .superRefine(notBefore("nextDueDate", "dateGiven", "Next due can't be before the date given"))

export const insuranceSchema = z
  .object({
    carrier: requiredText("Carrier is required"),
    planName: optionalText,
    kind: z.nativeEnum(InsuranceKind),
    policyNumber: optionalText,
    groupNumber: optionalText,
    memberId: optionalText,
    phone: optionalText,
    startDate: optionalDate,
    endDate: optionalDate,
    deductible: optionalMoney,
    outOfPocketMax: optionalMoney,
    notes: optionalText,
    memberIds: z.string().optional().transform((v) => (v ? v.split(",").filter(Boolean) : [])),
  })
  .superRefine(notBefore("endDate", "startDate", "End date can't be before the start date"))
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 8: Commit**

```bash
git add lib/form-types.ts lib/health.ts lib/health.test.ts lib/health-schemas.ts lib/health-schemas.test.ts
git commit -m "feat: add health date logic and validation schemas"
```

### Task 5: Teach the shared asset layer about PERSON

**Files:**
- Create: `lib/costs.test.ts`
- Modify: `lib/assets.ts`, `lib/assets-server.ts`, `lib/asset-view.ts`, `lib/costs.ts`, `app/globals.css`, `lib/report-server.ts`, `lib/attachment-location.ts`, `lib/attachment-location.test.ts`, `app/api/uploads/route.ts`, `app/api/assets/[type]/[id]/image/route.ts`, `components/attachments/attachment-list.tsx`, `app/(app)/costs/page.tsx`, `lib/actions/{service-records,warranties,maintenance}.ts`, `components/{service-records,warranties,maintenance}/*.tsx`

**Interfaces:**
- Consumes: Task 3 schema.
- Produces: `ASSET_TYPES` (tuple for `z.enum`), `assetSegment.PERSON = "people"`, `assetIcon.PERSON = HeartPulse`, `assetLabel.PERSON = "Person"`; `AssetViewKey` includes `"people"`; `lib/costs.ts`: `ASSET_CATEGORIES`, `MEDICAL_CATEGORIES`, `SERVICE_CATEGORIES` (all), `SERVICE_CATEGORY_VALUES` (tuple), `categoriesFor(assetType)`; `attachmentDir` handles `CONDITION` and `INSURANCE`; upload route accepts `CONDITION` and `INSURANCE`.

- [ ] **Step 1: Write the failing tests**

`lib/costs.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { CATEGORY_ORDER, categoriesFor, categoryColor, SERVICE_CATEGORY_VALUES } from "./costs"

describe("service categories", () => {
  it("offers medical categories only for people", () => {
    const person = categoriesFor("PERSON").map((c) => c.value)
    const house = categoriesFor("PROPERTY").map((c) => c.value)
    expect(person).toContain("OFFICE_VISIT")
    expect(person).toContain("OTHER")
    expect(person).not.toContain("REPAIR")
    expect(house).toContain("REPAIR")
    expect(house).not.toContain("OFFICE_VISIT")
  })

  it("keeps Other then Uncategorized at the end of the fixed order", () => {
    expect(CATEGORY_ORDER.slice(-2)).toEqual(["OTHER", "UNCATEGORIZED"])
  })

  it("gives every category a colour", () => {
    for (const value of SERVICE_CATEGORY_VALUES) expect(categoryColor(value)).toMatch(/^var\(--cost-/)
  })
})
```

Append to `lib/attachment-location.test.ts` (and add `healthConditionId: null, insurancePolicyId: null` to its `base` object):

```ts
  it("locates condition and insurance files", () => {
    expect(attachmentDir({ ...base, recordType: "CONDITION", healthConditionId: "c1" })).toEqual(["condition", "c1"])
    expect(attachmentDir({ ...base, recordType: "INSURANCE", insurancePolicyId: "i1" })).toEqual(["insurance", "i1"])
  })
```
(place it inside the `describe` block.)

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `categoriesFor` is not exported; `attachmentDir` returns null for CONDITION.

- [ ] **Step 3: `lib/costs.ts` categories**

Replace the `SERVICE_CATEGORIES` constant with:

```ts
/// Categories for houses, vehicles and equipment.
export const ASSET_CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: "ROUTINE", label: "Routine" },
  { value: "REPAIR", label: "Repair" },
  { value: "UPGRADE", label: "Upgrade" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "PARTS", label: "Parts" },
  { value: "OTHER", label: "Other" },
]

const MEDICAL_ONLY: { value: ServiceCategory; label: string }[] = [
  { value: "OFFICE_VISIT", label: "Office visit" },
  { value: "PRESCRIPTION", label: "Prescription" },
  { value: "LAB", label: "Lab / imaging" },
  { value: "DENTAL", label: "Dental" },
  { value: "VISION", label: "Vision" },
  { value: "PROCEDURE", label: "Procedure" },
  { value: "THERAPY", label: "Therapy" },
]

const OTHER_CATEGORY = { value: "OTHER" as ServiceCategory, label: "Other" }

/// Categories for people's visits and medical expenses.
export const MEDICAL_CATEGORIES = [...MEDICAL_ONLY, OTHER_CATEGORY]

/// Every category, in the fixed order the charts colour them. Other stays last
/// among the real categories whichever set it came from.
export const SERVICE_CATEGORIES = [
  ...ASSET_CATEGORIES.filter((c) => c.value !== "OTHER"),
  ...MEDICAL_ONLY,
  OTHER_CATEGORY,
]

export const SERVICE_CATEGORY_VALUES = [
  "ROUTINE", "REPAIR", "UPGRADE", "INSPECTION", "PARTS", "OTHER",
  "OFFICE_VISIT", "PRESCRIPTION", "LAB", "DENTAL", "VISION", "PROCEDURE", "THERAPY",
] as const satisfies readonly ServiceCategory[]

export function categoriesFor(assetType: AssetType) {
  return assetType === "PERSON" ? MEDICAL_CATEGORIES : ASSET_CATEGORIES
}
```

In `CATEGORY_COLORS`, add after `OTHER`:

```ts
  OFFICE_VISIT: "var(--cost-office-visit)",
  PRESCRIPTION: "var(--cost-prescription)",
  LAB: "var(--cost-lab)",
  DENTAL: "var(--cost-dental)",
  VISION: "var(--cost-vision)",
  PROCEDURE: "var(--cost-procedure)",
  THERAPY: "var(--cost-therapy)",
```

- [ ] **Step 4: Colours in `app/globals.css`**

After `--cost-other: #008300;` in `:root` (line ~95):
```css
  --cost-office-visit: #0f8fa8;
  --cost-prescription: #9c4fd6;
  --cost-lab: #a0522d;
  --cost-dental: #6f8f00;
  --cost-vision: #c43c8c;
  --cost-procedure: #c2362f;
  --cost-therapy: #5a6fa0;
```
After `--cost-other: #008300;` in `.dark` (line ~157):
```css
  --cost-office-visit: #22a6bf;
  --cost-prescription: #b06ee6;
  --cost-lab: #c0703f;
  --cost-dental: #8aad10;
  --cost-vision: #dc5aa6;
  --cost-procedure: #e0544c;
  --cost-therapy: #7a8fc4;
```
After `--cat-OTHER: #008300;` in `.report-doc`:
```css
  --cat-OFFICE_VISIT: #0f8fa8;
  --cat-PRESCRIPTION: #9c4fd6;
  --cat-LAB: #a0522d;
  --cat-DENTAL: #6f8f00;
  --cat-VISION: #c43c8c;
  --cat-PROCEDURE: #c2362f;
  --cat-THERAPY: #5a6fa0;
```

- [ ] **Step 5: `lib/attachment-location.ts`**

Replace the type and function with:

```ts
export type AttachmentLocation = {
  recordType: AttachmentRecordType
  serviceRecordId: string | null
  warrantyId: string | null
  maintenanceScheduleId: string | null
  healthConditionId: string | null
  insurancePolicyId: string | null
}

/// Where an attachment's file lives, read from the attachment's own foreign
/// keys. Callers never supply the directory — that is what let a forged
/// recordId reach the filesystem before.
export function attachmentDir(a: AttachmentLocation): [string, string] | null {
  const id =
    a.recordType === "SERVICE" ? a.serviceRecordId
    : a.recordType === "WARRANTY" ? a.warrantyId
    : a.recordType === "MAINTENANCE" ? a.maintenanceScheduleId
    : a.recordType === "CONDITION" ? a.healthConditionId
    : a.recordType === "INSURANCE" ? a.insurancePolicyId
    : null
  return id ? [a.recordType.toLowerCase(), id] : null
}
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: `lib/assets.ts`**

```ts
import { Building2, Car, HeartPulse, Refrigerator } from "lucide-react"
import type { AssetType } from "@/app/generated/prisma/client"

// Shared, client-safe helpers for the asset kinds. Anything needing the
// database lives in lib/assets-server.ts instead.

/// Tuple form of the enum, for z.enum() in forms and actions.
export const ASSET_TYPES = ["PROPERTY", "VEHICLE", "EQUIPMENT", "PERSON"] as const satisfies readonly AssetType[]

export const assetSegment: Record<AssetType, string> = {
  PROPERTY: "properties",
  VEHICLE: "vehicles",
  EQUIPMENT: "equipment",
  PERSON: "people",
}

export const assetIcon: Record<AssetType, React.ElementType> = {
  PROPERTY: Building2,
  VEHICLE: Car,
  EQUIPMENT: Refrigerator,
  PERSON: HeartPulse,
}

export const assetLabel: Record<AssetType, string> = {
  PROPERTY: "Property",
  VEHICLE: "Vehicle",
  EQUIPMENT: "Equipment",
  PERSON: "Person",
}

export function assetHref(assetType: AssetType, assetId: string) {
  return `/assets/${assetSegment[assetType]}/${assetId}`
}
```

- [ ] **Step 8: `lib/assets-server.ts`**

Add `prisma.person.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })` as a fourth entry of the `Promise.all` destructured as `people`; add `PERSON: Object.fromEntries(people.map((p) => [p.id, p.name])),` to `names`; change `options` to spread `...people` as well. Update the header comment's "records, warranties, maintenance, dashboard" list unchanged.

- [ ] **Step 9: `lib/asset-view.ts`**

```ts
export type AssetViewKey = "properties" | "vehicles" | "equipment" | "people"
```

- [ ] **Step 10: `lib/report-server.ts` (interim)**

In `parseAssetSegment` add `if (segment === "people") return "PERSON"` before `return null`. At the top of `loadAsset`, add:
```ts
  // People get their own branch in Task 16; until then the report 404s for them.
  if (assetType === "PERSON") return null
```

- [ ] **Step 11: Image route — people**

In `app/api/assets/[type]/[id]/image/route.ts`:
```ts
const VALID_TYPES = ["properties", "vehicles", "equipment", "people"] as const
```
In `findAsset`, before the equipment fallback line:
```ts
  if (type === "people") return { subdir: "people", record: await prisma.person.findUnique({ where: { id } }) } as const
```
In `setImage`, before the equipment fallback line:
```ts
  if (type === "people") return prisma.person.update({ where: { id }, data: { imageFilename: filename } })
```

- [ ] **Step 12: Upload route — condition and insurance**

In `app/api/uploads/route.ts`:
```ts
const RECORD_TYPES = ["SERVICE", "WARRANTY", "MAINTENANCE", "CONDITION", "INSURANCE"] as const
```
Replace `recordExists`'s last line with:
```ts
  if (type === "MAINTENANCE") return !!(await prisma.maintenanceSchedule.findUnique(where))
  if (type === "CONDITION") return !!(await prisma.healthCondition.findUnique(where))
  return !!(await prisma.insurancePolicy.findUnique(where))
```
Add to the `attachment.create` data:
```ts
      healthConditionId: recordType === "CONDITION" ? recordId : null,
      insurancePolicyId: recordType === "INSURANCE" ? recordId : null,
```

- [ ] **Step 13: `components/attachments/attachment-list.tsx`**

Change the prop type to the enum:
```ts
import type { Attachment, AttachmentRecordType } from "@/app/generated/prisma/client"

interface Props {
  recordId: string
  recordType: AttachmentRecordType
  attachments: Attachment[]
}
```

- [ ] **Step 14: Widen the hard-coded asset unions**

Run (Git Bash):
```bash
grep -rl '"PROPERTY" | "VEHICLE" | "EQUIPMENT"' components lib | xargs sed -i 's/"PROPERTY" | "VEHICLE" | "EQUIPMENT"/AssetType/g'
grep -rl 'z.enum(\["PROPERTY", "VEHICLE", "EQUIPMENT"\])' components lib | xargs sed -i 's/z.enum(\["PROPERTY", "VEHICLE", "EQUIPMENT"\])/z.enum(ASSET_TYPES)/g'
```
Then fix imports so each file compiles:
- `lib/actions/service-records.ts`, `lib/actions/warranties.ts`, `lib/actions/maintenance.ts`: change `import { assetHref } from "@/lib/assets"` to `import { ASSET_TYPES, assetHref } from "@/lib/assets"`.
- `components/service-records/service-record-form-dialog.tsx`: add `AssetType` to the `@/app/generated/prisma/client` type import; add `import { ASSET_TYPES } from "@/lib/assets"`.
- `components/warranties/warranty-form-dialog.tsx`, `components/maintenance/maintenance-form-dialog.tsx`: same two changes.
- `components/service-records/service-record-list.tsx`, `components/warranties/warranty-list.tsx`, `components/maintenance/maintenance-list.tsx`: add `AssetType` to the existing `@/app/generated/prisma/client` type import (add `import type { AssetType } from "@/app/generated/prisma/client"` if the file has none).

In `lib/actions/service-records.ts` replace
```ts
  category: z.enum(["ROUTINE", "REPAIR", "UPGRADE", "INSPECTION", "PARTS", "OTHER"]).optional().or(z.literal("")),
```
with
```ts
  category: z.enum(SERVICE_CATEGORY_VALUES).optional().or(z.literal("")),
```
and add `import { SERVICE_CATEGORY_VALUES } from "@/lib/costs"`.

- [ ] **Step 15: Costs page filter**

In `app/(app)/costs/page.tsx` add to `ASSET_TYPE_FILTERS`:
```ts
  { value: "PERSON", label: "People" },
```

- [ ] **Step 16: Typecheck until clean**

Run: `npx tsc --noEmit`
Expected: 0 errors. Any remaining `Record<AssetType, …>` missing `PERSON` → add the `PERSON` entry in that file the same way as Step 7.

Run: `npm test && npm run lint`
Expected: pass.

- [ ] **Step 17: Smoke test**

`npm run dev` → `/costs` renders; the type filter shows "People"; open a house → add a service record → the Category list still shows Routine…Other only.

- [ ] **Step 18: Commit**

```bash
git add -A lib app components
git commit -m "feat: add PERSON to the shared asset, cost and upload layer"
```

---

### Task 6: Generic entity dialog and table

**Files:**
- Create: `components/forms/entity-form-dialog.tsx`, `components/forms/entity-table.tsx`

**Interfaces:**
- Consumes: `FieldConfig`, `FormValues`, `ActionResult` (Task 4).
- Produces:
  - `EntityFormDialog({ open, onClose, title, submitLabel, successMessage, fields, initial, onSubmit, children? })` — resets to `initial` each time it opens; required-field check client side; maps `ActionResult.error` field errors under inputs; closes and toasts on success.
  - `EntityTable<T extends { id: string }>({ rows, columns, describe, onEdit, onDelete, empty, renderExpanded?, extraActions? })`, `type EntityColumn<T> = { key; label; className?; cell(row) }`.

- [ ] **Step 1: Create `components/forms/entity-form-dialog.tsx`**

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { ActionResult, FieldConfig, FormValues } from "@/lib/form-types"

// Base UI Select has no empty-string option, so "none" needs a sentinel.
const NONE = "__none__"

// One dialog for every health record type. Each caller describes its fields as
// data; the server action's zod schema does the real validation and its field
// errors come back under the matching inputs.

interface Props {
  open: boolean
  onClose: () => void
  title: string
  submitLabel: string
  successMessage: string
  fields: FieldConfig[]
  initial: FormValues
  onSubmit: (values: FormValues) => Promise<ActionResult>
  /** Rendered under the fields, e.g. attachments for a record that already exists. */
  children?: React.ReactNode
}

export function EntityFormDialog({ open, onClose, title, submitLabel, successMessage, fields, initial, onSubmit, children }: Props) {
  const [values, setValues] = useState<FormValues>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)

  // Reset whenever the dialog opens, so it shows the record being edited (or a
  // blank form) rather than whatever was typed last time.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setValues(initial)
      setErrors({})
    }
  }

  function set(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const missing = fields.filter((f) => f.required && !values[f.name]?.trim())
    if (missing.length > 0) {
      setErrors(Object.fromEntries(missing.map((f) => [f.name, `${f.label} is required`])))
      return
    }

    setSubmitting(true)
    try {
      const result = await onSubmit(values)
      if (result.error) {
        if (typeof result.error === "string") {
          toast.error(result.error)
        } else {
          setErrors(Object.fromEntries(Object.entries(result.error).map(([k, v]) => [k, v?.[0] ?? "Invalid value"])))
          toast.error("Please fix the errors and try again.")
        }
        return
      }
      toast.success(successMessage)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name} className={cn("space-y-1.5", f.wide && "sm:col-span-2")}>
                <Label htmlFor={`field-${f.name}`}>
                  {f.label}
                  {f.required && " *"}
                </Label>
                <FieldInput field={f} value={values[f.name] ?? ""} onChange={(v) => set(f.name, v)} />
                {errors[f.name] && <p className="text-xs text-destructive">{errors[f.name]}</p>}
              </div>
            ))}
          </div>

          {children}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FieldInput({ field, value, onChange }: { field: FieldConfig; value: string; onChange: (v: string) => void }) {
  const id = `field-${field.name}`

  if (field.kind === "textarea") {
    return <Textarea id={id} rows={3} value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
  }

  if (field.kind === "select") {
    const options = field.options ?? []
    return (
      <Select value={value || NONE} onValueChange={(v) => onChange(!v || v === NONE ? "" : v)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{(v: string) => options.find((o) => o.value === v)?.label ?? "None"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {!field.required && <SelectItem value={NONE}>None</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (field.kind === "checkboxes") {
    const options = field.options ?? []
    const selected = new Set(value ? value.split(",") : [])
    return (
      <div id={id} className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selected.has(o.value)}
              onChange={(e) => {
                const next = new Set(selected)
                if (e.target.checked) next.add(o.value)
                else next.delete(o.value)
                onChange([...next].join(","))
              }}
            />
            {o.label}
          </label>
        ))}
        {options.length === 0 && <span className="text-sm text-muted-foreground">Nothing to choose yet.</span>}
      </div>
    )
  }

  return (
    <Input
      id={id}
      type={field.kind}
      step={field.kind === "number" ? "any" : undefined}
      value={value}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
```

- [ ] **Step 2: Create `components/forms/entity-table.tsx`**

```tsx
"use client"

import { Fragment, useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { ChevronDown, Pencil, Trash2 } from "lucide-react"

export type EntityColumn<T> = {
  key: string
  label: string
  className?: string
  cell: (row: T) => React.ReactNode
}

interface Props<T extends { id: string }> {
  rows: T[]
  columns: EntityColumn<T>[]
  /** Names the row in aria-labels, e.g. "Penicillin allergy". */
  describe: (row: T) => string
  onEdit: (row: T) => void
  onDelete: (row: T) => void
  empty: string
  renderExpanded?: (row: T) => React.ReactNode
  extraActions?: (row: T) => React.ReactNode
}

// The small tables on a person page and the providers page. No sorting or
// paging: these lists are a handful of rows, ordered by the query that loads them.
export function EntityTable<T extends { id: string }>({
  rows, columns, describe, onEdit, onDelete, empty, renderExpanded, extraActions,
}: Props<T>) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{empty}</div>
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.className}>{c.label}</TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const expanded = expandedId === row.id
              return (
                <Fragment key={row.id}>
                  <TableRow className="cursor-pointer" onClick={() => onEdit(row)}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={c.className}>{c.cell(row)}</TableCell>
                    ))}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {extraActions?.(row)}
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${describe(row)}`} onClick={() => onEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`Delete ${describe(row)}`} onClick={() => onDelete(row)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        {renderExpanded && (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            aria-label={expanded ? "Hide details" : "Show details"} aria-expanded={expanded}
                            onClick={() => setExpandedId(expanded ? null : row.id)}
                          >
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded && renderExpanded && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columns.length + 1} className="bg-muted/30 whitespace-normal">
                        {renderExpanded(row)}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: pass. (Exercised through the UI from Task 8 on.)

- [ ] **Step 4: Commit**

```bash
git add components/forms
git commit -m "feat: add config-driven entity dialog and table"
```

---

## Phase 3 — People

### Task 7: People and provider server actions

**Files:**
- Create: `lib/actions/people.ts`, `lib/actions/providers.ts`

**Interfaces:**
- Consumes: `personSchema`, `providerSchema` (Task 4), `resolveUploadPath` (Task 1), `FormValues`, `ActionResult`.
- Produces: `createPerson(values)`, `updatePerson(id, values)`, `deletePerson(id)`, `createProvider(values)`, `updateProvider(id, values)`, `deleteProvider(id)` — all `Promise<ActionResult>`.

- [ ] **Step 1: Create `lib/actions/people.ts`**

```ts
"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { rm } from "fs/promises"
import { personSchema } from "@/lib/health-schemas"
import { resolveUploadPath } from "@/lib/upload-path"
import type { ActionResult, FormValues } from "@/lib/form-types"

export async function createPerson(values: FormValues): Promise<ActionResult> {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = personSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const person = await prisma.person.create({ data: parsed.data })
  revalidatePath("/assets/people")
  return { success: true, id: person.id }
}

export async function updatePerson(id: string, values: FormValues): Promise<ActionResult> {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = personSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.person.update({ where: { id }, data: parsed.data })
  revalidatePath("/assets/people")
  revalidatePath(`/assets/people/${id}`)
  return { success: true }
}

export async function deletePerson(id: string): Promise<ActionResult> {
  const session = await auth()
  if (!session) redirect("/login")

  const person = await prisma.person.findUnique({
    where: { id },
    select: { id: true, conditions: { select: { id: true } } },
  })
  if (!person) return { error: "Not found" }

  const where = { assetType: "PERSON" as const, assetId: person.id }
  const [visits, schedules] = await Promise.all([
    prisma.serviceRecord.findMany({ where, select: { id: true } }),
    prisma.maintenanceSchedule.findMany({ where, select: { id: true } }),
  ])

  // Visits and reminders are keyed polymorphically with no foreign key, so the
  // person's own cascade can't reach them — they go in the same transaction.
  await prisma.$transaction([
    prisma.serviceRecord.deleteMany({ where }),
    prisma.maintenanceSchedule.deleteMany({ where }),
    prisma.person.delete({ where: { id: person.id } }),
  ])

  const dirs: [string, string][] = [
    ["people", person.id],
    ...visits.map((v): [string, string] => ["service", v.id]),
    ...schedules.map((s): [string, string] => ["maintenance", s.id]),
    ...person.conditions.map((c): [string, string] => ["condition", c.id]),
  ]
  for (const dir of dirs) await rm(resolveUploadPath(...dir), { recursive: true, force: true })

  revalidatePath("/assets/people")
  revalidatePath("/records")
  revalidatePath("/maintenance")
  return { success: true }
}
```

- [ ] **Step 2: Create `lib/actions/providers.ts`**

```ts
"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { providerSchema } from "@/lib/health-schemas"
import type { ActionResult, FormValues } from "@/lib/form-types"

// Provider names appear on every person page, so changes revalidate the whole
// people subtree, not just the directory.
function revalidateProviders() {
  revalidatePath("/providers")
  revalidatePath("/assets/people", "layout")
}

export async function createProvider(values: FormValues): Promise<ActionResult> {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = providerSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const provider = await prisma.provider.create({ data: parsed.data })
  revalidateProviders()
  return { success: true, id: provider.id }
}

export async function updateProvider(id: string, values: FormValues): Promise<ActionResult> {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = providerSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.provider.update({ where: { id }, data: parsed.data })
  revalidateProviders()
  return { success: true }
}

export async function deleteProvider(id: string): Promise<ActionResult> {
  const session = await auth()
  if (!session) redirect("/login")

  const provider = await prisma.provider.findUnique({ where: { id }, select: { id: true } })
  if (!provider) return { error: "Not found" }

  // Every reference is onDelete: SetNull, so visits, conditions and
  // prescriptions keep their history and just lose the link.
  await prisma.provider.delete({ where: { id: provider.id } })
  revalidateProviders()
  return { success: true }
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: pass. (Driven through the UI in Tasks 8, 11, 13.)

- [ ] **Step 4: Commit**

```bash
git add lib/actions/people.ts lib/actions/providers.ts
git commit -m "feat: add person and provider actions"
```

---

### Task 8: People list page, person form, sidebar

**Files:**
- Create: `components/people/person-fields.ts`, `components/people/people-list.tsx`, `app/(app)/assets/people/page.tsx`
- Modify: `components/sidebar.tsx`

**Interfaces:**
- Consumes: `EntityFormDialog` (Task 6), `createPerson`/`deletePerson` (Task 7), `AssetCollection`, `AssetViewToggle`, `useAssetView`, `RELATIONSHIPS`, `ageFrom`, `labelFor`, `toDateInput`.
- Produces: `personFields(providers): FieldConfig[]`, `personInitial(person?): FormValues`; `PeopleList({ people, providers, initialView })` with `type PersonRow = Person & { _count: { conditions: number; medications: number; allergies: number } }`.

- [ ] **Step 1: `components/people/person-fields.ts`**

```ts
import { RELATIONSHIPS, toDateInput } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Person } from "@/app/generated/prisma/client"

export function personFields(providers: { id: string; name: string }[]): FieldConfig[] {
  return [
    { name: "name", label: "Name", kind: "text", required: true, placeholder: "Jordan Rivera", wide: true },
    { name: "relationship", label: "Relationship", kind: "select", required: true, options: RELATIONSHIPS },
    { name: "dateOfBirth", label: "Date of birth", kind: "date" },
    { name: "sex", label: "Sex", kind: "text", placeholder: "F" },
    { name: "bloodType", label: "Blood type", kind: "text", placeholder: "O+" },
    {
      name: "primaryProviderId", label: "Primary care provider", kind: "select", wide: true,
      options: providers.map((p) => ({ value: p.id, label: p.name })),
    },
    { name: "notes", label: "Notes", kind: "textarea", wide: true },
  ]
}

export function personInitial(person?: Person | null): FormValues {
  return {
    name: person?.name ?? "",
    relationship: person?.relationship ?? "SELF",
    dateOfBirth: toDateInput(person?.dateOfBirth),
    sex: person?.sex ?? "",
    bloodType: person?.bloodType ?? "",
    primaryProviderId: person?.primaryProviderId ?? "",
    notes: person?.notes ?? "",
  }
}
```

- [ ] **Step 2: `components/people/people-list.tsx`**

```tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertTriangle, MoreHorizontal, Pencil, Pill, Stethoscope, Trash2 } from "lucide-react"
import { AssetCollection, type AssetColumn } from "@/components/assets/asset-collection"
import { AssetViewToggle } from "@/components/assets/asset-view-toggle"
import { useAssetView } from "@/components/assets/use-asset-view"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { createPerson, deletePerson, updatePerson } from "@/lib/actions/people"
import { ageFrom, labelFor, RELATIONSHIPS } from "@/lib/health"
import { personFields, personInitial } from "./person-fields"
import type { Accessor } from "@/lib/use-client-table"
import type { AssetView } from "@/lib/asset-view"
import type { Person } from "@/app/generated/prisma/client"

export type PersonRow = Person & { _count: { conditions: number; medications: number; allergies: number } }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

interface Props {
  people: PersonRow[]
  providers: { id: string; name: string }[]
  initialView: AssetView
}

export function PeopleList({ people, providers, initialView }: Props) {
  const router = useRouter()
  const [view, setView] = useAssetView("people", initialView)
  const [editing, setEditing] = useState<PersonRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const age = (p: PersonRow) => (p.dateOfBirth ? ageFrom(p.dateOfBirth, new Date()) : null)

  // Memoized because the sort in useClientTable keys off this object's identity.
  const accessors = useMemo<Record<string, Accessor<PersonRow>>>(
    () => ({
      name: (p) => p.name,
      relationship: (p) => labelFor(RELATIONSHIPS, p.relationship),
      age: (p) => (p.dateOfBirth ? ageFrom(p.dateOfBirth, new Date()) : null),
      conditions: (p) => p._count.conditions,
      medications: (p) => p._count.medications,
    }),
    []
  )

  const columns: AssetColumn<PersonRow>[] = [
    { key: "name", label: "Name", cell: (p) => <span className="font-medium">{p.name}</span> },
    { key: "relationship", label: "Relationship", cell: (p) => <Badge variant="secondary" className="text-xs">{labelFor(RELATIONSHIPS, p.relationship)}</Badge> },
    { key: "age", label: "Age", className: "text-muted-foreground", cell: (p) => age(p) ?? "—" },
    { key: "conditions", label: "Active conditions", className: "text-muted-foreground", cell: (p) => p._count.conditions },
    { key: "medications", label: "Medications", className: "text-muted-foreground", cell: (p) => p._count.medications },
    {
      key: "allergy", label: "Allergies", sortable: false,
      cell: (p) => (p._count.allergies > 0 ? <Badge variant="destructive" className="text-xs">Severe</Badge> : "—"),
    },
  ]

  function toCard(p: PersonRow) {
    const a = age(p)
    return {
      name: p.name,
      badge: labelFor(RELATIONSHIPS, p.relationship),
      subtitle: a != null ? `Age ${a}` : null,
      meta: [
        ...(p._count.conditions > 0 ? [{ icon: Stethoscope, text: plural(p._count.conditions, "active condition") }] : []),
        ...(p._count.medications > 0 ? [{ icon: Pill, text: plural(p._count.medications, "medication") }] : []),
        ...(p._count.allergies > 0 ? [{ icon: AlertTriangle, text: "Severe allergy on file" }] : []),
      ],
    }
  }

  async function handleDelete(p: PersonRow) {
    if (!confirm(`Delete "${p.name}"? This also deletes their visits, reminders, conditions, medications and files.`)) return
    const result = await deletePerson(p.id)
    if (result.error) { toast.error(typeof result.error === "string" ? result.error : "Delete failed."); return }
    toast.success(`"${p.name}" deleted.`)
  }

  function openNew() { setEditing(null); setDialogOpen(true) }
  function openEdit(p: PersonRow) { setEditing(p); setDialogOpen(true) }

  function renderActions(p: PersonRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More actions for "${p.name}"`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted transition-colors"
          onClick={(evt) => evt.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(evt) => evt.stopPropagation()}>
          <DropdownMenuItem onClick={() => openEdit(p)}>
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(p)}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">People</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{people.length} {people.length === 1 ? "person" : "people"}</p>
        </div>
        <div className="flex items-center gap-2">
          {people.length > 0 && <AssetViewToggle value={view} onChange={setView} />}
          <Button onClick={openNew}>Add Person</Button>
        </div>
      </div>

      {people.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">No people yet</p>
          <p className="text-sm mt-1">Add household members to track visits, medical receipts, conditions and medications.</p>
        </div>
      ) : (
        <AssetCollection
          items={people}
          view={view}
          assetType="PERSON"
          imageFilenameOf={(p) => p.imageFilename}
          toCard={toCard}
          columns={columns}
          accessors={accessors}
          defaultSort="name"
          defaultDir="asc"
          renderActions={renderActions}
          onOpen={(p) => router.push(`/assets/people/${p.id}`)}
          label="people"
        />
      )}

      <EntityFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? "Edit Person" : "Add Person"}
        submitLabel={editing ? "Save Changes" : "Add Person"}
        successMessage={editing ? "Person updated." : "Person added."}
        fields={personFields(providers)}
        initial={personInitial(editing)}
        onSubmit={(values) => (editing ? updatePerson(editing.id, values) : createPerson(values))}
      />
    </>
  )
}
```

- [ ] **Step 3: `app/(app)/assets/people/page.tsx`**

```tsx
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { PeopleList } from "@/components/people/people-list"
import { assetViewCookieName, parseAssetView } from "@/lib/asset-view"

export default async function PeoplePage() {
  // Start of today in UTC — dates are stored as UTC midnight, and a medication
  // counts as active through the whole of its end date (lib/health.ts).
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const [people, providers, cookieStore] = await Promise.all([
    prisma.person.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            conditions: { where: { status: { not: "RESOLVED" } } },
            medications: { where: { OR: [{ endDate: null }, { endDate: { gte: today } }] } },
            allergies: { where: { severity: "SEVERE" } },
          },
        },
      },
    }),
    prisma.provider.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    cookies(),
  ])

  const initialView = parseAssetView(cookieStore.get(assetViewCookieName("people"))?.value)

  return (
    <div className="space-y-6">
      <PeopleList people={people} providers={providers} initialView={initialView} />
    </div>
  )
}
```

- [ ] **Step 4: Sidebar** — `components/sidebar.tsx`

Replace the icon import and `navItems`:

```tsx
import {
  LayoutDashboard, Building2, Car, Refrigerator, Wrench, ShieldCheck,
  Calendar, Bell, Settings, Menu, PiggyBank, HeartPulse, Stethoscope, ShieldPlus,
} from "lucide-react"

type NavItem = { href: string; label: string; icon: React.ElementType; section?: string }

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/assets/properties", label: "Properties", icon: Building2 },
  { href: "/assets/vehicles", label: "Vehicles", icon: Car },
  { href: "/assets/equipment", label: "Equipment", icon: Refrigerator },
  { href: "/assets/people", label: "People", icon: HeartPulse, section: "Health" },
  { href: "/providers", label: "Providers", icon: Stethoscope },
  { href: "/insurance", label: "Insurance", icon: ShieldPlus },
  { href: "/records", label: "Service Records", icon: Wrench, section: "Activity" },
  { href: "/costs", label: "Costs", icon: PiggyBank },
  { href: "/warranties", label: "Warranties", icon: ShieldCheck },
  { href: "/maintenance", label: "Maintenance", icon: Calendar },
  { href: "/notifications", label: "Notifications", icon: Bell },
]
```

In `SidebarContent`, replace the `navItems.map(...)` line with:

```tsx
        {navItems.map(({ section, ...item }) => (
          <Fragment key={item.href}>
            {section && (
              <p className="mt-3 px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">{section}</p>
            )}
            <NavLink {...item} onClick={onNavClick} />
          </Fragment>
        ))}
```
and add `Fragment` to the React import: `import { Fragment, useState } from "react"`.

- [ ] **Step 5: Verify in the app**

Run: `npx tsc --noEmit && npm run lint`, then `npm run dev`:
1. Sidebar shows a "Health" heading with People, Providers, Insurance, then "Activity".
2. `/assets/people` → empty state → Add Person with only a name → card shows name + "Self" badge, no age, no meta lines, no "NaN".
3. Add a person with DOB in the future → error under "Date of birth", dialog stays open.
4. Edit the person → fields prefilled; change name → saved.
5. Toggle cards/compact/list → all render; list shows "—" for age.

- [ ] **Step 6: Commit**

```bash
git add components/people app/\(app\)/assets/people/page.tsx components/sidebar.tsx
git commit -m "feat: add people list page and sidebar health section"
```

---

### Task 9: Visits for people — provider and condition links on service records

**Files:**
- Modify: `lib/actions/service-records.ts`, `components/service-records/service-record-form-dialog.tsx`, `components/service-records/service-record-list.tsx`

**Interfaces:**
- Consumes: `categoriesFor` (Task 5), `ServiceRecord.providerId/conditionId` (Task 3).
- Produces: `ServiceRecordList` and `ServiceRecordFormDialog` accept optional `providerOptions?: { id: string; name: string }[]` and `conditionOptions?: { id: string; name: string }[]`. Service record actions accept `providerId`/`conditionId` strings (blank = none) and fill `vendor` from the provider's name when vendor is blank.

- [ ] **Step 1: Action schema and provider fallback** — `lib/actions/service-records.ts`

Add to `schema`:
```ts
  providerId: z.string().optional(),
  conditionId: z.string().optional(),
```
Add to the object returned by `clean`:
```ts
    providerId: v.providerId || null,
    conditionId: v.conditionId || null,
```
Add below `clean`:
```ts
// A visit linked to a provider but with no facility typed still has a payee,
// so the cost reports' vendor ranking works for medical spend too.
async function withProviderVendor<T extends { providerId: string | null; vendor: string | null }>(data: T): Promise<T> {
  if (!data.providerId || data.vendor) return data
  const provider = await prisma.provider.findUnique({ where: { id: data.providerId }, select: { name: true } })
  return { ...data, vendor: provider?.name ?? null }
}
```
In `createServiceRecord`: `data: clean(parsed.data, session.user.id)` → `data: await withProviderVendor(clean(parsed.data, session.user.id))`. Same change in `updateServiceRecord`.

- [ ] **Step 2: Form** — `components/service-records/service-record-form-dialog.tsx`

1. Import: replace `import { SERVICE_CATEGORIES } from "@/lib/costs"` with `import { SERVICE_CATEGORIES, categoriesFor } from "@/lib/costs"`.
2. Add a sentinel below `NO_CATEGORY`: `const NO_LINK = "__none__"`.
3. Schema: add `providerId: z.string().optional(),` and `conditionId: z.string().optional(),`.
4. Props: add
   ```ts
     /** People only: the provider directory and this person's conditions. */
     providerOptions?: { id: string; name: string }[]
     conditionOptions?: { id: string; name: string }[]
   ```
   and destructure `providerOptions, conditionOptions` in the component signature.
5. In `defaultValues` and in both `form.reset` calls add `providerId: "", conditionId: ""` for the new-record case and `providerId: record.providerId ?? "", conditionId: record.conditionId ?? ""` for the edit case.
6. In `onSubmit`'s payload spread add:
   ```ts
      providerId: values.providerId === NO_LINK ? "" : values.providerId,
      conditionId: values.conditionId === NO_LINK ? "" : values.conditionId,
   ```
7. Add `const isPerson = assetType === "PERSON"` at the top of the component. Dialog title: `{record ? (isPerson ? "Edit Visit" : "Edit Service Record") : (isPerson ? "Add Visit / Expense" : "Add Service Record")}`. Title input placeholder: `placeholder={isPerson ? "Annual physical" : "Oil Change"}`. Vendor label/placeholder: `<FormLabel>{isPerson ? "Facility" : "Vendor / Shop"}</FormLabel>` and `placeholder={isPerson ? "City Medical Center" : "Jiffy Lube"}`. Success toast: `toast.success(record ? "Record updated." : isPerson ? "Visit added." : "Service record added.")`.
8. Category options: in the `SelectContent`, replace `{SERVICE_CATEGORIES.map((c) => (` with `{categoriesFor(assetType).map((c) => (`. (The `SelectValue` lookup keeps `SERVICE_CATEGORIES` so any stored label still resolves.)
9. After the category `FormField`, add:
   ```tsx
              {providerOptions && (
                <FormField control={form.control} name="providerId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <Select value={field.value || NO_LINK} onValueChange={(v) => field.onChange(!v || v === NO_LINK ? "" : v)}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue>{(v: string) => providerOptions.find((p) => p.id === v)?.name ?? "None"}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_LINK}>None</SelectItem>
                        {providerOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              )}

              {conditionOptions && conditionOptions.length > 0 && (
                <FormField control={form.control} name="conditionId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>For condition</FormLabel>
                    <Select value={field.value || NO_LINK} onValueChange={(v) => field.onChange(!v || v === NO_LINK ? "" : v)}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue>{(v: string) => conditionOptions.find((c) => c.id === v)?.name ?? "None"}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_LINK}>None</SelectItem>
                        {conditionOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              )}
   ```
   (The mileage field is already gated on `assetType === "VEHICLE"`.)

- [ ] **Step 3: List pass-through** — `components/service-records/service-record-list.tsx`

Add to `Props`:
```ts
  providerOptions?: { id: string; name: string }[]
  conditionOptions?: { id: string; name: string }[]
```
Destructure them and pass `providerOptions={providerOptions} conditionOptions={conditionOptions}` to `<ServiceRecordFormDialog>`. Change the add button's text to `{assetType === "PERSON" ? "Add Visit" : "<its existing text>"}` and the count line / empty-state text to say "visit(s)" when `assetType === "PERSON"`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`. Open a vehicle → add a service record → dialog unchanged (mileage shown, no provider field). (People visits are exercised in Task 11.)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/service-records.ts components/service-records
git commit -m "feat: link person visits to providers and conditions"
```

---

## Phase 4 — Health records

### Task 10: Health record server actions

**Files:**
- Create: `lib/actions/health.ts`

**Interfaces:**
- Consumes: `conditionSchema`, `medicationSchema`, `allergySchema`, `immunizationSchema`, `nextRefillFrom` (Task 4), `resolveUploadPath`.
- Produces (all `Promise<ActionResult>`): `createCondition(personId, values)`, `updateCondition(id, values)`, `deleteCondition(id)`, `createMedication(personId, values)`, `updateMedication(id, values)`, `deleteMedication(id)`, `markMedicationRefilled(id)`, `createAllergy(personId, values)`, `updateAllergy(id, values)`, `deleteAllergy(id)`, `createImmunization(personId, values)`, `updateImmunization(id, values)`, `deleteImmunization(id)`.

- [ ] **Step 1: Create `lib/actions/health.ts`**

```ts
"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { rm } from "fs/promises"
import { allergySchema, conditionSchema, immunizationSchema, medicationSchema } from "@/lib/health-schemas"
import { nextRefillFrom } from "@/lib/health"
import { resolveUploadPath } from "@/lib/upload-path"
import type { ActionResult, FormValues } from "@/lib/form-types"

async function requireSession() {
  const session = await auth()
  if (!session) redirect("/login")
  return session
}

async function personExists(personId: string) {
  return !!(await prisma.person.findUnique({ where: { id: personId }, select: { id: true } }))
}

function revalidatePerson(personId: string) {
  revalidatePath(`/assets/people/${personId}`)
  revalidatePath("/assets/people")
}

const NOT_FOUND: ActionResult = { error: "Not found" }

// ─── Conditions ───────────────────────────────────────────────────────────────

export async function createCondition(personId: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = conditionSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  if (!(await personExists(personId))) return NOT_FOUND

  const row = await prisma.healthCondition.create({ data: { ...parsed.data, personId } })
  revalidatePerson(personId)
  return { success: true, id: row.id }
}

export async function updateCondition(id: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = conditionSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  const existing = await prisma.healthCondition.findUnique({ where: { id }, select: { personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.healthCondition.update({ where: { id }, data: parsed.data })
  revalidatePerson(existing.personId)
  return { success: true }
}

export async function deleteCondition(id: string): Promise<ActionResult> {
  await requireSession()
  const existing = await prisma.healthCondition.findUnique({ where: { id }, select: { id: true, personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.healthCondition.delete({ where: { id: existing.id } })
  await rm(resolveUploadPath("condition", existing.id), { recursive: true, force: true })
  revalidatePerson(existing.personId)
  return { success: true }
}

// ─── Medications ──────────────────────────────────────────────────────────────

export async function createMedication(personId: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = medicationSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  if (!(await personExists(personId))) return NOT_FOUND

  const row = await prisma.medication.create({ data: { ...parsed.data, personId } })
  revalidatePerson(personId)
  return { success: true, id: row.id }
}

export async function updateMedication(id: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = medicationSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  const existing = await prisma.medication.findUnique({ where: { id }, select: { personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.medication.update({ where: { id }, data: parsed.data })
  revalidatePerson(existing.personId)
  return { success: true }
}

export async function deleteMedication(id: string): Promise<ActionResult> {
  await requireSession()
  const existing = await prisma.medication.findUnique({ where: { id }, select: { id: true, personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.medication.delete({ where: { id: existing.id } })
  revalidatePerson(existing.personId)
  return { success: true }
}

/// Picked up today: the next refill is one interval from today, not from the
/// old due date, so a late pickup doesn't leave the next one already overdue.
export async function markMedicationRefilled(id: string): Promise<ActionResult> {
  await requireSession()
  const med = await prisma.medication.findUnique({ where: { id }, select: { personId: true, refillIntervalDays: true } })
  if (!med) return NOT_FOUND
  if (!med.refillIntervalDays) return { error: "Set a refill interval first." }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  await prisma.medication.update({ where: { id }, data: { nextRefillDate: nextRefillFrom(today, med.refillIntervalDays) } })
  revalidatePerson(med.personId)
  return { success: true }
}

// ─── Allergies ────────────────────────────────────────────────────────────────

export async function createAllergy(personId: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = allergySchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  if (!(await personExists(personId))) return NOT_FOUND

  const row = await prisma.allergy.create({ data: { ...parsed.data, personId } })
  revalidatePerson(personId)
  return { success: true, id: row.id }
}

export async function updateAllergy(id: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = allergySchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  const existing = await prisma.allergy.findUnique({ where: { id }, select: { personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.allergy.update({ where: { id }, data: parsed.data })
  revalidatePerson(existing.personId)
  return { success: true }
}

export async function deleteAllergy(id: string): Promise<ActionResult> {
  await requireSession()
  const existing = await prisma.allergy.findUnique({ where: { id }, select: { id: true, personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.allergy.delete({ where: { id: existing.id } })
  revalidatePerson(existing.personId)
  return { success: true }
}

// ─── Immunizations ────────────────────────────────────────────────────────────

export async function createImmunization(personId: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = immunizationSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  if (!(await personExists(personId))) return NOT_FOUND

  const row = await prisma.immunization.create({ data: { ...parsed.data, personId } })
  revalidatePerson(personId)
  return { success: true, id: row.id }
}

export async function updateImmunization(id: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = immunizationSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  const existing = await prisma.immunization.findUnique({ where: { id }, select: { personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.immunization.update({ where: { id }, data: parsed.data })
  revalidatePerson(existing.personId)
  return { success: true }
}

export async function deleteImmunization(id: string): Promise<ActionResult> {
  await requireSession()
  const existing = await prisma.immunization.findUnique({ where: { id }, select: { id: true, personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.immunization.delete({ where: { id: existing.id } })
  revalidatePerson(existing.personId)
  return { success: true }
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/health.ts
git commit -m "feat: add condition, medication, allergy and immunization actions"
```

---

### Task 11: Person detail page — visits, reminders, allergies, immunizations

**Files:**
- Create: `components/people/person-edit-button.tsx`, `components/health/allergy-callout.tsx`, `components/health/allergies-section.tsx`, `components/health/immunizations-section.tsx`, `app/(app)/assets/people/[id]/page.tsx`

**Interfaces:**
- Consumes: Tasks 6, 7, 9, 10; `ServiceRecordList`, `MaintenanceList`, `AssetImageUploader`, `AssetCostPanel`; `formatDay`, `daysUntil`, `ageFrom`, `labelFor`, `RELATIONSHIPS`, `ALLERGY_SEVERITIES`, `HEALTH_WINDOWS`.
- Produces: `AllergyCallout({ allergies })`, `AllergiesSection({ personId, allergies })`, `ImmunizationsSection({ personId, immunizations })`, `PersonEditButton({ person, providers })`, and the page at `/assets/people/[id]` with tabs `visits`, `immunizations`, `allergies`, `reminders` (Task 12 adds `conditions`, `medications`).

- [ ] **Step 1: `components/people/person-edit-button.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { updatePerson } from "@/lib/actions/people"
import { personFields, personInitial } from "./person-fields"
import type { Person } from "@/app/generated/prisma/client"

export function PersonEditButton({ person, providers }: { person: Person; providers: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </button>
      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit Person"
        submitLabel="Save Changes"
        successMessage="Person updated."
        fields={personFields(providers)}
        initial={personInitial(person)}
        onSubmit={(values) => updatePerson(person.id, values)}
      />
    </>
  )
}
```

- [ ] **Step 2: `components/health/allergy-callout.tsx`**

```tsx
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { ALLERGY_SEVERITIES, labelFor } from "@/lib/health"
import type { Allergy } from "@/app/generated/prisma/client"

// Always visible in the aside, never behind a tab: it is the first thing anyone
// treating this person needs. Severity is spelled out, not colour-only.
export function AllergyCallout({ allergies }: { allergies: Allergy[] }) {
  const severe = allergies.some((a) => a.severity === "SEVERE")
  return (
    <div
      className={cn("rounded-lg border p-3 text-sm", severe ? "border-destructive/50 bg-destructive/10" : "bg-card")}
      role={severe ? "alert" : undefined}
    >
      <div className={cn("flex items-center gap-1.5 font-semibold", severe && "text-destructive")}>
        <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Allergies
      </div>
      {allergies.length === 0 ? (
        <p className="mt-1 text-muted-foreground">None recorded</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {allergies.map((a) => (
            <li key={a.id} className="flex items-baseline justify-between gap-2">
              <span className={cn(a.severity === "SEVERE" && "font-semibold")}>{a.substance}</span>
              <span className="text-right text-xs text-muted-foreground">
                {labelFor(ALLERGY_SEVERITIES, a.severity)}
                {a.reaction ? ` · ${a.reaction}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `components/health/allergies-section.tsx`**

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { createAllergy, deleteAllergy, updateAllergy } from "@/lib/actions/health"
import { ALLERGY_SEVERITIES, labelFor } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Allergy } from "@/app/generated/prisma/client"

const FIELDS: FieldConfig[] = [
  { name: "substance", label: "Substance", kind: "text", required: true, placeholder: "Penicillin" },
  { name: "severity", label: "Severity", kind: "select", required: true, options: ALLERGY_SEVERITIES },
  { name: "reaction", label: "Reaction", kind: "text", placeholder: "Hives, swelling", wide: true },
  { name: "notes", label: "Notes", kind: "textarea", wide: true },
]

const SEVERITY_VARIANT = { MILD: "outline", MODERATE: "secondary", SEVERE: "destructive" } as const

const COLUMNS: EntityColumn<Allergy>[] = [
  { key: "substance", label: "Substance", cell: (a) => <span className="font-medium">{a.substance}</span> },
  { key: "severity", label: "Severity", cell: (a) => <Badge variant={SEVERITY_VARIANT[a.severity]}>{labelFor(ALLERGY_SEVERITIES, a.severity)}</Badge> },
  { key: "reaction", label: "Reaction", className: "text-muted-foreground", cell: (a) => a.reaction ?? "—" },
]

function initialFor(a: Allergy | null): FormValues {
  return { substance: a?.substance ?? "", severity: a?.severity ?? "MODERATE", reaction: a?.reaction ?? "", notes: a?.notes ?? "" }
}

export function AllergiesSection({ personId, allergies }: { personId: string; allergies: Allergy[] }) {
  const [editing, setEditing] = useState<Allergy | null>(null)
  const [open, setOpen] = useState(false)

  async function handleDelete(a: Allergy) {
    if (!confirm(`Delete the ${a.substance} allergy?`)) return
    const result = await deleteAllergy(a.id)
    if (result.error) { toast.error("Delete failed."); return }
    toast.success("Allergy deleted.")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{allergies.length} allerg{allergies.length === 1 ? "y" : "ies"}</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>Add Allergy</Button>
      </div>

      <EntityTable
        rows={allergies}
        columns={COLUMNS}
        describe={(a) => `${a.substance} allergy`}
        onEdit={(a) => { setEditing(a); setOpen(true) }}
        onDelete={handleDelete}
        empty="No allergies recorded."
      />

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Allergy" : "Add Allergy"}
        submitLabel={editing ? "Save Changes" : "Add Allergy"}
        successMessage={editing ? "Allergy updated." : "Allergy added."}
        fields={FIELDS}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateAllergy(editing.id, values) : createAllergy(personId, values))}
      />
    </>
  )
}
```

- [ ] **Step 4: `components/health/immunizations-section.tsx`**

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { createImmunization, deleteImmunization, updateImmunization } from "@/lib/actions/health"
import { daysUntil, formatDay, HEALTH_WINDOWS, toDateInput } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Immunization } from "@/app/generated/prisma/client"

const FIELDS: FieldConfig[] = [
  { name: "vaccine", label: "Vaccine", kind: "text", required: true, placeholder: "Tdap", wide: true },
  { name: "dateGiven", label: "Date given", kind: "date", required: true },
  { name: "nextDueDate", label: "Next due", kind: "date" },
  { name: "dose", label: "Dose", kind: "text", placeholder: "Booster" },
  { name: "givenBy", label: "Given by", kind: "text", placeholder: "CVS Pharmacy" },
  { name: "notes", label: "Notes", kind: "textarea", wide: true },
]

function initialFor(i: Immunization | null): FormValues {
  return {
    vaccine: i?.vaccine ?? "",
    dateGiven: toDateInput(i?.dateGiven) || toDateInput(new Date()),
    nextDueDate: toDateInput(i?.nextDueDate),
    dose: i?.dose ?? "",
    givenBy: i?.givenBy ?? "",
    notes: i?.notes ?? "",
  }
}

function DueBadge({ date }: { date: Date | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>
  const days = daysUntil(date, new Date())
  if (days < 0) return <Badge variant="destructive">Overdue · {formatDay(date)}</Badge>
  if (days <= HEALTH_WINDOWS.immunizationDays) return <Badge variant="secondary">Due {formatDay(date)}</Badge>
  return <span className="text-muted-foreground">{formatDay(date)}</span>
}

const COLUMNS: EntityColumn<Immunization>[] = [
  { key: "vaccine", label: "Vaccine", cell: (i) => <div><div className="font-medium">{i.vaccine}</div>{i.dose && <div className="text-xs text-muted-foreground">{i.dose}</div>}</div> },
  { key: "given", label: "Given", className: "whitespace-nowrap text-muted-foreground", cell: (i) => formatDay(i.dateGiven) },
  { key: "by", label: "Given by", className: "text-muted-foreground", cell: (i) => i.givenBy ?? "—" },
  { key: "next", label: "Next due", className: "whitespace-nowrap", cell: (i) => <DueBadge date={i.nextDueDate} /> },
]

export function ImmunizationsSection({ personId, immunizations }: { personId: string; immunizations: Immunization[] }) {
  const [editing, setEditing] = useState<Immunization | null>(null)
  const [open, setOpen] = useState(false)

  async function handleDelete(i: Immunization) {
    if (!confirm(`Delete the ${i.vaccine} record from ${formatDay(i.dateGiven)}?`)) return
    const result = await deleteImmunization(i.id)
    if (result.error) { toast.error("Delete failed."); return }
    toast.success("Immunization deleted.")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{immunizations.length} immunization{immunizations.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>Add Immunization</Button>
      </div>

      <EntityTable
        rows={immunizations}
        columns={COLUMNS}
        describe={(i) => `${i.vaccine} immunization`}
        onEdit={(i) => { setEditing(i); setOpen(true) }}
        onDelete={handleDelete}
        empty="No immunizations recorded."
      />

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Immunization" : "Add Immunization"}
        submitLabel={editing ? "Save Changes" : "Add Immunization"}
        successMessage={editing ? "Immunization updated." : "Immunization added."}
        fields={FIELDS}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateImmunization(editing.id, values) : createImmunization(personId, values))}
      />
    </>
  )
}
```

- [ ] **Step 5: `app/(app)/assets/people/[id]/page.tsx`**

```tsx
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Cake, Download, Droplet, FileText, Stethoscope, Users, User } from "lucide-react"
import { ServiceRecordList } from "@/components/service-records/service-record-list"
import { MaintenanceList } from "@/components/maintenance/maintenance-list"
import { AssetImageUploader } from "@/components/asset-image-uploader"
import { AssetCostPanel } from "@/components/costs/asset-cost-panel"
import { PersonEditButton } from "@/components/people/person-edit-button"
import { AllergyCallout } from "@/components/health/allergy-callout"
import { AllergiesSection } from "@/components/health/allergies-section"
import { ImmunizationsSection } from "@/components/health/immunizations-section"
import { ageFrom, formatDay, labelFor, RELATIONSHIPS } from "@/lib/health"

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      primaryProvider: { select: { id: true, name: true } },
      allergies: { orderBy: [{ severity: "desc" }, { substance: "asc" }] },
      immunizations: { orderBy: { dateGiven: "desc" } },
    },
  })
  if (!person) notFound()

  const where = { assetId: id, assetType: "PERSON" as const }
  const [visits, schedules, providers] = await Promise.all([
    prisma.serviceRecord.findMany({ where, include: { attachments: true }, orderBy: { date: "desc" } }),
    prisma.maintenanceSchedule.findMany({ where: { ...where, isActive: true }, orderBy: { nextDueDate: "asc" } }),
    prisma.provider.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])

  const age = person.dateOfBirth ? ageFrom(person.dateOfBirth, new Date()) : null

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="space-y-4 lg:w-72 lg:shrink-0">
        <AssetImageUploader assetType="PERSON" assetId={id} imageFilename={person.imageFilename} alt={person.name} />

        <AllergyCallout allergies={person.allergies} />

        <div className="space-y-2">
          <Stat icon={Users} label="Relationship" value={labelFor(RELATIONSHIPS, person.relationship)} />
          {person.dateOfBirth && (
            <Stat icon={Cake} label="Born" value={`${formatDay(person.dateOfBirth)} (${age})`} />
          )}
          {person.sex && <Stat icon={User} label="Sex" value={person.sex} />}
          {person.bloodType && <Stat icon={Droplet} label="Blood type" value={person.bloodType} />}
          {person.primaryProvider && (
            <Stat
              icon={Stethoscope}
              label="Primary care"
              value={<Link href="/providers" className="hover:underline">{person.primaryProvider.name}</Link>}
            />
          )}
        </div>

        <AssetCostPanel assetType="PERSON" assetId={id} purchasePrice={null} />

        {person.notes && (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground whitespace-pre-wrap">{person.notes}</div>
        )}
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-heading text-2xl font-semibold">{person.name}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <PersonEditButton person={person} providers={providers} />
            <Link
              href={`/reports/people/${id}`}
              target="_blank"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              <FileText className="h-3.5 w-3.5" /> Medical summary
            </Link>
            <a
              href={`/api/assets/people/${id}/download`}
              download
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Download all files
            </a>
          </div>
        </div>

        <Tabs defaultValue="visits">
          <TabsList variant="line" className="w-full justify-start border-b overflow-x-auto">
            <TabsTrigger value="visits">Visits &amp; Expenses ({visits.length})</TabsTrigger>
            <TabsTrigger value="immunizations">Immunizations ({person.immunizations.length})</TabsTrigger>
            <TabsTrigger value="allergies">Allergies ({person.allergies.length})</TabsTrigger>
            <TabsTrigger value="reminders">Reminders ({schedules.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="visits" className="mt-4">
            <ServiceRecordList records={visits} assetId={id} assetType="PERSON" providerOptions={providers} />
          </TabsContent>
          <TabsContent value="immunizations" className="mt-4">
            <ImmunizationsSection personId={id} immunizations={person.immunizations} />
          </TabsContent>
          <TabsContent value="allergies" className="mt-4">
            <AllergiesSection personId={id} allergies={person.allergies} />
          </TabsContent>
          <TabsContent value="reminders" className="mt-4">
            <MaintenanceList schedules={schedules} assetId={id} assetType="PERSON" currentMileage={null} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="font-semibold text-sm text-right">{value}</div>
    </div>
  )
}
```

(The download route and report route learn about people in Task 16; until then those two buttons 400/404.)

- [ ] **Step 6: Verify in the app**

Run: `npx tsc --noEmit && npm run lint`, then `npm run dev`:
1. Open the name-only person from Task 8 → page renders; aside shows "Allergies — None recorded", Relationship only; every tab shows its empty state. No "NaN"/"Invalid Date".
2. Upload a photo → shows on the page and on the People card.
3. Visits tab → Add Visit → category list shows Office visit…Therapy, Other; no mileage field; Provider select shows "None" (no providers yet); save with cost $150 and a PDF receipt → row appears, receipt opens.
4. Aside cost panel shows $150. `/costs` → filter "People" → $150 appears under this person.
5. Allergies → add Penicillin / Severe / Hives → aside box turns red with "Penicillin — Severe · Hives"; People list card shows "Severe allergy on file".
6. Immunizations → add Tdap given today, next due in 10 years → "Given" shows today's date (not yesterday); next due plain. Edit next due to a date before "given" → error under "Next due".
7. Reminders → add "Annual physical", every 365 days → appears; no miles fields.

- [ ] **Step 7: Verify person deletion (Review Focus 2)**

With the person from Step 6 (has a visit with a receipt and a reminder), note its id from the URL, then from the People list choose Delete. Then:
```bash
sqlite3 prisma/dev.db "select count(*) from ServiceRecord where assetType='PERSON' and assetId='<id>'; select count(*) from MaintenanceSchedule where assetId='<id>'; select count(*) from Allergy where personId='<id>'; select count(*) from Immunization where personId='<id>';"
ls uploads/people/<id> uploads/service/<visit-id> 2>&1
```
Expected: four `0`s and "No such file or directory" for both paths.

- [ ] **Step 8: Commit**

```bash
git add components/people components/health "app/(app)/assets/people/[id]"
git commit -m "feat: add person detail page with visits, allergies, immunizations and reminders"
```

---

### Task 12: Conditions and medications tabs

**Files:**
- Create: `components/health/conditions-section.tsx`, `components/health/medications-section.tsx`
- Modify: `app/(app)/assets/people/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 10 actions; `AttachmentList` with `recordType="CONDITION"` (Task 5); `isMedicationActive`, `refillDue`, `daysUntil`, `formatDay`, `CONDITION_STATUSES`.
- Produces: `ConditionsSection({ personId, conditions, providers })` with `type ConditionRow = HealthCondition & { attachments: Attachment[]; provider: { name: string } | null }`; `MedicationsSection({ personId, medications, providers, conditions })` with `type MedicationRow = Medication & { prescriber: { name: string } | null; condition: { name: string } | null }`.

- [ ] **Step 1: `components/health/conditions-section.tsx`**

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { AttachmentCount } from "@/components/attachments/attachment-count"
import { createCondition, deleteCondition, updateCondition } from "@/lib/actions/health"
import { CONDITION_STATUSES, formatDay, labelFor, toDateInput } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Attachment, HealthCondition } from "@/app/generated/prisma/client"

export type ConditionRow = HealthCondition & { attachments: Attachment[]; provider: { name: string } | null }

const STATUS_VARIANT = { ACTIVE: "destructive", MANAGED: "secondary", RESOLVED: "outline" } as const

const COLUMNS: EntityColumn<ConditionRow>[] = [
  { key: "name", label: "Condition", cell: (c) => <span className="font-medium">{c.name}</span> },
  { key: "status", label: "Status", cell: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{labelFor(CONDITION_STATUSES, c.status)}</Badge> },
  { key: "diagnosed", label: "Diagnosed", className: "whitespace-nowrap text-muted-foreground", cell: (c) => formatDay(c.diagnosedDate) },
  { key: "provider", label: "Provider", className: "text-muted-foreground", cell: (c) => c.provider?.name ?? "—" },
  { key: "files", label: "Files", cell: (c) => <AttachmentCount attachments={c.attachments} /> },
]

function initialFor(c: ConditionRow | null): FormValues {
  return {
    name: c?.name ?? "",
    status: c?.status ?? "ACTIVE",
    providerId: c?.providerId ?? "",
    diagnosedDate: toDateInput(c?.diagnosedDate),
    resolvedDate: toDateInput(c?.resolvedDate),
    notes: c?.notes ?? "",
  }
}

interface Props {
  personId: string
  conditions: ConditionRow[]
  providers: { id: string; name: string }[]
}

export function ConditionsSection({ personId, conditions, providers }: Props) {
  const [editing, setEditing] = useState<ConditionRow | null>(null)
  const [open, setOpen] = useState(false)

  const fields: FieldConfig[] = [
    { name: "name", label: "Condition", kind: "text", required: true, placeholder: "Type 2 diabetes", wide: true },
    { name: "status", label: "Status", kind: "select", required: true, options: CONDITION_STATUSES },
    { name: "providerId", label: "Treating provider", kind: "select", options: providers.map((p) => ({ value: p.id, label: p.name })) },
    { name: "diagnosedDate", label: "Diagnosed", kind: "date" },
    { name: "resolvedDate", label: "Resolved", kind: "date" },
    { name: "notes", label: "Notes", kind: "textarea", wide: true },
  ]

  async function handleDelete(c: ConditionRow) {
    if (!confirm(`Delete "${c.name}" and its files? Visits and medications linked to it are kept.`)) return
    const result = await deleteCondition(c.id)
    if (result.error) { toast.error("Delete failed."); return }
    toast.success("Condition deleted.")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{conditions.length} condition{conditions.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>Add Condition</Button>
      </div>

      <EntityTable
        rows={conditions}
        columns={COLUMNS}
        describe={(c) => c.name}
        onEdit={(c) => { setEditing(c); setOpen(true) }}
        onDelete={handleDelete}
        empty="No conditions recorded."
        renderExpanded={(c) => (
          <div className="space-y-3">
            {c.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{c.notes}</p>}
            {c.resolvedDate && <p className="text-sm text-muted-foreground">Resolved {formatDay(c.resolvedDate)}</p>}
            <AttachmentList recordId={c.id} recordType="CONDITION" attachments={c.attachments} />
          </div>
        )}
      />

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Condition" : "Add Condition"}
        submitLabel={editing ? "Save Changes" : "Add Condition"}
        successMessage={editing ? "Condition updated." : "Condition added. Expand its row to attach files."}
        fields={fields}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateCondition(editing.id, values) : createCondition(personId, values))}
      />
    </>
  )
}
```

- [ ] **Step 2: `components/health/medications-section.tsx`**

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import {
  createMedication, deleteMedication, markMedicationRefilled, updateMedication,
} from "@/lib/actions/health"
import { daysUntil, formatDay, isMedicationActive, refillDue, toDateInput } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Medication } from "@/app/generated/prisma/client"

export type MedicationRow = Medication & { prescriber: { name: string } | null; condition: { name: string } | null }

function RefillCell({ m }: { m: MedicationRow }) {
  if (!m.nextRefillDate) return <span className="text-muted-foreground">—</span>
  const now = new Date()
  if (!refillDue(m, now)) return <span className="text-muted-foreground">{formatDay(m.nextRefillDate)}</span>
  return daysUntil(m.nextRefillDate, now) < 0
    ? <Badge variant="destructive">Overdue · {formatDay(m.nextRefillDate)}</Badge>
    : <Badge variant="secondary">Due {formatDay(m.nextRefillDate)}</Badge>
}

const COLUMNS: EntityColumn<MedicationRow>[] = [
  {
    key: "name", label: "Medication",
    cell: (m) => (
      <div>
        <div className="font-medium">{m.name}</div>
        {(m.dosage || m.frequency) && (
          <div className="text-xs text-muted-foreground">{[m.dosage, m.frequency].filter(Boolean).join(" · ")}</div>
        )}
      </div>
    ),
  },
  { key: "for", label: "For", className: "text-muted-foreground", cell: (m) => m.condition?.name ?? "—" },
  { key: "prescriber", label: "Prescriber", className: "text-muted-foreground", cell: (m) => m.prescriber?.name ?? "—" },
  { key: "refill", label: "Next refill", className: "whitespace-nowrap", cell: (m) => <RefillCell m={m} /> },
]

const PAST_COLUMNS: EntityColumn<MedicationRow>[] = [
  COLUMNS[0],
  COLUMNS[1],
  { key: "ended", label: "Stopped", className: "whitespace-nowrap text-muted-foreground", cell: (m) => formatDay(m.endDate) },
]

function initialFor(m: MedicationRow | null): FormValues {
  return {
    name: m?.name ?? "",
    dosage: m?.dosage ?? "",
    frequency: m?.frequency ?? "",
    prescriberId: m?.prescriberId ?? "",
    conditionId: m?.conditionId ?? "",
    pharmacy: m?.pharmacy ?? "",
    startDate: toDateInput(m?.startDate),
    endDate: toDateInput(m?.endDate),
    refillIntervalDays: m?.refillIntervalDays?.toString() ?? "",
    nextRefillDate: toDateInput(m?.nextRefillDate),
    notes: m?.notes ?? "",
  }
}

interface Props {
  personId: string
  medications: MedicationRow[]
  providers: { id: string; name: string }[]
  conditions: { id: string; name: string }[]
}

export function MedicationsSection({ personId, medications, providers, conditions }: Props) {
  const [editing, setEditing] = useState<MedicationRow | null>(null)
  const [open, setOpen] = useState(false)

  const now = new Date()
  const active = medications.filter((m) => isMedicationActive(m, now))
  const past = medications.filter((m) => !isMedicationActive(m, now))

  const fields: FieldConfig[] = [
    { name: "name", label: "Medication", kind: "text", required: true, placeholder: "Metformin", wide: true },
    { name: "dosage", label: "Dosage", kind: "text", placeholder: "500 mg" },
    { name: "frequency", label: "Frequency", kind: "text", placeholder: "Twice daily" },
    { name: "prescriberId", label: "Prescriber", kind: "select", options: providers.map((p) => ({ value: p.id, label: p.name })) },
    { name: "conditionId", label: "For condition", kind: "select", options: conditions.map((c) => ({ value: c.id, label: c.name })) },
    { name: "startDate", label: "Started", kind: "date" },
    { name: "endDate", label: "Stopped", kind: "date" },
    { name: "refillIntervalDays", label: "Refill every (days)", kind: "number", placeholder: "30" },
    { name: "nextRefillDate", label: "Next refill", kind: "date" },
    { name: "pharmacy", label: "Pharmacy", kind: "text", placeholder: "Walgreens on Main", wide: true },
    { name: "notes", label: "Notes", kind: "textarea", wide: true },
  ]

  async function handleDelete(m: MedicationRow) {
    if (!confirm(`Delete "${m.name}"? To keep its history, set a Stopped date instead.`)) return
    const result = await deleteMedication(m.id)
    if (result.error) { toast.error("Delete failed."); return }
    toast.success("Medication deleted.")
  }

  async function handleRefilled(m: MedicationRow) {
    const result = await markMedicationRefilled(m.id)
    if (result.error) { toast.error(typeof result.error === "string" ? result.error : "Update failed."); return }
    toast.success(`${m.name}: next refill in ${m.refillIntervalDays} days.`)
  }

  const openEdit = (m: MedicationRow) => { setEditing(m); setOpen(true) }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{active.length} current · {past.length} past</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>Add Medication</Button>
      </div>

      <EntityTable
        rows={active}
        columns={COLUMNS}
        describe={(m) => m.name}
        onEdit={openEdit}
        onDelete={handleDelete}
        empty="No current medications."
        extraActions={(m) =>
          m.refillIntervalDays ? (
            <Button variant="outline" size="sm" className="h-7" onClick={() => handleRefilled(m)}>Refilled</Button>
          ) : null
        }
      />

      {past.length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Past medications</h3>
          <EntityTable rows={past} columns={PAST_COLUMNS} describe={(m) => m.name} onEdit={openEdit} onDelete={handleDelete} empty="" />
        </div>
      )}

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Medication" : "Add Medication"}
        submitLabel={editing ? "Save Changes" : "Add Medication"}
        successMessage={editing ? "Medication updated." : "Medication added."}
        fields={fields}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateMedication(editing.id, values) : createMedication(personId, values))}
      />
    </>
  )
}
```

- [ ] **Step 3: Wire into the person page** — `app/(app)/assets/people/[id]/page.tsx`

Imports: add
```tsx
import { ConditionsSection } from "@/components/health/conditions-section"
import { MedicationsSection } from "@/components/health/medications-section"
```
In the `person` query's `include`, add:
```ts
      conditions: {
        include: { attachments: true, provider: { select: { name: true } } },
        // ACTIVE < MANAGED < RESOLVED alphabetically, which is also the order that matters.
        orderBy: [{ status: "asc" }, { name: "asc" }],
      },
      medications: {
        include: { prescriber: { select: { name: true } }, condition: { select: { name: true } } },
        orderBy: { name: "asc" },
      },
```
After `const age = ...` add:
```ts
  const conditionOptions = person.conditions.map((c) => ({ id: c.id, name: c.name }))
```
In `TabsList`, after the visits trigger:
```tsx
            <TabsTrigger value="conditions">Conditions ({person.conditions.length})</TabsTrigger>
            <TabsTrigger value="medications">Medications ({person.medications.length})</TabsTrigger>
```
After the visits `TabsContent`:
```tsx
          <TabsContent value="conditions" className="mt-4">
            <ConditionsSection personId={id} conditions={person.conditions} providers={providers} />
          </TabsContent>
          <TabsContent value="medications" className="mt-4">
            <MedicationsSection personId={id} medications={person.medications} providers={providers} conditions={conditionOptions} />
          </TabsContent>
```
On `ServiceRecordList` add `conditionOptions={conditionOptions}`.

- [ ] **Step 4: Verify in the app (Review Focus 4)**

1. Conditions → add "Hypertension", Active → badge "Active". Expand the row → attach a PDF → it opens. Add a condition with Resolved before Diagnosed → error under "Resolved".
2. Visits → Add Visit → "For condition" lists Hypertension.
3. Medications → add Lisinopril 10 mg, daily, for Hypertension, refill every 30 days, next refill 3 days from now → current list shows "Due <date>" badge and a Refilled button. Click Refilled → next refill becomes 30 days from today, badge gone.
4. Edit it: Stopped = today → still under current. Stopped = yesterday → moves to "Past medications", no Refilled button.
5. Stopped before Started → error under "Stopped".
6. Delete the Hypertension condition → the medication stays with "For" = "—"; `uploads/condition/<id>` is gone.

- [ ] **Step 5: Commit**

```bash
git add components/health "app/(app)/assets/people/[id]/page.tsx"
git commit -m "feat: add conditions and medications tabs"
```

---

### Task 13: Providers page

**Files:**
- Create: `components/providers/providers-table.tsx`, `app/(app)/providers/page.tsx`

**Interfaces:**
- Consumes: `createProvider`, `updateProvider`, `deleteProvider` (Task 7), `EntityTable`, `EntityFormDialog`, `formatMoney` from `lib/costs`.
- Produces: `/providers` page; `ProvidersTable({ providers, stats })` with `stats: Record<string, { visits: number; spend: number }>`.

- [ ] **Step 1: `components/providers/providers-table.tsx`**

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { createProvider, deleteProvider, updateProvider } from "@/lib/actions/providers"
import { formatMoney } from "@/lib/costs"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Provider } from "@/app/generated/prisma/client"

const FIELDS: FieldConfig[] = [
  { name: "name", label: "Name", kind: "text", required: true, placeholder: "Dr. Maria Chen", wide: true },
  { name: "specialty", label: "Specialty", kind: "text", placeholder: "Family medicine" },
  { name: "practice", label: "Practice", kind: "text", placeholder: "Riverside Family Health" },
  { name: "phone", label: "Phone", kind: "tel", placeholder: "555-555-5555" },
  { name: "email", label: "Email", kind: "email" },
  { name: "address", label: "Address", kind: "text", wide: true },
  { name: "notes", label: "Notes", kind: "textarea", wide: true },
]

function initialFor(p: Provider | null): FormValues {
  return {
    name: p?.name ?? "", specialty: p?.specialty ?? "", practice: p?.practice ?? "",
    phone: p?.phone ?? "", email: p?.email ?? "", address: p?.address ?? "", notes: p?.notes ?? "",
  }
}

interface Props {
  providers: Provider[]
  stats: Record<string, { visits: number; spend: number }>
}

export function ProvidersTable({ providers, stats }: Props) {
  const [editing, setEditing] = useState<Provider | null>(null)
  const [open, setOpen] = useState(false)

  const columns: EntityColumn<Provider>[] = [
    {
      key: "name", label: "Provider",
      cell: (p) => (
        <div>
          <div className="font-medium">{p.name}</div>
          {p.specialty && <div className="text-xs text-muted-foreground">{p.specialty}</div>}
        </div>
      ),
    },
    { key: "practice", label: "Practice", className: "text-muted-foreground", cell: (p) => p.practice ?? "—" },
    {
      key: "phone", label: "Phone", className: "whitespace-nowrap",
      cell: (p) => (p.phone ? <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{p.phone}</a> : "—"),
    },
    { key: "visits", label: "Visits", className: "text-right text-muted-foreground", cell: (p) => stats[p.id]?.visits ?? 0 },
    { key: "spend", label: "Spend", className: "text-right whitespace-nowrap", cell: (p) => formatMoney(stats[p.id]?.spend ?? 0) },
  ]

  async function handleDelete(p: Provider) {
    if (!confirm(`Delete "${p.name}"? Visits, conditions and prescriptions keep their history but lose the link.`)) return
    const result = await deleteProvider(p.id)
    if (result.error) { toast.error("Delete failed."); return }
    toast.success("Provider deleted.")
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Providers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Doctors, dentists, therapists and clinics the household uses.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true) }}>Add Provider</Button>
      </div>

      <EntityTable
        rows={providers}
        columns={columns}
        describe={(p) => p.name}
        onEdit={(p) => { setEditing(p); setOpen(true) }}
        onDelete={handleDelete}
        empty="No providers yet. Add the doctors and clinics your household sees."
        renderExpanded={(p) => (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {p.email && <span>Email: <a href={`mailto:${p.email}`} className="hover:underline">{p.email}</a></span>}
            {p.address && <span>Address: {p.address}</span>}
            {p.notes && <span className="whitespace-pre-wrap">{p.notes}</span>}
          </div>
        )}
      />

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Provider" : "Add Provider"}
        submitLabel={editing ? "Save Changes" : "Add Provider"}
        successMessage={editing ? "Provider updated." : "Provider added."}
        fields={FIELDS}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateProvider(editing.id, values) : createProvider(values))}
      />
    </>
  )
}
```

- [ ] **Step 2: `app/(app)/providers/page.tsx`**

```tsx
import { prisma } from "@/lib/prisma"
import { ProvidersTable } from "@/components/providers/providers-table"
import { cents } from "@/lib/costs"

export default async function ProvidersPage() {
  const [providers, visits] = await Promise.all([
    prisma.provider.findMany({ orderBy: { name: "asc" } }),
    prisma.serviceRecord.groupBy({
      by: ["providerId"],
      where: { providerId: { not: null } },
      _count: { _all: true },
      _sum: { cost: true },
    }),
  ])

  const stats = Object.fromEntries(
    visits.map((v) => [v.providerId!, { visits: v._count._all, spend: cents(v._sum.cost ?? 0) }])
  )

  return (
    <div className="space-y-6">
      <ProvidersTable providers={providers} stats={stats} />
    </div>
  )
}
```

- [ ] **Step 3: Verify in the app**

1. `/providers` → empty state → add "Dr. Maria Chen", Family medicine, email "bad" → error under Email; fix → saved.
2. Open a person → Edit → Primary care provider = Dr. Chen → aside shows it, links to `/providers`.
3. Add a visit with Provider = Dr. Chen, Facility blank, cost $200 → the visit row's vendor shows "Dr. Maria Chen"; `/providers` shows Visits 1, Spend $200.00.
4. Delete Dr. Chen → person aside no longer shows primary care; the visit still exists with vendor "Dr. Maria Chen" (free text kept).

- [ ] **Step 4: Commit**

```bash
git add components/providers "app/(app)/providers"
git commit -m "feat: add providers directory"
```

---

### Task 14: Insurance

**Files:**
- Create: `lib/actions/insurance.ts`, `components/insurance/insurance-list.tsx`, `app/(app)/insurance/page.tsx`
- Modify: `app/(app)/assets/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `insuranceSchema` (Task 4), `AttachmentList` with `recordType="INSURANCE"` (Task 5), `EntityFormDialog` checkboxes field.
- Produces: `createInsurancePolicy(values)`, `updateInsurancePolicy(id, values)`, `deleteInsurancePolicy(id)`; `/insurance` page; `InsuranceList({ policies, people })` with `type PolicyRow = InsurancePolicy & { members: { id: string; name: string }[]; attachments: Attachment[] }`.

- [ ] **Step 1: `lib/actions/insurance.ts`**

```ts
"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { rm } from "fs/promises"
import { insuranceSchema } from "@/lib/health-schemas"
import { resolveUploadPath } from "@/lib/upload-path"
import type { ActionResult, FormValues } from "@/lib/form-types"

// Policies show in every covered person's aside, so the people subtree is
// revalidated along with the insurance page.
function revalidateInsurance() {
  revalidatePath("/insurance")
  revalidatePath("/assets/people", "layout")
}

export async function createInsurancePolicy(values: FormValues): Promise<ActionResult> {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = insuranceSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { memberIds, ...data } = parsed.data
  const policy = await prisma.insurancePolicy.create({
    data: { ...data, members: { connect: memberIds.map((id) => ({ id })) } },
  })
  revalidateInsurance()
  return { success: true, id: policy.id }
}

export async function updateInsurancePolicy(id: string, values: FormValues): Promise<ActionResult> {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = insuranceSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  const existing = await prisma.insurancePolicy.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return { error: "Not found" }

  const { memberIds, ...data } = parsed.data
  await prisma.insurancePolicy.update({
    where: { id },
    data: { ...data, members: { set: memberIds.map((memberId) => ({ id: memberId })) } },
  })
  revalidateInsurance()
  return { success: true }
}

export async function deleteInsurancePolicy(id: string): Promise<ActionResult> {
  const session = await auth()
  if (!session) redirect("/login")

  const existing = await prisma.insurancePolicy.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return { error: "Not found" }

  await prisma.insurancePolicy.delete({ where: { id: existing.id } })
  await rm(resolveUploadPath("insurance", existing.id), { recursive: true, force: true })
  revalidateInsurance()
  return { success: true }
}
```

- [ ] **Step 2: `components/insurance/insurance-list.tsx`**

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Pencil, Trash2 } from "lucide-react"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { createInsurancePolicy, deleteInsurancePolicy, updateInsurancePolicy } from "@/lib/actions/insurance"
import { daysUntil, formatDay, HEALTH_WINDOWS, INSURANCE_KINDS, labelFor, toDateInput } from "@/lib/health"
import { formatMoney } from "@/lib/costs"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Attachment, InsurancePolicy } from "@/app/generated/prisma/client"

export type PolicyRow = InsurancePolicy & { members: { id: string; name: string }[]; attachments: Attachment[] }

function coverageStatus(p: PolicyRow) {
  if (!p.endDate) return { label: "Active", variant: "outline" as const }
  const days = daysUntil(p.endDate, new Date())
  if (days < 0) return { label: "Ended", variant: "secondary" as const }
  if (days <= HEALTH_WINDOWS.insuranceDays) return { label: days === 0 ? "Ends today" : `Ends in ${days}d`, variant: "destructive" as const }
  return { label: "Active", variant: "outline" as const }
}

function initialFor(p: PolicyRow | null): FormValues {
  return {
    carrier: p?.carrier ?? "",
    planName: p?.planName ?? "",
    kind: p?.kind ?? "MEDICAL",
    memberId: p?.memberId ?? "",
    groupNumber: p?.groupNumber ?? "",
    policyNumber: p?.policyNumber ?? "",
    phone: p?.phone ?? "",
    startDate: toDateInput(p?.startDate),
    endDate: toDateInput(p?.endDate),
    deductible: p?.deductible?.toString() ?? "",
    outOfPocketMax: p?.outOfPocketMax?.toString() ?? "",
    memberIds: p?.members.map((m) => m.id).join(",") ?? "",
    notes: p?.notes ?? "",
  }
}

interface Props {
  policies: PolicyRow[]
  people: { id: string; name: string }[]
}

export function InsuranceList({ policies, people }: Props) {
  const [editing, setEditing] = useState<PolicyRow | null>(null)
  const [open, setOpen] = useState(false)

  const fields: FieldConfig[] = [
    { name: "carrier", label: "Carrier", kind: "text", required: true, placeholder: "Blue Cross" },
    { name: "planName", label: "Plan", kind: "text", placeholder: "PPO Family" },
    { name: "kind", label: "Type", kind: "select", required: true, options: INSURANCE_KINDS },
    { name: "memberId", label: "Member ID", kind: "text" },
    { name: "groupNumber", label: "Group number", kind: "text" },
    { name: "policyNumber", label: "Policy number", kind: "text" },
    { name: "phone", label: "Member services phone", kind: "tel" },
    { name: "startDate", label: "Coverage starts", kind: "date" },
    { name: "endDate", label: "Coverage ends", kind: "date" },
    { name: "deductible", label: "Deductible ($)", kind: "number" },
    { name: "outOfPocketMax", label: "Out-of-pocket max ($)", kind: "number" },
    { name: "memberIds", label: "Covers", kind: "checkboxes", options: people.map((p) => ({ value: p.id, label: p.name })), wide: true },
    { name: "notes", label: "Notes", kind: "textarea", wide: true },
  ]

  async function handleDelete(p: PolicyRow) {
    if (!confirm(`Delete the ${p.carrier} policy and its files?`)) return
    const result = await deleteInsurancePolicy(p.id)
    if (result.error) { toast.error("Delete failed."); return }
    toast.success("Policy deleted.")
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Insurance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Medical, dental and vision coverage, with card images.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true) }}>Add Policy</Button>
      </div>

      {policies.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">No policies yet</p>
          <p className="text-sm mt-1">Add a policy, then attach photos of the front and back of the card.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {policies.map((p) => {
            const status = coverageStatus(p)
            const rows: [string, string | null][] = [
              ["Member ID", p.memberId],
              ["Group", p.groupNumber],
              ["Policy", p.policyNumber],
              ["Phone", p.phone],
              ["Deductible", p.deductible != null ? formatMoney(p.deductible) : null],
              ["Out-of-pocket max", p.outOfPocketMax != null ? formatMoney(p.outOfPocketMax) : null],
              ["Coverage", p.startDate || p.endDate ? `${formatDay(p.startDate)} – ${formatDay(p.endDate)}` : null],
              ["Covers", p.members.length > 0 ? p.members.map((m) => m.name).join(", ") : "Nobody yet"],
            ]
            return (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{p.carrier}{p.planName ? ` · ${p.planName}` : ""}</CardTitle>
                      <div className="mt-1 flex gap-1.5">
                        <Badge variant="secondary">{labelFor(INSURANCE_KINDS, p.kind)}</Badge>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${p.carrier} policy`} onClick={() => { setEditing(p); setOpen(true) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`Delete ${p.carrier} policy`} onClick={() => handleDelete(p)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    {rows.filter(([, v]) => v).map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className={label === "Member ID" || label === "Group" || label === "Policy" ? "font-mono" : undefined}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <AttachmentList recordId={p.id} recordType="INSURANCE" attachments={p.attachments} />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Policy" : "Add Policy"}
        submitLabel={editing ? "Save Changes" : "Add Policy"}
        successMessage={editing ? "Policy updated." : "Policy added. Attach card images on its card."}
        fields={fields}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateInsurancePolicy(editing.id, values) : createInsurancePolicy(values))}
      />
    </>
  )
}
```

- [ ] **Step 3: `app/(app)/insurance/page.tsx`**

```tsx
import { prisma } from "@/lib/prisma"
import { InsuranceList } from "@/components/insurance/insurance-list"

export default async function InsurancePage() {
  const [policies, people] = await Promise.all([
    prisma.insurancePolicy.findMany({
      include: {
        members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        attachments: { orderBy: { uploadedAt: "asc" } },
      },
      orderBy: [{ kind: "asc" }, { carrier: "asc" }],
    }),
    prisma.person.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <div className="space-y-6">
      <InsuranceList policies={policies} people={people} />
    </div>
  )
}
```

- [ ] **Step 4: Insurance in the person aside** — `app/(app)/assets/people/[id]/page.tsx`

Add `ShieldPlus` to the lucide import and `INSURANCE_KINDS` to the `@/lib/health` import. In the `person` query's `include` add:
```ts
      insurancePolicies: { select: { id: true, carrier: true, planName: true, kind: true, memberId: true }, orderBy: { carrier: "asc" } },
```
In the aside, directly after the `<div className="space-y-2">…</div>` stats block, add:
```tsx
        {person.insurancePolicies.length > 0 && (
          <div className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex items-center gap-1.5 font-semibold">
              <ShieldPlus className="h-4 w-4" aria-hidden="true" /> Insurance
            </div>
            <ul className="mt-1.5 space-y-1">
              {person.insurancePolicies.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-2">
                  <Link href="/insurance" className="hover:underline">{p.carrier}{p.planName ? ` · ${p.planName}` : ""}</Link>
                  <span className="text-right text-xs text-muted-foreground">
                    {labelFor(INSURANCE_KINDS, p.kind)}{p.memberId ? ` · ${p.memberId}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
```

- [ ] **Step 5: Verify in the app**

1. `/insurance` → Add Policy: Blue Cross, Medical, member ID, covers two people, ends 30 days from now → card shows "Ends in 30d" (red), covers both names, IDs in monospace.
2. End date before start → error under "Coverage ends".
3. On the card, attach a JPG of the card front → listed and opens.
4. Open a covered person → aside shows "Blue Cross · Medical · <member id>". Uncheck that person on the policy → aside no longer shows it.
5. Upload aimed at a missing policy (Review Focus 3), in devtools:
   ```js
   const f = new FormData(); f.append("file", new File(["x"], "a.pdf")); f.append("recordId", "nope"); f.append("recordType", "INSURANCE");
   (await fetch("/api/uploads", { method: "POST", body: f })).status
   ```
   Expected `404`; no `uploads/insurance/nope`. Repeat with `recordType` `CONDITION` → `404`.
6. Delete the policy → card gone; `uploads/insurance/<id>` gone; person aside updated.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/insurance.ts components/insurance "app/(app)/insurance" "app/(app)/assets/people/[id]/page.tsx"
git commit -m "feat: add insurance policies with card attachments"
```

---

## Phase 5 — Notifications, report, download, demo data

### Task 15: Health notifications

**Files:**
- Modify: `lib/notifications/checker.ts`, `app/(app)/notifications/page.tsx`

**Interfaces:**
- Consumes: `refillDue`, `immunizationDue`, `insuranceExpiring`, `daysUntil`, `HEALTH_WINDOWS` (Task 4); `NotificationType` values (Task 3).
- Produces: notifications of type `MEDICATION_REFILL` (`relatedEntityType: "Medication"`), `IMMUNIZATION_DUE` (`"Immunization"`), `INSURANCE_EXPIRING` (`"InsurancePolicy"`), one per user per entity while unread (existing dedup).

- [ ] **Step 1: Checker** — `lib/notifications/checker.ts`

Add import:
```ts
import { daysUntil, HEALTH_WINDOWS, immunizationDue, insuranceExpiring, refillDue } from "@/lib/health"
```
Add below `const plural = ...`:
```ts
const DAY = 86_400_000

// "is due in 3 days" / "is due today" / "was due 2 days ago".
function dueWhen(days: number) {
  if (days < 0) return `was due ${plural(-days, "day")} ago`
  if (days === 0) return "is due today"
  return `is due in ${plural(days, "day")}`
}
```
Replace the `Promise.all` destructuring with:
```ts
  const [schedules, mileage, warranties, medications, immunizations, policies] = await Promise.all([
    prisma.maintenanceSchedule.findMany({ where: dueCandidateFilter(MAINTENANCE_WINDOW_DAYS, now) }),
    loadVehicleMileage(),
    prisma.warranty.findMany({
      where: {
        expirationDate: {
          gte: now,
          lte: new Date(now.getTime() + WARRANTY_WARN_DAYS * 86400000),
        },
      },
    }),
    // The date filters only narrow the read; refillDue / immunizationDue /
    // insuranceExpiring below are the rules, shared with the UI badges.
    prisma.medication.findMany({
      where: { nextRefillDate: { lte: new Date(now.getTime() + HEALTH_WINDOWS.refillDays * DAY) } },
      include: { person: { select: { name: true } } },
    }),
    prisma.immunization.findMany({
      where: { nextDueDate: { lte: new Date(now.getTime() + HEALTH_WINDOWS.immunizationDays * DAY) } },
      include: { person: { select: { name: true } } },
    }),
    prisma.insurancePolicy.findMany({
      where: { endDate: { gte: now, lte: new Date(now.getTime() + HEALTH_WINDOWS.insuranceDays * DAY) } },
    }),
  ])
```
After the warranty loop and before `if (wanted.length === 0) return 0`, add:
```ts
  for (const m of medications) {
    if (!refillDue(m, now)) continue
    const days = daysUntil(m.nextRefillDate!, now)
    for (const user of users) {
      wanted.push({
        userId: user.id,
        type: "MEDICATION_REFILL",
        title: `Refill: ${m.name} (${m.person.name})`,
        message: `${m.person.name}'s ${m.name} refill ${dueWhen(days)}.`,
        relatedEntityId: m.id,
        relatedEntityType: "Medication",
      })
    }
  }

  for (const i of immunizations) {
    if (!immunizationDue(i, now)) continue
    const days = daysUntil(i.nextDueDate!, now)
    for (const user of users) {
      wanted.push({
        userId: user.id,
        type: "IMMUNIZATION_DUE",
        title: `Vaccine due: ${i.vaccine} (${i.person.name})`,
        message: `${i.person.name}'s ${i.vaccine} ${dueWhen(days)}.`,
        relatedEntityId: i.id,
        relatedEntityType: "Immunization",
      })
    }
  }

  for (const p of policies) {
    if (!insuranceExpiring(p, now)) continue
    const days = daysUntil(p.endDate!, now)
    const name = p.planName ? `${p.carrier} ${p.planName}` : p.carrier
    for (const user of users) {
      wanted.push({
        userId: user.id,
        type: "INSURANCE_EXPIRING",
        title: `Insurance ending: ${name}`,
        message: days === 0 ? `"${name}" coverage ends today.` : `"${name}" coverage ends in ${plural(days, "day")}.`,
        relatedEntityId: p.id,
        relatedEntityType: "InsurancePolicy",
      })
    }
  }
```
Update the function's doc comment first line to: "Creates in-app notifications for due maintenance, expiring warranties, and health items (refills, vaccines, insurance)."

- [ ] **Step 2: Icons** — `app/(app)/notifications/page.tsx`

```tsx
import { Bell, Wrench, ShieldCheck, Pill, Syringe, ShieldPlus } from "lucide-react"

const typeIcon: Record<string, React.ElementType> = {
  MAINTENANCE_DUE: Wrench,
  WARRANTY_EXPIRING: ShieldCheck,
  MEDICATION_REFILL: Pill,
  IMMUNIZATION_DUE: Syringe,
  INSURANCE_EXPIRING: ShieldPlus,
  CUSTOM: Bell,
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`.
With data from Tasks 12/14 (a medication with next refill ≤7 days, a policy ending ≤60 days) plus an immunization due in 10 days and a medication that **ended yesterday** with an overdue refill date: restart `npm run dev` (the scheduler runs a boot check a few seconds after start; the log prints how many it created). `/notifications` shows exactly one refill (the active med), one vaccine and one insurance notice, each with its icon — nothing for the ended medication. Restart again → no duplicates.

- [ ] **Step 4: Commit**

```bash
git add lib/notifications/checker.ts "app/(app)/notifications/page.tsx"
git commit -m "feat: notify on refills, vaccines due and expiring insurance"
```

---

### Task 16: Medical summary report and download-all

**Files:**
- Create: `components/report/report-parts.tsx`, `components/report/health-summary.tsx`
- Modify: `lib/report-server.ts`, `components/report/asset-report.tsx`, `app/reports/[type]/[id]/page.tsx`, `app/api/assets/[type]/[id]/download/route.ts`

**Interfaces:**
- Consumes: Tasks 3–14.
- Produces: `ReportData.health: ReportHealth | null`; `type ReportHealth = { person: ReportPerson; careTeam: Provider[] }`; `SectionTitle`, `Empty` exported from `report-parts.tsx`; `HealthSummary({ health, now })`; `/reports/people/[id]`; `/api/assets/people/[id]/download` including condition and insurance files.

- [ ] **Step 1: Extract shared report parts**

Create `components/report/report-parts.tsx`. Move the `SectionTitle` and `Empty` functions **verbatim** out of `components/report/asset-report.tsx` into it and prefix each with `export`. In `asset-report.tsx` add `import { Empty, SectionTitle } from "./report-parts"`. Run `npx tsc --noEmit` → clean.

- [ ] **Step 2: Report data** — `lib/report-server.ts`

Imports: add `import { ageFrom, formatDay, labelFor, RELATIONSHIPS } from "@/lib/health"` and add `Provider` to the `@/app/generated/prisma/client` type import.

Below `withAttachments`, add:
```ts
const healthInclude = {
  primaryProvider: true,
  allergies: { orderBy: [{ severity: "desc" }, { substance: "asc" }] },
  conditions: {
    include: { provider: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  },
  medications: { include: { prescriber: { select: { name: true } } }, orderBy: { name: "asc" } },
  immunizations: { orderBy: { dateGiven: "desc" } },
  insurancePolicies: { orderBy: { carrier: "asc" } },
} satisfies Prisma.PersonInclude

export type ReportPerson = Prisma.PersonGetPayload<{ include: typeof healthInclude }>
export type ReportHealth = { person: ReportPerson; careTeam: Provider[] }
```
Add `health: ReportHealth | null` to `ReportData` (after `costRows`).

In `loadReport`, replace the final `return` with:
```ts
  const health = assetType === "PERSON" ? await loadHealth(assetId) : null

  return { asset, services, warranties, schedules, costRows, health, generatedAt: new Date() }
```
Add below `loadReport`:
```ts
async function loadHealth(personId: string): Promise<ReportHealth | null> {
  const [person, careTeam] = await Promise.all([
    prisma.person.findUnique({ where: { id: personId }, include: healthInclude }),
    // Everyone involved in this person's care, from any direction.
    prisma.provider.findMany({
      where: {
        OR: [
          { primaryFor: { some: { id: personId } } },
          { conditions: { some: { personId } } },
          { prescriptions: { some: { personId } } },
          { serviceRecords: { some: { assetType: "PERSON", assetId: personId } } },
        ],
      },
      orderBy: { name: "asc" },
    }),
  ])
  return person ? { person, careTeam } : null
}
```
In `loadAsset`, replace the interim `if (assetType === "PERSON") return null` with:
```ts
  if (assetType === "PERSON") {
    const p = await prisma.person.findUnique({
      where: { id: assetId },
      include: { primaryProvider: { select: { name: true } } },
    })
    if (!p) return null
    const relationship = labelFor(RELATIONSHIPS, p.relationship)
    const age = p.dateOfBirth ? ageFrom(p.dateOfBirth, new Date()) : null
    return {
      type: "PERSON",
      id: p.id,
      name: p.name,
      subtitle: age != null ? `${relationship} · Age ${age}` : relationship,
      imageFilename: p.imageFilename,
      purchaseDate: null,
      purchasePrice: null,
      notes: p.notes,
      meterUnit: null,
      currentMeter: null,
      details: [
        { label: "Relationship", value: relationship },
        ...(p.dateOfBirth ? [{ label: "Date of birth", value: formatDay(p.dateOfBirth) }] : []),
        ...(p.sex ? [{ label: "Sex", value: p.sex }] : []),
        ...(p.bloodType ? [{ label: "Blood type", value: p.bloodType }] : []),
        ...(p.primaryProvider ? [{ label: "Primary care", value: p.primaryProvider.name }] : []),
      ],
    }
  }
```

- [ ] **Step 3: `components/report/health-summary.tsx`**

```tsx
import { Empty, SectionTitle } from "./report-parts"
import { formatMoney } from "@/lib/costs"
import {
  ALLERGY_SEVERITIES, CONDITION_STATUSES, formatDay, INSURANCE_KINDS, isMedicationActive, labelFor,
} from "@/lib/health"
import type { ReportHealth } from "@/lib/report-server"

// Ordered the way a clinician reads a chart: what could hurt them, what they
// have, what they take, what they've had, who pays, who treats them.
export function HealthSummary({ health, now }: { health: ReportHealth; now: Date }) {
  const { person, careTeam } = health
  const conditions = person.conditions.filter((c) => c.status !== "RESOLVED")
  const resolved = person.conditions.length - conditions.length
  const medications = person.medications.filter((m) => isMedicationActive(m, now))

  return (
    <>
      <section className="report-section report-break-avoid mt-7">
        <SectionTitle>Allergies</SectionTitle>
        {person.allergies.length === 0 ? (
          <Empty>No allergies recorded.</Empty>
        ) : (
          <Rows
            head={["Substance", "Severity", "Reaction"]}
            rows={person.allergies.map((a) => [
              a.substance,
              // Spelled out in capitals, not coloured: it has to survive a monochrome printer.
              a.severity === "SEVERE" ? <strong key="s">SEVERE</strong> : labelFor(ALLERGY_SEVERITIES, a.severity),
              a.reaction ?? "—",
            ])}
          />
        )}
      </section>

      <section className="report-section report-break-avoid mt-7">
        <SectionTitle>Active conditions</SectionTitle>
        {conditions.length === 0 ? (
          <Empty>No active conditions recorded.</Empty>
        ) : (
          <Rows
            head={["Condition", "Status", "Since", "Provider"]}
            rows={conditions.map((c) => [c.name, labelFor(CONDITION_STATUSES, c.status), formatDay(c.diagnosedDate), c.provider?.name ?? "—"])}
          />
        )}
        {resolved > 0 && <Empty>{resolved} resolved condition{resolved === 1 ? "" : "s"} not shown.</Empty>}
      </section>

      <section className="report-section report-break-avoid mt-7">
        <SectionTitle>Current medications</SectionTitle>
        {medications.length === 0 ? (
          <Empty>No current medications.</Empty>
        ) : (
          <Rows
            head={["Medication", "Dose", "Prescriber", "Since"]}
            rows={medications.map((m) => [
              m.name,
              [m.dosage, m.frequency].filter(Boolean).join(" · ") || "—",
              m.prescriber?.name ?? "—",
              formatDay(m.startDate),
            ])}
          />
        )}
      </section>

      <section className="report-section report-break-avoid mt-7">
        <SectionTitle>Immunizations</SectionTitle>
        {person.immunizations.length === 0 ? (
          <Empty>No immunizations recorded.</Empty>
        ) : (
          <Rows
            head={["Vaccine", "Given", "Next due"]}
            rows={person.immunizations.map((i) => [i.dose ? `${i.vaccine} (${i.dose})` : i.vaccine, formatDay(i.dateGiven), formatDay(i.nextDueDate)])}
          />
        )}
      </section>

      <section className="report-section report-break-avoid mt-7">
        <SectionTitle>Insurance</SectionTitle>
        {person.insurancePolicies.length === 0 ? (
          <Empty>No insurance on file.</Empty>
        ) : (
          <Rows
            head={["Carrier", "Type", "Member ID", "Group", "Phone", "Deductible"]}
            rows={person.insurancePolicies.map((p) => [
              p.planName ? `${p.carrier} · ${p.planName}` : p.carrier,
              labelFor(INSURANCE_KINDS, p.kind),
              p.memberId ?? "—",
              p.groupNumber ?? "—",
              p.phone ?? "—",
              p.deductible != null ? formatMoney(p.deductible) : "—",
            ])}
          />
        )}
      </section>

      <section className="report-section report-break-avoid mt-7">
        <SectionTitle>Care team</SectionTitle>
        {careTeam.length === 0 ? (
          <Empty>No providers linked.</Empty>
        ) : (
          <Rows
            head={["Provider", "Specialty", "Practice", "Phone"]}
            rows={careTeam.map((p) => [p.name, p.specialty ?? "—", p.practice ?? "—", p.phone ?? "—"])}
          />
        )}
      </section>
    </>
  )
}

function Rows({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <table className="mt-1 w-full border-collapse text-[10pt]">
      <thead>
        <tr>
          {head.map((h) => (
            <th
              key={h}
              className="border-b py-1.5 pr-3 text-left text-[8.5pt] font-semibold uppercase tracking-wide"
              style={{ borderColor: "var(--rule-strong)", color: "var(--ink-faint)" }}
              data-print-color=""
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className="border-b py-1.5 pr-3 align-top" style={{ borderColor: "var(--rule)" }} data-print-color="">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Person wording in `components/report/asset-report.tsx`**

1. Add `import { HealthSummary } from "./health-summary"`.
2. In `AssetReport`, after the destructuring line add `const isPerson = asset.type === "PERSON"`.
3. Masthead: `kind={isPerson ? "Medical summary" : assetLabel[asset.type]}`.
4. `<SectionTitle>Asset details</SectionTitle>` → `<SectionTitle>{isPerson ? "Personal details" : "Asset details"}</SectionTitle>`.
5. Immediately after that details `</section>`, add `{data.health && <HealthSummary health={data.health} now={now} />}`.
6. Summary stats: `label="Service cost to date"` → `label={isPerson ? "Medical spend to date" : "Service cost to date"}`; `label="Service records"` → `label={isPerson ? "Visits" : "Service records"}`; replace the Warranties `<Stat …/>` with:
   ```tsx
          {isPerson ? (
            <Stat
              label="Active conditions"
              value={String(data.health?.person.conditions.filter((c) => c.status !== "RESOLVED").length ?? 0)}
            />
          ) : (
            <Stat
              label="Warranties"
              value={`${activeWarranties} active`}
              note={warranties.length > activeWarranties ? `${warranties.length} on file` : undefined}
            />
          )}
   ```
7. `<Warranties warranties={warranties} now={now} />` → `{!isPerson && <Warranties warranties={warranties} now={now} />}`.
8. In `ServiceHistory`: `<SectionTitle>Service history</SectionTitle>` → `<SectionTitle>{asset.type === "PERSON" ? "Visits & expenses" : "Service history"}</SectionTitle>` and its `<Empty>No service has been recorded for this asset.</Empty>` → `<Empty>{asset.type === "PERSON" ? "No visits have been recorded." : "No service has been recorded for this asset."}</Empty>`.
9. In `Maintenance`, wrap its `SectionTitle` text the same way: `{asset.type === "PERSON" ? "Health reminders" : <existing text>}`.
10. Footer: `{asset.name} · {assetLabel[asset.type]} report · generated` → `{asset.name} · {isPerson ? "medical summary" : `${assetLabel[asset.type]} report`} · generated`.

- [ ] **Step 5: Report page title** — `app/reports/[type]/[id]/page.tsx`

In `generateMetadata`:
```ts
  return { title: data ? `${data.asset.name} — ${assetType === "PERSON" ? "Medical Summary" : "Asset Report"}` : "Report" }
```

- [ ] **Step 6: Replace the download route** — `app/api/assets/[type]/[id]/download/route.ts`

```ts
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { zipSync, strToU8 } from "fflate"
import { readFileSync, existsSync } from "fs"
import { parseAssetSegment } from "@/lib/report-server"
import { resolveUploadPath } from "@/lib/upload-path"

// Folder names inside the zip. originalName is client-supplied, so slashes are
// flattened too — a name like "../../x" must not climb out when unzipped.
const safe = (s: string) => s.replace(/[^a-z0-9]/gi, "_")
const leaf = (s: string) => s.replace(/[\\/]/g, "_")

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { type, id } = await params
  const assetType = parseAssetSegment(type)
  if (!assetType) return NextResponse.json({ error: "Invalid asset type" }, { status: 400 })
  const isPerson = assetType === "PERSON"

  const [serviceAttachments, warrantyAttachments, conditionAttachments, insuranceAttachments] = await Promise.all([
    prisma.attachment.findMany({
      where: { serviceRecordId: { not: null }, serviceRecord: { assetId: id, assetType } },
      include: { serviceRecord: { select: { title: true, date: true } } },
    }),
    prisma.attachment.findMany({
      where: { warrantyId: { not: null }, warranty: { assetId: id, assetType } },
      include: { warranty: { select: { productName: true } } },
    }),
    isPerson
      ? prisma.attachment.findMany({
          where: { healthCondition: { personId: id } },
          include: { healthCondition: { select: { name: true } } },
        })
      : Promise.resolve([]),
    isPerson
      ? prisma.attachment.findMany({
          where: { insurancePolicy: { members: { some: { id } } } },
          include: { insurancePolicy: { select: { carrier: true } } },
        })
      : Promise.resolve([]),
  ])

  const files: Record<string, Uint8Array> = {}
  function add(zipPath: string, ...segments: string[]) {
    const filePath = resolveUploadPath(...segments)
    if (existsSync(filePath)) files[zipPath] = new Uint8Array(readFileSync(filePath))
  }

  for (const a of serviceAttachments) {
    const date = a.serviceRecord?.date ? new Date(a.serviceRecord.date).toISOString().split("T")[0] : "unknown"
    add(`service/${date}_${safe(a.serviceRecord?.title ?? "service")}/${leaf(a.originalName)}`, "service", a.serviceRecordId!, a.filename)
  }
  for (const a of warrantyAttachments) {
    add(`warranties/${safe(a.warranty?.productName ?? "warranty")}/${leaf(a.originalName)}`, "warranty", a.warrantyId!, a.filename)
  }
  for (const a of conditionAttachments) {
    add(`conditions/${safe(a.healthCondition?.name ?? "condition")}/${leaf(a.originalName)}`, "condition", a.healthConditionId!, a.filename)
  }
  for (const a of insuranceAttachments) {
    add(`insurance/${safe(a.insurancePolicy?.carrier ?? "policy")}/${leaf(a.originalName)}`, "insurance", a.insurancePolicyId!, a.filename)
  }

  if (Object.keys(files).length === 0) {
    files["README.txt"] = strToU8("No attachments found for this asset.")
  }

  const zipped = zipSync(files, { level: 6 })

  return new NextResponse(zipped, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="homecenter-${type}-${id}.zip"`,
    },
  })
}
```

- [ ] **Step 7: Verify in the app (Review Focus 5)**

1. Full person (allergies, conditions, meds, immunizations, insurance, visits) → "Medical summary" → sections in order Personal details, Allergies (SEVERE in caps), Active conditions, Current medications (ended ones absent), Immunizations, Insurance, Care team, Summary, Visits & expenses, Health reminders. No Warranties section. Browser tab title "<name> — Medical Summary". Print preview fits the page width.
2. Name-only person → report renders; every section shows its "No … recorded" line; no "Invalid Date"/"NaN".
3. A house report is unchanged (Asset details, Warranties present).
4. "Download all files" on the full person → zip has `service/…`, `conditions/…`, `insurance/…` folders with the uploaded files.
5. A vehicle's download still works.

- [ ] **Step 8: Commit**

```bash
git add lib/report-server.ts components/report "app/reports/[type]/[id]/page.tsx" "app/api/assets/[type]/[id]/download/route.ts"
git commit -m "feat: add printable medical summary and person file download"
```

---

### Task 17: Demo data and final verification

**Files:**
- Modify: `prisma/seed-demo.ts`, `DEMO-DATA.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `seedPeople(userId: string): Promise<void>` in the demo seeder.

- [ ] **Step 1: Seeder bookkeeping** — `prisma/seed-demo.ts`

```ts
const MANAGED_DIRS = ["properties", "vehicles", "equipment", "people", "service", "warranty", "maintenance", "condition", "insurance"]
```
In `wipe()`, directly after `await prisma.maintenanceSchedule.deleteMany()` add (order matters — children before parents):
```ts
  await prisma.medication.deleteMany()
  await prisma.healthCondition.deleteMany()
  await prisma.allergy.deleteMany()
  await prisma.immunization.deleteMany()
  await prisma.insurancePolicy.deleteMany()
  await prisma.person.deleteMany()
  await prisma.provider.deleteMany()
```

- [ ] **Step 2: Add `seedPeople`** — above `// ─── Seed ───`:

```ts
// ─── People ──────────────────────────────────────────────────────────────────

type VisitSeed = {
  personId: string
  providerId: string | null
  conditionId: string | null
  vendor: string
  days: number
  title: string
  category: "OFFICE_VISIT" | "DENTAL" | "PRESCRIPTION"
  cost: number
}

async function seedPeople(userId: string) {
  const drChen = await prisma.provider.create({ data: { name: "Dr. Maria Chen", specialty: "Family medicine", practice: "Riverside Family Health", phone: "555-201-4410" } })
  const drPatel = await prisma.provider.create({ data: { name: "Dr. Anil Patel", specialty: "Dentistry", practice: "Bright Smile Dental", phone: "555-201-8832" } })
  const drOkafor = await prisma.provider.create({ data: { name: "Dr. Grace Okafor", specialty: "Pediatrics", practice: "Riverside Family Health", phone: "555-201-4411" } })

  const adult = await prisma.person.create({ data: { name: ADMIN_NAME, relationship: "SELF", dateOfBirth: new Date("1984-03-12"), bloodType: "O+", primaryProviderId: drChen.id } })
  const child = await prisma.person.create({ data: { name: "Sam Rivera", relationship: "CHILD", dateOfBirth: new Date("2016-08-30"), primaryProviderId: drOkafor.id } })

  const hypertension = await prisma.healthCondition.create({ data: { personId: adult.id, name: "Hypertension", status: "MANAGED", diagnosedDate: at(-900), providerId: drChen.id } })
  await prisma.healthCondition.create({ data: { personId: child.id, name: "Seasonal asthma", status: "ACTIVE", diagnosedDate: at(-500), providerId: drOkafor.id } })

  await prisma.medication.create({ data: { personId: adult.id, name: "Lisinopril", dosage: "10 mg", frequency: "Once daily", prescriberId: drChen.id, conditionId: hypertension.id, startDate: at(-890), refillIntervalDays: 30, nextRefillDate: at(4), pharmacy: "Walgreens on Main" } })
  await prisma.medication.create({ data: { personId: child.id, name: "Amoxicillin", dosage: "250 mg", frequency: "Three times daily", prescriberId: drOkafor.id, startDate: at(-200), endDate: at(-190) } })

  await prisma.allergy.create({ data: { personId: child.id, substance: "Penicillin", severity: "SEVERE", reaction: "Hives, facial swelling" } })
  await prisma.allergy.create({ data: { personId: adult.id, substance: "Pollen", severity: "MILD", reaction: "Sneezing" } })

  await prisma.immunization.create({ data: { personId: adult.id, vaccine: "Tdap", dateGiven: at(-3400), nextDueDate: at(250) } })
  await prisma.immunization.create({ data: { personId: child.id, vaccine: "Influenza", dateGiven: at(-340), nextDueDate: at(20) } })

  const both = { connect: [{ id: adult.id }, { id: child.id }] }
  await prisma.insurancePolicy.create({ data: { carrier: "Blue Cross", planName: "PPO Family", kind: "MEDICAL", memberId: "XJH448201", groupNumber: "77120", phone: "800-555-0199", startDate: at(-600), endDate: at(45), deductible: 3000, outOfPocketMax: 8000, members: both } })
  await prisma.insurancePolicy.create({ data: { carrier: "Delta Dental", kind: "DENTAL", memberId: "DD-5521", startDate: at(-600), members: both } })

  const visits: VisitSeed[] = [
    { personId: adult.id, providerId: drChen.id, conditionId: hypertension.id, vendor: drChen.name, days: -60, title: "Blood pressure follow-up", category: "OFFICE_VISIT", cost: 45 },
    { personId: adult.id, providerId: drChen.id, conditionId: null, vendor: drChen.name, days: -200, title: "Annual physical", category: "OFFICE_VISIT", cost: 0 },
    { personId: adult.id, providerId: drPatel.id, conditionId: null, vendor: drPatel.name, days: -120, title: "Dental cleaning", category: "DENTAL", cost: 85 },
    { personId: child.id, providerId: drOkafor.id, conditionId: null, vendor: drOkafor.name, days: -195, title: "Ear infection", category: "OFFICE_VISIT", cost: 35 },
    { personId: child.id, providerId: null, conditionId: null, vendor: "Walgreens on Main", days: -194, title: "Amoxicillin prescription", category: "PRESCRIPTION", cost: 12.5 },
  ]
  for (const v of visits) {
    const record = await prisma.serviceRecord.create({
      data: {
        assetType: "PERSON", assetId: v.personId, date: at(v.days), title: v.title, category: v.category,
        cost: v.cost, vendor: v.vendor, providerId: v.providerId, conditionId: v.conditionId, createdById: userId,
      },
    })
    await attach("SERVICE", record.id, userId, `${v.title}.pdf`, [v.title, v.vendor, `Amount due: $${v.cost.toFixed(2)}`])
  }

  await prisma.maintenanceSchedule.create({ data: { assetType: "PERSON", assetId: adult.id, title: "Annual physical", intervalDays: 365, nextDueDate: at(165) } })
  await prisma.maintenanceSchedule.create({ data: { assetType: "PERSON", assetId: child.id, title: "Dental cleaning", intervalDays: 180, nextDueDate: at(10) } })
}
```

In `main()`, immediately before the line `const jobs: PhotoJob[] = [`, add:
```ts
  console.log("  Creating people…")
  await seedPeople(user.id)
```
In the final summary `console.log`, add a line after the attachments line:
```ts
    ${await prisma.person.count()} people, ${await prisma.provider.count()} providers, ${await prisma.insurancePolicy.count()} insurance policies
```

- [ ] **Step 3: Run the seeder against a scratch database** (never the real one — it wipes)

```bash
DATABASE_URL="file:./prisma/demo.db" npx prisma migrate deploy
DATABASE_URL="file:./prisma/demo.db" UPLOAD_DIR="./uploads-demo" npx tsx prisma/seed-demo.ts --yes --no-images
```
Expected: "Done." with "2 people, 3 providers, 2 insurance policies". Then
`DATABASE_URL="file:./prisma/demo.db" UPLOAD_DIR="./uploads-demo" npm run dev`, sign in as the demo user and click through People → both people; Sam's aside is red for Penicillin; `/notifications` after the boot check shows the Lisinopril refill, Sam's flu vaccine, the Blue Cross expiry, and Sam's dental cleaning reminder. Delete `prisma/demo.db` and `uploads-demo/` afterwards (do not commit them).

- [ ] **Step 4: Document** — `DEMO-DATA.md`

Add a "People" bullet to its dataset description: two people (the demo user and a child), three providers, a managed condition with a medication due for refill, a severe penicillin allergy, two policies (one expiring within 60 days), five visits with PDF receipts, and two health reminders.

- [ ] **Step 5: Full verification**

Run:
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```
Expected: all pass; `next build` lists `/assets/people`, `/assets/people/[id]`, `/providers`, `/insurance`.

Then walk the five Review Focus items once more on the real dev database and confirm each.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed-demo.ts DEMO-DATA.md
git commit -m "chore: add people and health records to demo data"
```

