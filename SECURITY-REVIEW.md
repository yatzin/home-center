# Security Review — home-center

Audited: 2026-08-25 | Commit: 5577ca2 | Files reviewed: 63

## Summary
| Severity | Count |
|---|---|
| Critical | 3 |
| High | 4 |
| Medium | 6 |
| Low | 7 |

Three systemic weaknesses drive almost everything below. First, **caller-supplied identifiers are concatenated into filesystem paths and acted on before any database lookup proves they exist** — `path.join(UPLOAD_DIR, ...)` appears in six places and is guarded in exactly one (`/api/files`), which is the only one that does not need it. Second, **authorization stops at "is there a session"** — role is trusted from a 30-day JWT that is never re-checked against the DB, page-level auth is delegated to `proxy.ts` and a layout contrary to Next.js 16 guidance, and no action verifies that the record it mutates has anything to do with the arguments it was handed. Third, **the shipped deployment artifacts contain live secrets** — `docker-compose.yml` publishes a working `AUTH_SECRET` and an admin password that the seeder explicitly declines to force a reset on, so a default install is remotely ownable with no exploit at all.

## Critical

### SEC-001 — Arbitrary recursive directory deletion via unvalidated record id
- **File:** `lib/actions/service-records.ts:74-80`, `lib/actions/warranties.ts:72-76`
- **Category:** Path Traversal / Destructive AuthZ
- **Issue:** Both delete actions build a directory path from the caller's `id` and `rm -rf` it *before* the Prisma delete that would have rejected a non-existent id. `id` is never validated as a cuid.
```ts
const dirPath = path.join(uploadDir, "service", id)
await rm(dirPath, { recursive: true, force: true })
await prisma.serviceRecord.delete({ where: { id } })   // too late
```
- **Attack:** Any account, including the lowest-privileged `USER`, invokes the server action with `id = "../.."`. `path.join("/data/uploads", "service", "../..")` resolves to `/data` — the bind-mounted volume — and `rm({recursive:true, force:true})` destroys `homecenter.db` and every uploaded file. `"../../.."` resolves to `/` and deletes everything the `nextjs` user can reach. `force:true` suppresses the errors; the subsequent Prisma throw is cosmetic. `deleteWarranty` is identical with `"warranty"`. (Note `deleteEquipment`/`deleteProperty`/`deleteVehicle` order the Prisma delete first and are therefore *not* exploitable — the ordering is the whole bug.)
- **Fix:** In `deleteServiceRecord` and `deleteWarranty`: (1) `const record = await prisma.serviceRecord.findUnique({ where: { id } })` and return early if null, *before* touching disk; (2) validate `id` with `z.cuid()`; (3) add a shared `lib/upload-path.ts` helper `resolveUploadPath(...segments)` that `path.resolve`s and asserts the result is inside `path.resolve(UPLOAD_DIR)`, and route every `rm`/`writeFile`/`mkdir` in `lib/actions/*` and `app/api/**` through it.
- **Verify:** Call `deleteServiceRecord("../..", "PROPERTY", "x")` from an authenticated session against a scratch container; `/data/homecenter.db` must still exist and the action must return an error.

### SEC-002 — Working `AUTH_SECRET` committed to the repository
- **File:** `docker-compose.yml:15`
- **Category:** Secrets / Crypto
- **Issue:** The compose file that `README` tells operators to deploy contains a real, valid 32-byte key rather than a placeholder.
```yaml
AUTH_SECRET: "q8fJZ3n0X9pQe2vT7yB1kR4mL6cW8dS0uA5hN3zP9io="
```
- **Attack:** next-auth v5 derives the JWE encryption/signing key for the session cookie from `AUTH_SECRET`. Anyone with the public repo can mint a session cookie with `{ id: <any>, role: "ADMIN", mustResetPassword: false }` and get full admin on every instance that kept the default — no login, no password, no brute force. The same value keys `lib/secret-box.ts`, so the stored SMTP password in any leaked/backed-up `homecenter.db` is also decryptable offline. The comment telling users to change it is not a control.
- **Fix:** Replace the literal with `AUTH_SECRET: "${AUTH_SECRET:?generate with openssl rand -base64 32}"` so compose refuses to start without one. Add a startup assertion in `instrumentation.ts` that rejects the known-bad value and any secret under 32 bytes. Treat the committed value as burned and rotate it in every deployment.
- **Verify:** `docker compose up` with no `AUTH_SECRET` in the environment must fail to start. Grep the repo for the literal string — zero hits.

