# Paperless-ngx One-Way Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An optional, off-by-default Paperless-ngx integration that imports documents into attachments and Intake as local copies with a pointer, and a scheduled check that refreshes changed copies.

**Architecture:** A small Paperless API client (injectable `fetch`) feeds an import service that reuses the existing upload row-creation path, writes OCR text straight into `AttachmentText` as `DONE`, and records version pointers on `Attachment`. A scheduler modelled on the backup scheduler runs a pure change-detection plan per row. Settings live in a `PaperlessSettings` singleton like `LlmSettings`.

**Tech Stack:** Next.js (this repo's version differs from what you know: read the relevant guide in `node_modules/next/dist/docs/` before writing route handlers or pages), Prisma + SQLite, vitest, zod, existing `lib/secret-box.ts`.

**Spec:** `docs/superpowers/specs/2026-11-04-paperless-import-design.md`

## Global Constraints

- Feature **off by default**; `PaperlessSettings.enabled` default `false`, `schedule` default `OFF`, `access` default `EVERYONE`.
- Do **not** commit. Leave all changes in the working tree and report what changed. Tell any subagent the same.
- Token only in `apiTokenEnc` via `lib/secret-box.ts`; never logged, never in client-visible errors, never sent to the browser.
- Imported file is the **original** (`/api/documents/{id}/download/?original=true`), type-checked against `UPLOAD_TYPES`, size-capped by `maxUploadBytes()`.
- A row is marked `MISSING` only after a confirmed 404 on a direct request. Outage, 401 or malformed response fails the whole run and changes no rows.
- Changed file: replace in place, set `paperlessUpdatedAt`; never overwrite `originalName`.
- All `/api/paperless/*` routes: session required, 404 while disabled, and admin required (404 otherwise) when `access = ADMIN`. Settings, "Check now": admin only.
- LAN base URLs must remain allowed. Never forward the token across an origin change on redirect.
- After dependency or code changes run `npm ci`, then `npx eslint`, `npx tsc --noEmit`, `npx vitest run`. (Known unrelated tsc error: `.next/dev/types/validator.ts routes.d.ts is not a module`.)
- Test server for manual validation: `http://192.168.68.119:8777/`, token in untracked `paperless.txt` (read it with `tr -d '\r\n '`; never print it). Paperless-ngx 3.4.2, API v10, currently empty.

## Review Focus

- Base URL with a path prefix or trailing slash (`https://host/paperless/`): requests must hit `<prefix>/api/...`. Pinned in Task 2.
- Paperless outage or 401 mid-run must not mark anything `MISSING` or wipe text. Pinned in Tasks 4 and 6.
- Unsupported extension (e.g. `.eml` is fine, `.exe`/no extension is not) and oversize document: clear refusal, nothing written to disk or DB. Pinned in Task 5.
- User picks a version id or a document whose `root_document` differs: pointer must be the root id. Pinned in Task 5.
- Importing the same document twice onto one record, and a document with empty `content` (must stay `PENDING` for local OCR). Pinned in Task 5.

---

### Task 1: Schema, migration, gitignore

**Files:**
- Modify: `prisma/schema.prisma` (Attachment `:658`, add models near `DocumentSettings`)
- Create: `prisma/migrations/20261104120000_paperless_import/migration.sql`
- Modify: `.gitignore` (add `paperless.txt`)

**Interfaces:**
- Produces: enums `AttachmentSource { LOCAL PAPERLESS }`, `PaperlessLinkStatus { OK MISSING }`, `PaperlessAccess { EVERYONE ADMIN }`, `PaperlessSchedule { OFF DAILY WEEKLY }`; `Attachment` columns `source AttachmentSource @default(LOCAL)`, `paperlessId Int?`, `paperlessVersionId Int?`, `paperlessChecksum String?`, `paperlessTextHash String?`, `paperlessLinkStatus PaperlessLinkStatus?`, `paperlessSyncedAt DateTime?`, `paperlessUpdatedAt DateTime?`, `@@index([paperlessId])`; model `PaperlessSettings` (`id @default("singleton")`, `enabled Boolean @default(false)`, `baseUrl String?`, `apiTokenEnc String?`, `access PaperlessAccess @default(EVERYONE)`, `schedule PaperlessSchedule @default(OFF)`, `time String @default("03:30")`, `weekday Int @default(0)`, `lastCheckedAt DateTime?`, `lastCheckSummary String?`, `lastCheckError String?`, `updatedAt @updatedAt`). Regenerated Prisma client.

- [ ] **Step 1:** Edit `schema.prisma` with the above; add `paperless.txt` to `.gitignore`.
- [ ] **Step 2:** Generate the migration SQL with `npx prisma migrate dev --create-only --name paperless_import`; check it only adds columns/tables (no drops) and that existing rows get `source = 'LOCAL'`.
- [ ] **Step 3:** Run `npx prisma migrate dev` against a scratch DB (set `DATABASE_URL` to a temp file) then `npx prisma generate`. Expected: applies cleanly.
- [ ] **Step 4:** Run `npx vitest run lib/backup` . Expected: PASS (backup snapshot tests still green with the new migration as latest).

### Task 2: Paperless API client

**Files:**
- Create: `lib/paperless/client.ts`, `lib/paperless/client.test.ts`

**Interfaces:**
- Produces:
  - `type PaperlessErrorKind = "unreachable" | "unauthorized" | "not_found" | "bad_response" | "too_large"`
  - `class PaperlessError extends Error { kind: PaperlessErrorKind }` (messages are fixed phrases; never contain the token or URL query)
  - `type PaperlessVersion = { id: number; checksum: string; isRoot: boolean; added: string }`
  - `type PaperlessDoc = { id: number; rootId: number; title: string; originalFileName: string; mimeType: string; content: string; pageCount: number | null; modified: string; deletedAt: string | null; versions: PaperlessVersion[] }`
  - `createPaperlessClient(opts: { baseUrl: string; token: string; fetchImpl?: typeof fetch; timeoutMs?: number }): PaperlessClient`
  - `PaperlessClient`: `status(): Promise<{ version: string }>`, `search(q: { query?: string; tag?: number; documentType?: number; page?: number }): Promise<{ count: number; results: { id: number; title: string; mimeType: string; created: string }[] }>`, `getDocument(id: number): Promise<PaperlessDoc>`, `getDocuments(ids: number[]): Promise<PaperlessDoc[]>` (batched `id__in`), `downloadOriginal(id: number, maxBytes: number, versionId?: number): Promise<{ bytes: Buffer; fileName: string }>`, `thumb(id: number): Promise<{ bytes: Buffer; contentType: string }>`
  - `normalizeBaseUrl(raw: string): string` (http/https only, strips trailing slashes, keeps a path prefix, throws on other schemes)

- [ ] **Step 1:** Write failing tests with a stub `fetchImpl`: `normalizeBaseUrl("http://h:8777/")` is `"http://h:8777"`; `normalizeBaseUrl("https://h/paperless//")` is `"https://h/paperless"` and a request goes to `https://h/paperless/api/status/`; `ftp://x` throws; 401 → `PaperlessError.kind === "unauthorized"`; 404 → `not_found`; network throw/timeout → `unreachable`; non-JSON body → `bad_response`; a 302 to another origin is not followed with the Authorization header (kind `unauthorized`, stub asserts the second call never happens); download over `maxBytes` → `too_large` without buffering past the cap; `JSON.stringify` of any thrown error never contains the token.
- [ ] **Step 2:** Run `npx vitest run lib/paperless/client.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement. Send `Authorization: Token <token>` and `Accept: application/json; version=9`; `redirect: "manual"`; map `rootId = root_document ?? id`. The builder must probe the test server for the exact version-file download path and per-version checksum shape and pin the minimum API version in a constant `MIN_API_VERSION`.
- [ ] **Step 4:** Run the tests. Expected: PASS.

### Task 3: Settings storage, access check, actions, backup secret

**Files:**
- Create: `lib/paperless/config.ts`, `lib/paperless/config.test.ts`, `lib/actions/paperless-settings.ts`
- Modify: `lib/backup/backup.ts` (`Secrets` type `:19`, `hasSecrets` `:76`), `lib/backup/settings-server.ts` (`loadSecrets`), `lib/backup/raw-settings.ts` (`readRawSecrets` `:51`), `lib/backup/restore.ts` (`:172-176`), `lib/backup/restore-server.ts` (`CarriedSecrets` `:17`, `reWrapSecrets` `:20`), and the matching tests `lib/backup/backup.test.ts`, `lib/backup/restore.test.ts`

**Interfaces:**
- Consumes: Task 1 models; `createPaperlessClient`, `normalizeBaseUrl` (Task 2); `encrypt`/`decrypt` (`lib/secret-box.ts`); `requireAdmin` (`lib/auth-guard.ts`).
- Produces:
  - `loadPaperlessConfig(): Promise<{ enabled: boolean; baseUrl: string | null; token: string | null; hasStoredToken: boolean; tokenUnreadable: boolean; access: "EVERYONE" | "ADMIN"; schedule: "OFF" | "DAILY" | "WEEKLY"; time: string; weekday: number; lastCheckedAt: Date | null; lastCheckSummary: string | null; lastCheckError: string | null }>` (upserts singleton)
  - `paperlessAllowed(cfg: { enabled: boolean; baseUrl: string | null; token: string | null; access: "EVERYONE" | "ADMIN" }, role: "ADMIN" | "USER" | undefined): boolean` (pure; false when disabled or unconfigured)
  - `paperlessRoute(): Promise<{ denied: NextResponse; client: null } | { denied: null; client: PaperlessClient; session: Session }>` (404 when disabled or not allowed for the role, 401 with no session)
  - Server actions: `savePaperlessSettings(input)`, `testPaperlessConnection(input)` (same fall-back-to-saved-token and drop-token-on-origin-change rule as `testLlmConnection`, `lib/actions/llm-settings.ts:104`), `runPaperlessCheckNow()` (calls Task 6's `runPaperlessCheck("MANUAL")`; wire after Task 6). Return `{ ok: true }` or `{ error: string }`.

- [ ] **Step 1:** Write failing tests: `paperlessAllowed` truth table (disabled; no token; `EVERYONE` + USER true; `ADMIN` + USER false; `ADMIN` + ADMIN true; undefined role false); backup `Secrets` round-trip includes the Paperless token and survives `reWrapSecrets` after an `AUTH_SECRET` change.
- [ ] **Step 2:** Run `npx vitest run lib/paperless/config.test.ts lib/backup`. Expected: FAIL.
- [ ] **Step 3:** Implement `config.ts` and the actions following `lib/actions/llm-settings.ts` (`apiTokenEnc` undefined keeps, null clears, string encrypts; zod schema; `revalidatePath("/settings")`). Extend each backup file listed so the token is carried like the LLM key.
- [ ] **Step 4:** Run the same command plus `npx vitest run lib/backup/import-rules.test.ts`. Expected: PASS.

### Task 4: Change-detection plan (pure)

**Files:**
- Create: `lib/paperless/diff.ts`, `lib/paperless/diff.test.ts`

**Interfaces:**
- Consumes: `PaperlessDoc` (Task 2).
- Produces:
  - `hashText(text: string): string` (stable hex digest)
  - `type SyncRow = { paperlessId: number; paperlessVersionId: number | null; paperlessChecksum: string | null; paperlessTextHash: string | null; paperlessLinkStatus: "OK" | "MISSING" | null }`
  - `type SyncAction = { kind: "UNCHANGED" } | { kind: "REPLACE_FILE"; versionId: number; checksum: string; textHash: string } | { kind: "REFRESH_TEXT"; textHash: string } | { kind: "CONFIRM_MISSING" } | { kind: "RESTORE_LINK" }`
  - `planSync(row: SyncRow, remote: PaperlessDoc | undefined): SyncAction` (undefined or `deletedAt` set → `CONFIRM_MISSING`; newest version id or checksum differs → `REPLACE_FILE`; only text hash differs → `REFRESH_TEXT`; row was `MISSING` and remote is present and unchanged → `RESTORE_LINK`; else `UNCHANGED`. "Newest" = the version with the latest `added`.)

- [ ] **Step 1:** Write failing tests for each action above, including: a metadata-only change (`modified` differs, versions and content same) is `UNCHANGED`; a `MISSING` row that reappears with a new version is `REPLACE_FILE`.
- [ ] **Step 2:** Run `npx vitest run lib/paperless/diff.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `planSync` and `hashText`.
- [ ] **Step 4:** Run the tests. Expected: PASS.

### Task 5: Import service and routes

**Files:**
- Create: `lib/paperless/import-server.ts`, `lib/paperless/import-server.test.ts`, `app/api/paperless/search/route.ts`, `app/api/paperless/thumb/[id]/route.ts`, `app/api/paperless/import/route.ts`
- Modify: `app/api/uploads/route.ts` (extract the row-creation and validation shared with import into a helper in `lib/attachments/create-server.ts`; the upload route's behaviour must not change)

**Interfaces:**
- Consumes: `PaperlessClient` (Task 2), `paperlessRoute` (Task 3), `hashText` (Task 4), `reindexMovedDocuments` (`lib/documents/indexer-server.ts:82`), `EXTRACTOR_VERSION`, `MAX_TEXT_CHARS` (`lib/documents/limits.ts`), `attachmentDir` (`lib/attachment-location.ts`), `extensionForFilename`/`mimeForFilename` (`lib/upload-types.ts`), `maxUploadBytes` (`lib/upload-limits.ts`).
- Produces:
  - `importPaperlessDocument(args: { client: PaperlessClient; documentId: number; recordType: AttachmentRecordType; recordId: string; userId: string }): Promise<{ attachmentId: string }>` throwing `PaperlessImportError` with `code: "TYPE_NOT_ALLOWED" | "TOO_LARGE" | "ALREADY_IMPORTED" | "RECORD_NOT_FOUND" | "UPSTREAM"` and a fixed user-facing message.
  - `POST /api/paperless/import` body `{ documentId: number; recordType: string; recordId: string }` → `{ attachmentId }` or `{ error }` (400/404/409/502). For Intake the client first creates the inbox item as `addFileToInbox` does and passes `recordType: "INBOX"`.
  - `GET /api/paperless/search?query=&tag=&documentType=&page=` and `GET /api/paperless/thumb/[id]` (fixed `Content-Type` from an image allow-list, `X-Content-Type-Options: nosniff`, ids validated as positive integers).

- [ ] **Step 1:** Write failing tests (stub client, temp `UPLOAD_DIR`, test DB as other server tests in `lib/` do): imports a PDF → file exists under `attachmentDir`, row has `source = PAPERLESS`, `paperlessId` = root id even when a version id is passed, `AttachmentText.status = DONE`, `method = TEXT`; empty `content` → text row stays `PENDING`; `.exe` and no-extension names → `TYPE_NOT_ALLOWED` and no file, no row; over `maxUploadBytes()` → `TOO_LARGE`, no file; same document twice on one record → `ALREADY_IMPORTED`; unknown record → `RECORD_NOT_FOUND` before any download; `JSON.stringify` of every thrown error lacks the token.
- [ ] **Step 2:** Run `npx vitest run lib/paperless/import-server.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the shared helper, the import service and the three routes. Use `reindexMovedDocuments([id])` (not `enqueueDocument`) when text is present, `enqueueDocument` when it is empty.
- [ ] **Step 4:** Run the import tests plus `npx vitest run app lib/documents lib/upload-limits.test.ts`. Expected: PASS (upload route behaviour unchanged).

### Task 6: Scheduled sync

**Files:**
- Create: `lib/paperless/sync-server.ts`, `lib/paperless/sync-server.test.ts`, `lib/paperless/scheduler-server.ts`
- Modify: `instrumentation.ts` (start the scheduler after `startBackupScheduler`), `lib/actions/paperless-settings.ts` (`runPaperlessCheckNow`)

**Interfaces:**
- Consumes: `planSync`, `hashText` (Task 4); client (Task 2); `loadPaperlessConfig` (Task 3); `isDue` (`lib/backup/schedule.ts`); `reindexMovedDocuments`.
- Produces:
  - `runPaperlessCheck(trigger: "SCHEDULE" | "MANUAL", deps?: { client?: PaperlessClient; now?: Date }): Promise<{ examined: number; updated: number; textRefreshed: number; broken: number; restored: number }>`: sets `lastCheckedAt`/`lastCheckSummary`; on outage/401/bad response sets `lastCheckError` (fixed text) and changes no attachment row; no-op when disabled.
  - `startPaperlessScheduler(): void` (same `globalThis` guard, boot delay and 15 min tick style as `lib/backup/scheduler-server.ts`; does nothing while disabled or `OFF`).

- [ ] **Step 1:** Write failing tests (stub client, test DB): new version → file replaced (old file removed, new UUID name, `paperlessUpdatedAt` set, `originalName` unchanged, text replaced); text-only change → text refreshed, file untouched; 404 confirmed → `MISSING`, file and text kept; document back → `OK`; client throws `unreachable` or `unauthorized` → no row changed, no row `MISSING`, `lastCheckError` set; disabled → returns zeros and calls nothing.
- [ ] **Step 2:** Run `npx vitest run lib/paperless/sync-server.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Batch with `getDocuments`; confirm candidates with `getDocument` individually; write the new file before deleting the old; on a failed download keep the old copy and count the row as examined only.
- [ ] **Step 4:** Run the tests. Expected: PASS.

### Task 7: Settings UI

**Files:**
- Create: `components/settings/paperless-settings.tsx`
- Modify: `lib/settings-sections.ts` (add `"paperless"` id and an admin-only entry), `app/(app)/settings/page.tsx` (load config for the section, render it; follow how `assistant` is wired at `:217`)

**Interfaces:**
- Consumes: `loadPaperlessConfig`, `savePaperlessSettings`, `testPaperlessConnection`, `runPaperlessCheckNow` (Task 3, 6).
- Produces: section id `"paperless"`; component `PaperlessSettings({ initial })` with fields: enable switch, base URL, write-only token (shows only "stored" / "not stored"), "Who can import from Paperless" selector (Everyone signed in / Admins only), schedule (Off / Daily / Weekly) with time and weekday, "Test connection", "Check now", last run summary and error.

- [ ] **Step 1:** Add a test to the existing settings-sections test file (or create `lib/settings-sections.test.ts`): `visibleSections(false)` excludes `"paperless"`; `visibleSections(true)` includes it.
- [ ] **Step 2:** Run that test. Expected: FAIL.
- [ ] **Step 3:** Implement the section entry, page wiring and component, copying the layout and `useTransition` style of `components/settings/llm-settings.tsx` and `components/settings/data/backup-schedule.tsx`.
- [ ] **Step 4:** Run the test, then start the app (`npm run dev`) and confirm the section appears for an admin, saves, and the token is never shown after saving.

### Task 8: Picker, badge, availability

**Files:**
- Create: `components/paperless/paperless-picker.tsx`, `components/paperless/paperless-badge.tsx`, `components/paperless/paperless-context.tsx`
- Modify: `app/(app)/layout.tsx` (provide context), `components/attachments/attachment-list.tsx` (button in the header row at `:101-127`, badge on rows), `components/inbox/inbox-drop-zone.tsx` (button beside "Choose files" at `:~80`)

**Interfaces:**
- Consumes: `/api/paperless/*` routes (Task 5), `paperlessAllowed`, `loadPaperlessConfig` (Task 3), `addFileToInbox`'s inbox-item creation (`lib/actions/inbox.ts:~78`).
- Produces:
  - `PaperlessProvider({ available: boolean; linkBase: string | null; children })` and `usePaperless(): { available: boolean; linkBase: string | null }` (`available` is `paperlessAllowed(cfg, role)`; `linkBase` is the base URL only while the feature is enabled, else null)
  - `PaperlessPicker({ recordType, recordId, onImported })`: dialog with search, tag and type filters, paged thumbnails, optional paste-a-link field that extracts the numeric id
  - `PaperlessBadge({ attachment, linkBase })`: shows "Paperless", "Updated from Paperless on <date>" when `paperlessUpdatedAt` is set, an "Open in Paperless" link to `<linkBase>/documents/<id>/details` when `linkBase` is set, and a warning "Paperless link broken (not found, or no access)" when `MISSING`. The badge and date stay visible when the feature is off; the link and picker button do not.
  - Attachment queries used by `AttachmentList` must now select the new columns.

- [ ] **Step 1:** Write failing tests for pure helpers pulled out of the components: `paperlessIdFromLink("http://h/documents/42/details")` is `42`, a non-matching string is `null`; badge text function returns the broken-link wording for `MISSING` and the dated wording for an update.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3:** Implement helpers, components and wiring. The picker's button must not render when `available` is false.
- [ ] **Step 4:** Run the tests, then in the dev app confirm: button hidden when the feature is off, hidden for a non-admin when access is Admins only, visible otherwise.

### Task 9: End-to-end check against the test server

**Files:** none created. Temporary files go in the scratchpad directory, not the repo.

- [ ] **Step 1:** Upload a small PDF and a JPG to the test server through its API (token from `paperless.txt`; do not print it). Expected: both appear in `/api/documents/`.
- [ ] **Step 2:** In the dev app enable Paperless with the test URL and token, press Test connection. Expected: reachable, version `3.4.2`.
- [ ] **Step 3:** Import the PDF onto a service record and the JPG through Intake. Expected: files on disk, OCR text searchable, badge shown.
- [ ] **Step 4:** Add a new version of the PDF in Paperless, press Check now. Expected: file replaced, "Updated from Paperless on <today>", text re-indexed. Delete the document in Paperless, press Check now. Expected: "Paperless link broken", file and text still present.
- [ ] **Step 5:** Stop the Paperless server or point the base URL at a dead port, press Check now. Expected: error shown, no row marked broken.
- [ ] **Step 6:** Run `npm ci`, `npx eslint`, `npx tsc --noEmit`, `npx vitest run`. Report exact commands and output, and the list of files changed. Leave everything uncommitted.
