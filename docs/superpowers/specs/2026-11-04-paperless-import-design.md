# Paperless-ngx one-way import: design

Branch: `FEAT/PaperlessNgx`. Tracks GitHub issue #25.

## Intent

People who already keep receipts, manuals and policies in a Paperless-ngx server should not have to export and re-upload them, or scan things twice. HomeCenter lets them pick a document from Paperless and copies it in. The copy is what HomeCenter works from: it is searchable, shows up on the record, and stays even if Paperless goes away. A `paperlessId` pointer remembers where it came from. A scheduled check refreshes copies whose Paperless document changed.

The owner's stated priorities (from the issue thread and chat): the copy must survive a broken link; nothing should change silently without a visible mark; a broken link must be flagged, never auto-removed; the feature is optional and off by default.

## Goals

- Optional integration, **off by default**, enabled and configured in Settings (admin only).
- "Choose from Paperless" next to every attachment upload button, and in Intake.
- Import copies the file and Paperless's OCR text. No local OCR for imported rows.
- Keep a pointer (`paperlessId`) to the Paperless document.
- Configurable check (off, daily, weekly) that re-imports changed documents.
- A changed file replaces our copy in place and the row shows "Updated from Paperless on <date>".
- A document that disappears is marked "Paperless link broken"; our copy stays.

## Non-goals

- Anything that sends data to Paperless (no push, no storing uploads there).
- Asset photos (property, vehicle, equipment, person `imageFilename`) and room photos. Out of scope by decision.
- Keeping a rollback copy of the previous version.
- Syncing tags, correspondents or other Paperless metadata. Metadata-only changes are ignored.
- Multiple Paperless servers. One server per install.

## Anti-goals (a failure even if it technically works)

- The API token reaching the browser, a log line, an error message, a backup file in clear text, or git.
- A Paperless outage, a 401, or a bad network causing rows to be marked broken or text to be wiped. Only a confirmed "this document no longer exists" marks a row broken.
- Any user (not just admin) being able to change the server URL or token.
- The feature adding visible UI, routes that respond, or a running scheduler while it is off.

## Decisions made with the owner

1. One-way import. File and OCR text are copied; `paperlessId` is a pointer.
2. Changed file: replace in place, record "updated on <date>". No old copy kept.
3. Scheduled check: configurable OFF / DAILY / WEEKLY (time of day, weekday), like backups.
4. Scope: attachments and Intake only.
5. Picker is an in-app dialog backed by our server, not a pasted URL. A "paste a Paperless link" fallback is allowed.
6. A setting controls who can use the picker: every signed-in user (default) or admins only.

## Paperless API facts (verified against the test server, Paperless-ngx 3.4.2, API v10)

- Auth: `Authorization: Token <token>`. Unauthenticated requests get a 302 to the login page.
- Paperless 3.x has real document versions. A `Document` has `root_document` and `versions[]`, each `{id, added, version_label, checksum, is_root}`. Endpoints exist for `/api/documents/{id}/root/`, `/versions/{version_id}/`, `/update_version/`.
- Useful endpoints: `GET /api/documents/?query=&page_size=&fields=...`, `GET /api/documents/{id}/` (has `content`, `original_file_name`, `mime_type`, `page_count`, `modified`, `deleted_at`), `GET /api/documents/{id}/download/` (add `?original=true` for the unprocessed file), `GET /api/documents/{id}/thumb/`, `GET /api/status/`.
- Send `Accept: application/json; version=9` or later and check the `x-api-version` response header; the builder should confirm which minimum version is required for `versions` and pin it.
- The test server (`http://192.168.68.119:8777/`, token in untracked `paperless.txt`) has no documents yet; validation needs test files uploaded to it.

## Data model

New enum `AttachmentSource { LOCAL PAPERLESS }` and `PaperlessLinkStatus { OK MISSING }`.

`Attachment` gains (all nullable except `source`):

| Column | Meaning |
|---|---|
| `source` | `LOCAL` default |
| `paperlessId` | root document id in Paperless |
| `paperlessVersionId` | id of the version we copied |
| `paperlessChecksum` | checksum of that version |
| `paperlessTextHash` | hash of the OCR `content` we copied |
| `paperlessLinkStatus` | `OK` or `MISSING` |
| `paperlessSyncedAt` | last time the check looked at it |
| `paperlessUpdatedAt` | last time our copy was replaced (drives "Updated on") |