### SEC-003 — Default admin password `changeme` with forced reset disabled
- **File:** `docker-compose.yml:31-33`, `prisma/seed.ts:20`
- **Category:** AuthN / Default Credentials
- **Issue:** The seeder only forces a password change when `ADMIN_PASSWORD` is *unset*; the shipped compose file sets it to `changeme`.
```ts
const password = process.env.ADMIN_PASSWORD ?? "changeme"
const mustReset = !process.env.ADMIN_PASSWORD // force reset only when using the default
```
- **Attack:** The documented deployment path produces an ADMIN account with password `changeme` and `mustResetPassword: false`, so the app never prompts and the operator never notices. `docker-entrypoint.sh:10` runs the seeder on every boot. Combined with `trustHost: true` and a LAN-exposed port 3000, anyone on the network signs in as admin with a guess.
- **Fix:** Remove `ADMIN_PASSWORD` from `docker-compose.yml` entirely (leave `ADMIN_NAME`/`ADMIN_EMAIL`). In `prisma/seed.ts`, drop the `"changeme"` fallback: if `ADMIN_PASSWORD` is unset, generate `randomBytes(16).toString("base64url")`, print it once, and set `mustResetPassword: true` unconditionally regardless of where the password came from.
- **Verify:** Fresh `docker compose up`; sign in with the seeded credentials — the app must redirect to `/change-password` before any other route is reachable.

## High

### SEC-004 — Arbitrary file write via unvalidated `recordType`/`recordId` in the upload route
- **File:** `app/api/uploads/route.ts:26-31`
- **Category:** Path Traversal / Unrestricted Upload
- **Issue:** Both path components come straight from the multipart body with no allowlist, and the extension comes from the client-supplied filename. There is no file-type restriction at all on this route (unlike the image route, which has one).
```ts
const ext = path.extname(file.name).toLowerCase()
const filename = `${randomUUID()}${ext}`
const dirPath = path.join(uploadDir, recordType.toLowerCase(), recordId)
await mkdir(dirPath, { recursive: true })
await writeFile(path.join(dirPath, filename), Buffer.from(await file.arrayBuffer()))
```
- **Attack:** POST with `recordType=../..`, `recordId=../../root/.ssh`, and a file named `x.authorized_keys` writes attacker-controlled bytes outside `UPLOAD_DIR` (`mkdir -p` creates the tree first). The subsequent `prisma.attachment.create` throws on the invalid enum, but the file is already on disk — the failure response is not a rollback. Separately, `recordId` is never checked to be an existing record the caller may touch, so any user can staple attachments onto any record id, and any file type (`.html`, `.svg`, `.php`, `.sh`) is accepted at up to 25 MB each with no quota.
- **Fix:** Parse the body with zod: `z.object({ recordId: z.cuid(), recordType: z.enum(["SERVICE","WARRANTY","MAINTENANCE"]) })`. Confirm the target record exists (`prisma.serviceRecord/warranty/maintenanceSchedule.findUnique`) before writing. Derive `ext` from an allowlist keyed on sniffed content type, not `file.name`, and reject anything outside `{pdf,jpg,jpeg,png,webp,heic,heif}`. Route the final path through the `resolveUploadPath` helper from SEC-001.
- **Verify:** Upload with `recordType=../..` returns 400 and creates no file; upload of `evil.html` returns 400.