Index on `paperlessId`. A Prisma migration is required.

New singleton `PaperlessSettings` (id `"singleton"`, same shape as `LlmSettings` / `BackupSettings`):
`enabled` (default false), `baseUrl`, `apiTokenEnc` (AES-256-GCM via `lib/secret-box.ts`), `access` (enum `PaperlessAccess { EVERYONE ADMIN }`, default `EVERYONE`: who may use the picker), `schedule` (OFF/DAILY/WEEKLY, default OFF), `time` ("HH:mm"), `weekday`, `lastCheckedAt`, `lastCheckSummary` (short text), `lastCheckError`.

## Behaviour

### Settings
New admin-only settings section "Paperless". Fields: enable switch, base URL, API token (write-only: the UI is told only whether one is stored), a "Who can import from Paperless" selector (Everyone signed in, default; or Admins only), schedule, time, weekday. "Test connection" calls `/api/status/` with the form values (falling back to the saved token; drop the saved token if the origin changed, as `testLlmConnection` does) and reports reachable / unauthorized / unreachable and the server version. "Check now" runs the sync immediately. Last run summary and error are shown.

### Picker
`AttachmentList` (covers service records, warranties, maintenance, insurance, health records, asset documents) and the Intake drop zone get a "Choose from Paperless" button, shown only when the feature is enabled and configured. The dialog has a search box, optional tag and document-type filters, paged results with thumbnails, and an optional paste-a-link field that extracts the document id. Our server calls Paperless; the browser never sees the token or the Paperless URL. Thumbnails come through a server proxy.

### Import
For the chosen document: fetch metadata; reject if the file type is not in `UPLOAD_TYPES` or exceeds `maxUploadBytes()`, with a clear message; download the file; write it under the normal upload layout (`uploads/<recordtype>/<id>/<uuid><ext>`); create the `Attachment` with `source = PAPERLESS` and the pointer columns; create `AttachmentText` already `DONE` with `method: TEXT`, the Paperless `content`, `extractorVersion = EXTRACTOR_VERSION`; then call `reindexMovedDocuments([id])` instead of `enqueueDocument`. If `content` is empty, leave the row `PENDING` so local OCR runs. Importing a document already imported on the same record is refused with a message. For Intake, create an inbox item and attach the import to it exactly as `addFileToInbox` does (record type `INBOX`), so filing works unchanged.

### Scheduled check
Started from `instrumentation.ts` beside the backup scheduler, same guard and interval style; does nothing while disabled or schedule is OFF. Each run:

1. Collect attachments with `source = PAPERLESS`.
2. Ask Paperless for those ids in batches (`fields=id,content,versions,root_document,deleted_at`).
3. Per row: if the newest version's id or checksum differs from stored, download that version's file, replace the file on disk (new UUID name, then remove the old one), update `mimeType`, `sizeBytes`, version columns and `paperlessUpdatedAt`, replace the text and reindex. If only the `content` hash differs, refresh text and reindex only. Do not overwrite `originalName` (the user may have renamed it).
4. A document missing from the batch, or soft-deleted (`deleted_at` set), is confirmed with a direct request; a 404 sets `paperlessLinkStatus = MISSING`. A document that reappears is set back to `OK`.
5. If the server is unreachable, the token is rejected, or the response is malformed, the whole run fails: no row is changed, `lastCheckError` is set with a fixed, token-free message.
6. Always set `paperlessSyncedAt` on rows examined and write `lastCheckedAt` / `lastCheckSummary`.

### Display
On an attachment row with `source = PAPERLESS`: a small "Paperless" badge, "Updated from Paperless on <date>" when `paperlessUpdatedAt` is set, an "Open in Paperless" link (`<baseUrl>/documents/<id>/details`), and a visible "Paperless link broken" warning when `MISSING`. A broken row keeps working (file, text, search).

## Constraints and integration points (from the code)