### SEC-005 — Password change requires no current password and does not invalidate other sessions
- **File:** `app/change-password/page.tsx:10-33`
- **Category:** AuthN / Session Management
- **Issue:** The action reads `newPassword`/`confirm` and writes the hash. The existing password is never requested or verified, and only the current device is signed out.
```ts
const newPassword = formData.get("newPassword") as string
if (!newPassword || newPassword.length < 8) redirect("/change-password?error=short")
const passwordHash = await bcrypt.hash(newPassword, 12)
await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash, ... } })
```
- **Attack:** Anyone who obtains a session cookie — an unlocked shared machine, a cookie stolen over the plaintext HTTP the compose file documents — permanently takes over the account without ever knowing the password, and the real owner is not signed out. Conversely, a user who changes their password after a suspected compromise does not evict the attacker: `signOut()` clears one cookie, and with `session: { strategy: "jwt" }` every other issued token stays valid for its full 30-day life because nothing is stored server-side.
- **Fix:** Add a `currentPassword` field and `bcrypt.compare` it against the stored hash before updating; skip the check only when `session.user.mustResetPassword` is true (first-login flow, where the temp password was just used). Enforce a real policy (min 12 chars, reject the temp-password format). For global invalidation, add a `sessionsValidFrom DateTime` column on `User`, bump it here, and reject tokens with `iat` older than it in the `jwt` callback.
- **Verify:** Submit a password change without `currentPassword` — must fail. Change the password in browser A; a pre-existing session in browser B must be rejected on its next request.

### SEC-006 — No brute-force protection on login, plus a user-enumeration timing oracle
- **File:** `auth.ts:21-27`
- **Category:** AuthN / Rate Limiting
- **Issue:** `authorize` returns early when the user row is missing, so the expensive bcrypt comparison only runs for real accounts. There is no attempt counter, lockout, delay, or CAPTCHA anywhere in the codebase (confirmed: zero matches for rate limiting across the repo).
```ts
const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
if (!user) return null
const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
```
- **Attack:** An unauthenticated attacker measures response time on `/api/auth/callback/credentials` — sub-millisecond for unknown emails, ~250 ms (bcrypt cost 12) for known ones — enumerating valid accounts. They then run unlimited password guesses against the enumerated addresses; `changeme` (SEC-003) or any 8-character password (SEC-005) falls quickly.
- **Fix:** In `authorize`, always run a bcrypt comparison — when `user` is null, compare against a fixed dummy hash — so both branches cost the same. Add per-IP and per-email attempt counting with exponential backoff and a lockout threshold; a small table or in-memory LRU keyed on `email` and the `x-forwarded-for` address is sufficient for a single-container app. Wire the check into `authorize` and also into `proxy.ts` for `/api/auth/callback/*`.
- **Verify:** 20 failed logins against one email must return 429/lockout. Time 50 requests for a known vs unknown email — distributions must overlap.

### SEC-007 — Role and `mustResetPassword` are trusted from the JWT and never re-read from the database
- **File:** `auth.ts:39-53`, `lib/actions/users.ts:11-15`, `lib/actions/mail-settings.ts:12-17`
- **Category:** AuthZ / Session Management
- **Issue:** `role` is copied into the token at sign-in and only at sign-in; every admin gate reads it back out of the session with no DB confirmation.
```ts
jwt({ token, user }) { if (user) { token.role = (user as { role: string }).role } return token }
// lib/actions/users.ts
if (!session || session.user.role !== "ADMIN") redirect("/")
```
- **Attack:** An admin demotes a user via `updateUserRole`, or deletes them via `deleteUser` — the victim's existing JWT still asserts `role: "ADMIN"` and remains accepted for the remainder of the default 30-day session, granting continued access to `createUser`, `resetUserPassword`, `deleteUser`, and `updateMailSettings` (including the ability to re-promote themselves). Deleting a user does not log them out at all; `app/(app)/settings/page.tsx:35` documents this exact orphaned-session state as a known condition. The same staleness lets a user who was flagged `mustResetPassword` by an admin keep browsing on their old token.
- **Fix:** Replace the claim read with a DB read. Add `lib/dal.ts` exporting `const requireUser = cache(async () => { const s = await auth(); if (!s) redirect("/login"); const u = await prisma.user.findUnique({ where: { id: s.user.id }, select: { id, role, mustResetPassword } }); if (!u) redirect("/login"); return u })` and `requireAdmin()` on top of it. Change both `requireAdmin` helpers and every `const session = await auth()` in `lib/actions/*` and `app/api/**` to use it. React `cache` keeps it to one query per request.
- **Verify:** Sign in as admin in browser A. Demote that account from browser B. Browser A's next call to `createUser` must redirect to `/`.

## Medium

### SEC-008 — `deleteAttachment` trusts caller-supplied path components and skips the ownership check
- **File:** `lib/actions/attachments.ts:18-25`
- **Category:** AuthZ / Path Traversal
- **Issue:** The attachment is fetched by id, but the directory is rebuilt from independently supplied `recordType`/`recordId` that are never compared against the row. The TypeScript union on `recordType` is erased at runtime.
```ts
const attachment = await prisma.attachment.findUnique({ where: { id } })
const filePath = path.join(uploadDir, recordType.toLowerCase(), recordId, attachment.filename)
await rm(filePath, { force: true })
```
- **Attack:** Any user deletes any attachment row by id with no relationship check. By passing `recordId = "../../../<dir>"` the `rm` targets a file outside `UPLOAD_DIR` — bounded to basenames matching a real `attachment.filename` (a UUID plus an attacker-chosen extension from SEC-004), but the traversal itself is real and the row deletion is unconditional.
- **Fix:** Drop the `recordId`/`recordType` parameters. Derive them from the fetched row (`attachment.recordType`, and whichever of `serviceRecordId`/`warrantyId`/`maintenanceScheduleId` is non-null). Route the path through `resolveUploadPath` from SEC-001. Update the call site in `components/attachments/attachment-list.tsx:57`.
- **Verify:** `deleteAttachment(id, "../..", "SERVICE")` must fail; the file must be removed only from its true directory.

### SEC-009 — Nine of thirteen app pages perform no authorization of their own
- **File:** `app/(app)/records/page.tsx:27`, `app/(app)/costs/page.tsx:27`, `app/(app)/maintenance/page.tsx:35`, `app/(app)/warranties/page.tsx:39`, `app/(app)/assets/{properties,vehicles,equipment}/page.tsx`, `app/(app)/assets/*/[id]/page.tsx`
- **Category:** AuthZ
- **Issue:** These pages query Prisma and render results without calling `auth()`; only `proxy.ts` and `app/(app)/layout.tsx:11` check anything. Next.js 16's own guidance rules both out as boundaries — `node_modules/next/dist/docs/01-app/02-guides/authentication.md:1350` ("Due to Partial Rendering, be cautious when doing checks in Layouts as these don't re-render on navigation") and `:1119` ("Proxy… should not be your only line of defense"), reiterated in `production-checklist.md:102`.
- **Attack:** No direct bypass exists today because the `proxy.ts` matcher covers these paths. The exposure is that a single matcher edit, an added `export const runtime`, a route moved out of the `(app)` group, or a future Next.js partial-rendering change silently makes every asset, cost figure, and service record world-readable with no second gate.
- **Fix:** Call the `requireUser()` DAL helper from SEC-007 at the top of each page component, or move the Prisma calls behind DAL functions that call it internally. Keep `proxy.ts` as the optimistic redirect it is meant to be.
- **Verify:** Temporarily neuter the `proxy.ts` matcher and request `/records` with no cookie — must redirect to `/login`, not render.