- Upload creation is in `app/api/uploads/route.ts`; the import should share its row-creation and validation logic rather than copy it. `lib/attachment-location.ts` already derives the directory from the row, so imported files need no new location rules.
- Secrets: the Paperless token must be added to the backup engine's secrets handling or it is lost on restore: `lib/backup/backup.ts` (`Secrets`, `hasSecrets`), `settings-server.ts` (`loadSecrets`), `raw-settings.ts` (`readRawSecrets`), `restore.ts`, `restore-server.ts` (`CarriedSecrets`, `reWrapSecrets`), plus their tests. `lib/backup/import-rules.test.ts` limits what the backup engine may import.
- `lib/backup/snapshot.ts` `referencedFiles` selects named columns only, so new plain columns need no change there; the DB snapshot carries them. Old backups lack the new columns, so any restore-time read of them needs a `PRAGMA table_info` guard like `roomId` has.
- Server actions follow `lib/actions/llm-settings.ts` and `lib/actions/backup.ts`: `"use server"`, `requireAdmin`, zod, `revalidatePath("/settings")`, return `{ok}` or `{error}`.
- Settings sections live in `lib/settings-sections.ts` and `app/(app)/settings/page.tsx`.
- This repo's Next.js has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing route handlers or pages.
- Do not commit. Run `npm ci` and lint, typecheck and the test suite before reporting done.

## Security

- The base URL is set only by an admin. Validate it is `http` or `https`, strip trailing slashes. Because this server makes requests to an admin-chosen address, LAN addresses must stay allowed (the owner's server is on a private IP); do not add a block-list that would reject them. Never follow redirects to a different origin with the token attached.
- Token only in `PaperlessSettings.apiTokenEnc`; never logged, never in error text returned to the client, never sent to the browser.
- All `/api/paperless/*` routes require a session and return 404 while the feature is off. When `access = ADMIN`, search, thumbnail and import routes also require an admin and return 404 to everyone else; the "Choose from Paperless" buttons are not rendered for non-admins. The check is made server-side on every request, never only in the UI. Settings changes and "Check now" are always admin only. The scheduled sync is unaffected by `access`.
- Proxied thumbnails: fixed `Content-Type` allow-list (`image/*` types we expect), `X-Content-Type-Options: nosniff`, no passthrough of arbitrary upstream headers.
- Timeouts on every Paperless request. Cap download size at `maxUploadBytes()`.
- Document ids in routes are validated as positive integers.

## Testing

- Unit tests with a stubbed `fetch`: change detection (new version, text-only change, unchanged), missing vs outage handling, import with and without OCR text, rejected types and oversize, token never appearing in any returned error.
- Backup tests updated for the new secret.
- Manual validation against the test server: upload a PDF and an image to it, import both on a service record and in Intake, edit the document in Paperless (re-upload as a new version), run "Check now", delete it in Paperless, run again. `paperless.txt` holds the test token, is untracked, and must be listed in `.gitignore` and never committed; the owner will delete it when the work is done.

## Calls made while writing this (not yet confirmed by the owner)

- **Which file is copied:** the original (`/download/?original=true`), not the archived PDF. It matches `mime_type` and the version `checksum`, keeps a scanned JPG a JPG, and is checked against `UPLOAD_TYPES`. The OCR text still comes from Paperless's `content`. Change detection compares the original's checksum.
- **Feature switched off later:** the sync stops and imported rows are frozen. The "Paperless" badge and "Updated from Paperless on <date>" text stay, because they describe the copy. The "Open in Paperless" link and "Choose from Paperless" buttons are hidden. Turning it back on resumes the sync.
- **Backup restore:** `PaperlessSettings` restores as it was saved, like the other settings (token re-wrapped through the existing secrets path). A restore onto another machine therefore starts polling Paperless if it was enabled.
- **Permissions in Paperless:** a document the token can no longer see returns 404, the same as a deleted one, so it is flagged "Paperless link broken". The warning text says "not found, or no access" so it is not misleading. No attempt is made to tell the two apart.
- **Per-version download:** the builder discovers how to fetch a specific version's file and checksum by probing the test server (the owner has allowed uploading test documents to it). If the batch query lacks per-version checksums, fall back to `GET /api/documents/{id}/` per row. Pin the minimum API version once confirmed.

## Left to the builder

File and function names, the exact shared helper shape for upload and import, the hash function, batch size, pagination UX, how the migration is written, and the minimum Paperless API version to pin. Anything the builder settles that changes what a user sees should be listed in the final report.