### SEC-010 — No security response headers anywhere
- **File:** `next.config.ts:3-8`
- **Category:** Config / Hardening
- **Issue:** The config sets only `output` and one experimental flag. There is no `headers()` function, so no CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, or `Referrer-Policy` is sent. `app/api/files/[...path]/route.ts:40-45` compounds it by serving user-uploaded bytes from the application's own origin with neither `nosniff` nor `Content-Disposition: attachment`.
- **Attack:** The app is fully framable — clickjacking against the delete and admin controls. With no CSP there is no second line of defense if any injection is ever introduced. `/api/files` returns `application/octet-stream` for unrecognised extensions, which mainstream browsers do not render as HTML, so this is hardening rather than a live stored-XSS path — but the SEC-004 unrestricted upload plus a single MIME-map change turns it into one.
- **Fix:** Add an `async headers()` to `next.config.ts` returning `Content-Security-Policy` (`default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin` for `/(.*)`. In the `/api/files` handler add `"X-Content-Type-Options": "nosniff"` and `Content-Disposition: attachment; filename="..."` (RFC 5987-encoded) for every type except the image MIMEs actually rendered inline.
- **Verify:** `curl -I` any page and any `/api/files/...` URL — all four headers present.

### SEC-011 — Upload route handlers buffer the entire request body before the size check
- **File:** `app/api/uploads/route.ts:12-23`, `app/api/assets/[type]/[id]/image/route.ts:41-51`
- **Category:** DoS
- **Issue:** `MAX_UPLOAD_BYTES` is compared against `file.size` only after `await request.formData()` has already consumed and materialised the whole body. Route handlers have no built-in body limit in Next.js 16 — only Server Actions do (`serverActions.bodySizeLimit`, default 1 MB, per `docs/…/next-config-js/serverActions.md:27-31`).
```ts
const formData = await request.formData()
const file = formData.get("file") as File | null
if (file.size > maxBytes) { /* already too late */ }
```
- **Attack:** Any authenticated user POSTs a multi-gigabyte body; the Node process buffers it and is OOM-killed. Repeat for a persistent outage. There is also no per-user quota or upload-rate limit, so a valid 25 MB-at-a-time loop fills the NAS volume.
- **Fix:** Reject early on `Content-Length` before touching the body: `const len = Number(request.headers.get("content-length")); if (!len || len > maxBytes) return 413`. Set `proxyClientMaxBodySize` in `next.config.ts` to bound proxied bodies, and add a per-user upload counter/quota.
- **Verify:** POST a 1 GB body — must get 413 without server memory growth.

### SEC-012 — Email addresses are validated as arbitrary strings and reach nodemailer unchecked
- **File:** `lib/actions/users.ts:25-28`, `lib/actions/users.ts:63-67`, `lib/notifications/digest.ts:140`
- **Category:** Input Validation / Injection
- **Issue:** Both the self-service and admin paths accept any non-empty string as an email address, with no `.email()`, trimming, or case normalisation.
```ts
const parsed = z.object({ name: z.string().min(1), email: z.string().min(1) }).safeParse(data)
```
- **Attack:** Confirmed against nodemailer 8: setting one's own email to `victim@x.com>\r\nBcc: attacker@evil.com` is parsed into an address *group* whose member is `attacker@evil.com`, so the digest — containing asset names, vendor names, and maintenance titles — is delivered to the injected address. Raw CRLF header injection is blocked (nodemailer folds it to a space), but recipient injection is not. Case-sensitive SQLite collation additionally lets `Admin@x.com` coexist with `admin@x.com`, producing a lookalike row in the admin user table.
- **Fix:** Use `z.string().trim().toLowerCase().email().max(254)` in the `updateSelf` and `createUser` schemas and in the `authorize` schema in `auth.ts:16`. Backfill-normalise existing rows. Re-validate `user.email` in `sendPendingDigests` before passing it to `sendMail`, and skip the user if it fails.
- **Verify:** `updateSelf({ name: "x", email: "a@b.c>\r\nBcc: e@f.g" })` must return a validation error.

### SEC-013 — Docker build ignores the lockfile
- **File:** `Dockerfile:7`
- **Category:** Supply Chain
- **Issue:** `RUN npm install` resolves semver ranges fresh at build time instead of installing the audited tree.
```dockerfile
COPY package*.json ./
RUN npm install
```
- **Attack:** `package-lock.json` is copied into the image but never honoured, so every CI build (`.github/workflows/docker-publish.yml`, on every push to `main`) can pull a different transitive tree than was reviewed. A compromised patch release of any of the 40+ dependencies — or of `next-auth@^5.0.0-beta.*`, which floats across beta builds — ships to `ghcr.io/yatzin/homecenter:latest` unnoticed. Builds are also not reproducible, so a compromised image cannot be diffed against a known-good one.
- **Fix:** Change to `RUN npm ci`. Pin `next-auth` to an exact beta version. Add `npm audit --audit-level=high` as a build step in the workflow.
- **Verify:** Build twice from the same commit — identical `node_modules` manifest digests.

## Low

### SEC-014 — Response header injection via the asset id in `Content-Disposition`
- **File:** `app/api/assets/[type]/[id]/download/route.ts:64`
- **Category:** Injection
- **Issue:** `type` and `id` are interpolated into a quoted header value with no escaping or validation. `type` is checked against three literals; `id` is not checked at all.
```ts
"Content-Disposition": `attachment; filename="homecenter-${type}-${id}.zip"`
```
- **Attack:** A request for `/api/assets/vehicles/a";x="/download` breaks out of the quoted filename and injects additional `Content-Disposition` parameters. Node rejects raw CR/LF in header values, so full response splitting is not reachable — the impact is limited to controlling the saved filename and confusing parsers.
- **Fix:** Validate `id` with `z.cuid()` and return 400 on failure, then build the header from the sanitised value, `.replace(/[^a-zA-Z0-9._-]/g, "_")`.
- **Verify:** `curl -I '/api/assets/vehicles/a";x="/download'` returns 400.

### SEC-015 — Container entrypoint runs as root
- **File:** `Dockerfile:42-45`, `docker-entrypoint.sh:7`
- **Category:** Config / Infra
- **Issue:** The runner stage never issues a `USER` directive, so PID 1 is root; the entrypoint `chown -R nextjs:nodejs /data` on every start and then drops privileges with `su-exec` for each command.
- **Attack:** Any pre-drop code execution — a compromised base image layer, a malicious `prisma migrate deploy` plugin — runs as root inside the container, and the unconditional recursive `chown` of a host bind mount will follow whatever ownership structure the host presents. The application itself does run unprivileged, which is why this is Low.
- **Fix:** Do the `mkdir`/`chown` in the Dockerfile at build time, add `USER nextjs` before `ENTRYPOINT`, and drop `su-exec` and the runtime `chown`. If host-mount ownership must be fixed, do it in compose with `user:` rather than in-container as root.
- **Verify:** `docker exec <container> id` reports uid 1001.

### SEC-016 — Demo seeder wipes all data and installs a known-credential admin with no environment guard
- **File:** `prisma/seed-demo.ts:30-31`, `prisma/seed-demo.ts:103-111`, `prisma/seed-demo.ts:574-576`
- **Category:** Business Logic
- **Issue:** `db:seed:demo` calls `deleteMany()` on all nine tables including `user`, then creates `demo@homecenter.local` / `demo1234` as ADMIN with `mustResetPassword: false`. Nothing checks `NODE_ENV`.
- **Attack:** Running the documented demo command against a production `DATABASE_URL` destroys every record and leaves a publicly documented admin credential. Requires shell access, hence Low.
- **Fix:** Abort at the top of `main()` unless `NODE_ENV !== "production"` and `process.env.ALLOW_DEMO_SEED === "1"`. Set `mustResetPassword: true` on the demo admin.
- **Verify:** `NODE_ENV=production npm run db:seed:demo` exits non-zero without touching the database.

### SEC-017 — Unbounded pagination and full-table cost aggregation
- **File:** `lib/table-params.ts:48-49`, `lib/costs-server.ts:15-32`
- **Category:** DoS
- **Issue:** `page` is accepted up to `Number.MAX_SAFE_INTEGER` with only a lower bound, producing an arbitrarily large SQL `OFFSET`. Separately, `loadCostRecords()` selects *every* costed `ServiceRecord` with no `take`, and both `/costs` and the dashboard call it on each request and group in memory.
```ts
const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
```
- **Attack:** `GET /records?page=999999999999` forces SQLite to scan and discard rows for the offset. Concurrent dashboard loads at 50k+ records multiply the in-memory grouping cost. The module comment acknowledges the 50k ceiling.
- **Fix:** Clamp `page` to `pageCountOf(total, per)` inside `parseTableParams` (or cap at a constant like 10,000). Add a `take` cap to `loadCostRecords` and memoise it with React `cache` so a single request does not run it twice.
- **Verify:** `?page=1e12` returns page 1 (or the last page) with no measurable latency increase.

### SEC-018 — Admin mail settings permit outbound connections to arbitrary hosts and ports
- **File:** `lib/actions/mail-settings.ts:127-132`, `lib/notifications/mailer.ts:24-29`
- **Category:** SSRF
- **Issue:** `testMailConnection` opens a TCP connection to any admin-supplied `host:port` (1-65535) and returns the connection error verbatim through `explain()`.
- **Attack:** An admin — or anyone holding a forged admin token from SEC-002 — uses `testMailConnection` as an internal port scanner: `ECONNREFUSED` vs `ETIMEDOUT` vs a returned SMTP banner distinguishes open from closed ports on the host network the container can reach. Also usable to send the configured SMTP credentials to an attacker-controlled relay.
- **Fix:** Restrict `port` to a mail-port allowlist (25, 465, 587, 2525). Resolve `host` and reject loopback, link-local, and RFC1918 targets unless an explicit `ALLOW_PRIVATE_SMTP=1` opt-in is set. Return a generic failure string instead of the raw socket error.
- **Verify:** Testing `host=127.0.0.1, port=22` returns a generic rejection, not a connection-specific error.

### SEC-019 — `next-auth` pinned to a floating beta range
- **File:** `package.json:34`
- **Category:** Dependency Risk
- **Issue:** `"next-auth": "^5.0.0-beta.32"` — the entire session, JWT, and CSRF implementation floats across pre-release builds that carry no stability or security-support guarantee.
- **Attack:** A breaking or regressing beta lands on the next `npm install` (see SEC-013, which removes the lockfile as a brake), potentially altering cookie flags or token validation without any code change on this side.
- **Fix:** Pin to the exact version (`"5.0.0-beta.32"`), track upstream release notes, and upgrade deliberately with a session-handling regression test.
- **Verify:** `npm ls next-auth` reports one exact version matching `package.json`.

### SEC-020 — Documented deployment serves sessions over plaintext HTTP
- **File:** `docker-compose.yml:17-20`, `.env.example:10`, `auth.ts:59`
- **Category:** Transport / Session
- **Issue:** The compose file directs operators to `http://192.168.1.50:3000` and the app sets `trustHost: true` with no TLS termination, no HSTS (SEC-010), and no `useSecureCookies` override. next-auth only applies the `__Secure-` cookie prefix and `secure` flag when the resolved URL is HTTPS.
- **Attack:** The session cookie — which, per SEC-007, is the sole and unrevokable proof of ADMIN — traverses the LAN in cleartext and is trivially captured on shared or hostile Wi-Fi. `trustHost: true` additionally makes the app accept any `Host` header, so a poisoned host can steer callback URLs.
- **Fix:** Document a reverse proxy with TLS as the supported deployment; add the HSTS header from SEC-010; set `trustHost` from an explicit `AUTH_TRUST_HOST` env var rather than hardcoding `true`, and require `AUTH_URL` to be set in production.
- **Verify:** With `AUTH_URL=https://...`, the session cookie is named `__Secure-authjs.session-token` and carries `Secure; HttpOnly; SameSite=Lax`.

## Unverified / Needs Manual Check
- [ ] `next-auth` beta cookie defaults — confirm `httpOnly`, `sameSite=lax`, and `maxAge` on the emitted session cookie for `5.0.0-beta.32` specifically; inspect `Set-Cookie` on a real login rather than trusting the documented defaults (relevant to SEC-005 and SEC-020).
- [ ] `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is unset — harmless on a single container, but confirm no one runs multiple replicas behind a load balancer, where inline-action closure decryption would fail across instances (`docs/…/server-actions.md:85`).
- [ ] Exploit SEC-001 end-to-end in a throwaway container to establish the exact blast radius under the `nextjs` uid (which of `/data`, `/app`, `/` is actually writable) — the code path is proven, the reach is not.
- [ ] Confirm whether `.next/` build output or `tsconfig.tsbuildinfo` in the working tree ever contained the committed `AUTH_SECRET`; if the image was built with a real `.env` present, check published layers on `ghcr.io/yatzin/homecenter` for leaked env values despite `.dockerignore`.
- [ ] `@libsql/client` handling of a `DATABASE_URL` containing a remote `libsql://` or `http://` endpoint — `lib/prisma.ts:7` passes it through unchecked; confirm no operator-supplied URL path leads to an unauthenticated remote database.

## Task Backlog
| ID | Severity | File | Task (one line, imperative) |
|---|---|---|---|
| SEC-001 | Critical | `lib/actions/service-records.ts:74`, `lib/actions/warranties.ts:72` | Fetch and verify the record with Prisma before any `rm`, validate `id` as a cuid, and route every upload path through a new `resolveUploadPath()` helper in `lib/upload-path.ts` that asserts containment in `UPLOAD_DIR`. |
| SEC-002 | Critical | `docker-compose.yml:15` | Replace the literal `AUTH_SECRET` with `${AUTH_SECRET:?…}` and add a startup assertion in `instrumentation.ts` rejecting the known-leaked value and secrets shorter than 32 bytes. |
| SEC-003 | Critical | `docker-compose.yml:33`, `prisma/seed.ts:20` | Delete `ADMIN_PASSWORD` from compose and change the seeder to always set `mustResetPassword: true`, generating a random password when none is supplied instead of falling back to `"changeme"`. |
| SEC-004 | High | `app/api/uploads/route.ts:26` | Zod-validate `recordId` (cuid) and `recordType` (enum), confirm the target record exists before writing, and derive the stored extension from a MIME allowlist rather than the client filename. |
| SEC-005 | High | `app/change-password/page.tsx:15` | Require and `bcrypt.compare` a `currentPassword` field (skipped only when `mustResetPassword` is true), raise the minimum length to 12, and add a `sessionsValidFrom` column checked in the `jwt` callback to invalidate other sessions. |
| SEC-006 | High | `auth.ts:24` | Always run a bcrypt comparison against a dummy hash when the user is not found, and add per-IP/per-email attempt counting with lockout in front of `authorize`. |
| SEC-007 | High | `auth.ts:40`, `lib/actions/users.ts:11`, `lib/actions/mail-settings.ts:12` | Create `lib/dal.ts` with React-`cache`d `requireUser()`/`requireAdmin()` that re-read role from the database, and replace every `await auth()` gate in `lib/actions/*` and `app/api/**` with them. |
| SEC-008 | Medium | `lib/actions/attachments.ts:22` | Remove the `recordId`/`recordType` parameters, derive both from the fetched attachment row, and update the call site in `components/attachments/attachment-list.tsx:57`. |
| SEC-009 | Medium | `app/(app)/**/page.tsx` | Add a `requireUser()` call at the top of each of the nine pages that currently rely solely on `proxy.ts` and the group layout for authorization. |
| SEC-010 | Medium | `next.config.ts:3` | Add an `async headers()` returning CSP, HSTS, `X-Content-Type-Options`, and `Referrer-Policy` for `/(.*)`, and add `nosniff` plus `Content-Disposition: attachment` to non-image responses in `app/api/files/[...path]/route.ts`. |
| SEC-011 | Medium | `app/api/uploads/route.ts:13`, `app/api/assets/[type]/[id]/image/route.ts:42` | Reject on `Content-Length` before calling `request.formData()`, set `proxyClientMaxBodySize` in `next.config.ts`, and add a per-user upload quota. |
| SEC-012 | Medium | `lib/actions/users.ts:27`, `lib/actions/users.ts:66`, `auth.ts:16` | Change every email field to `z.string().trim().toLowerCase().email().max(254)`, backfill-normalise existing rows, and re-validate `user.email` in `sendPendingDigests` before sending. |
| SEC-013 | Medium | `Dockerfile:7` | Replace `npm install` with `npm ci`, pin `next-auth` to an exact version, and add `npm audit --audit-level=high` to `.github/workflows/docker-publish.yml`. |
| SEC-014 | Low | `app/api/assets/[type]/[id]/download/route.ts:64` | Validate `id` as a cuid and sanitise both interpolated values with `.replace(/[^a-zA-Z0-9._-]/g, "_")` before building the `Content-Disposition` header. |
| SEC-015 | Low | `Dockerfile:42`, `docker-entrypoint.sh:7` | Move the `/data` `mkdir`/`chown` to build time, add `USER nextjs` before `ENTRYPOINT`, and remove `su-exec` and the runtime recursive `chown`. |
| SEC-016 | Low | `prisma/seed-demo.ts:100` | Abort the demo seeder unless `NODE_ENV !== "production"` and `ALLOW_DEMO_SEED=1`, and set `mustResetPassword: true` on the demo admin. |
| SEC-017 | Low | `lib/table-params.ts:49`, `lib/costs-server.ts:15` | Clamp `page` to the computed page count inside `parseTableParams`, add a row cap to `loadCostRecords`, and wrap it in React `cache`. |
| SEC-018 | Low | `lib/actions/mail-settings.ts:127` | Restrict SMTP `port` to an allowlist, reject private/loopback hosts unless explicitly opted in, and return a generic error instead of the raw socket message. |
| SEC-019 | Low | `package.json:34` | Pin `next-auth` to the exact version `5.0.0-beta.32` instead of the `^` beta range. |
| SEC-020 | Low | `docker-compose.yml:17`, `auth.ts:59` | Document a TLS reverse proxy as the supported deployment, drive `trustHost` from an `AUTH_TRUST_HOST` env var, and require `AUTH_URL` in production. |
