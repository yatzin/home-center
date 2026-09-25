# People & Health — Design

**Date:** 2026-09-25
**Status:** Approved design, not yet implemented.
**Branch:** `people-health`

## Problem

HomeCenter tracks the household's properties, vehicles and equipment: what was
spent on them, what is under warranty, what is due next. It has nothing for the
household's people. Medical history, receipts, conditions, medications,
vaccinations and insurance cards live in email, paper folders and patient
portals, and the moment they are needed (a new doctor, an ER visit, tax time,
an HSA claim) they have to be reassembled by hand.

## Goal

A **People** section that sits beside Properties, Vehicles and Equipment and is
primarily a household health record:

- log visits and medical expenses with uploaded receipts, EOBs, lab results;
- track health conditions, medications, allergies and immunizations;
- keep a directory of providers and the household's insurance policies;
- get reminders for checkups, refills, vaccines due and expiring coverage;
- see medical spending per person and per year;
- print a one-page medical summary per person.

**Success:** every household member has a person page that answers "what do I
need to tell a new doctor" in one printout, and every medical receipt is
attached to a dated, costed visit that rolls up into the Costs page.

## Decisions

| Question | Decision |
|---|---|
| Who can see a person's records? | **Every signed-in user sees every person**, matching the rest of the app. The model must not preclude a per-person access list later, but v1 has none. |
| v1 scope | Visits/expenses, reminders, costs, photo, report (via reuse) **plus** conditions, medications, allergies, immunizations, providers, insurance. |
| Architecture | **Extend `AssetType` with `PERSON`** and reuse the polymorphic service-record / maintenance / attachment / cost layer. New tables only for health-specific data. Insurance gets its **own model**, not `Warranty`. |
| Security prerequisites | Fix the upload/delete path findings from `SECURITY-REVIEW.md` (SEC-001, SEC-004 and the shared path helper) **before** any medical file is stored. |
| Encryption at rest / audit log | Out of scope for v1. |

## Why reuse the asset layer

`ServiceRecord`, `MaintenanceSchedule` and `Warranty` are keyed by
`assetType + assetId`, and everything downstream — `/records`, `/maintenance`,
`/costs`, the dashboard, notifications, the zip download, the printable report
— already iterates over `AssetType`. Adding `PERSON` makes a person a
first-class asset for all of that at the cost of teaching roughly 25 files a
fourth enum value. The alternative (a separate medical module) would duplicate
the upload, attachment, reminder and cost plumbing and keep medical spending
out of the Costs page.

| Existing | Role for a person |
|---|---|
| `ServiceRecord` + attachments | Visits and medical expenses: date, provider, cost, category, receipts/EOBs/lab PDFs |
| `MaintenanceSchedule` | Recurring health reminders: annual physical, dental cleaning every 6 months, eye exam. Day intervals only. |
| Costs page, `AssetCostPanel`, charts | Medical spending per person and per year |
| Asset image uploader, `AssetCollection`, view toggle | Person photo, list/grid page |
| Printable report, "download all files" | Medical summary, zip of every file for the person |
| Notification checker + email digest | New health triggers alongside maintenance and warranty ones |

`Warranty` is **not** reused for insurance: its fields (`productName`,
`vendorPhone`, one asset) map poorly to carrier, plan, member ID, group number,
deductible and a policy that covers several people.

## Data model

```prisma
enum AssetType { PROPERTY VEHICLE EQUIPMENT PERSON }

enum ServiceCategory {
  ROUTINE REPAIR UPGRADE INSPECTION PARTS OTHER          // existing
  OFFICE_VISIT PRESCRIPTION LAB DENTAL VISION PROCEDURE THERAPY
}

enum Relationship    { SELF SPOUSE CHILD PARENT OTHER }
enum ConditionStatus { ACTIVE MANAGED RESOLVED }
enum AllergySeverity { MILD MODERATE SEVERE }
enum InsuranceKind   { MEDICAL DENTAL VISION OTHER }

enum AttachmentRecordType { SERVICE WARRANTY MAINTENANCE CONDITION INSURANCE }

enum NotificationType {
  MAINTENANCE_DUE WARRANTY_EXPIRING CUSTOM                // existing
  MEDICATION_REFILL IMMUNIZATION_DUE INSURANCE_EXPIRING
}

model Person {
  id                String       @id @default(cuid())
  name              String
  relationship      Relationship @default(OTHER)
  dateOfBirth       DateTime?
  sex               String?
  bloodType         String?
  notes             String?
  imageFilename     String?
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  primaryProviderId String?
  primaryProvider   Provider?    @relation("PrimaryProvider", fields: [primaryProviderId], references: [id], onDelete: SetNull)

  conditions        HealthCondition[]
  medications       Medication[]
  allergies         Allergy[]
  immunizations     Immunization[]
  insurancePolicies InsurancePolicy[]
}

/// Shared household directory, not owned by one person.
model Provider {
  id        String  @id @default(cuid())
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

Additions to existing models:

- `ServiceRecord`: `providerId String?` and `conditionId String?`, both
  `onDelete: SetNull`. Links a visit to the doctor seen and the condition it
  was for. `vendor` stays as free text for facilities not in the directory.
- `Attachment`: `healthConditionId String?` and `insurancePolicyId String?`,
  both `onDelete: Cascade`, alongside the existing three foreign keys.

Rules:

- `sex` and `bloodType` are optional free strings, deliberately not enums.
- A medication is **active** when `endDate` is null or in the future.
- Deleting a person cascades its conditions, medications, allergies and
  immunizations, removes it from insurance memberships, and deletes its
  service records and maintenance schedules and its upload directory the same
  way `deleteEquipment` does today. Deleting a provider nulls every reference.
- The medical `ServiceCategory` values are offered only on person records; the
  existing values only on property/vehicle/equipment records. Both sets get
  colours in `globals.css` and entries in `lib/costs.ts`'s fixed category order.

## Pages and UI

### Navigation

`People` (lucide `HeartPulse`) after Equipment. `Providers` and `Insurance`
directly below it, grouped with People under a small "Health" label in the
sidebar.

### `/assets/people`

List/grid via `AssetCollection` and the view toggle. Each card: photo, name,
relationship, age, and badges for active condition count, active medication
count, and a warning badge when the person has any `SEVERE` allergy.

### `/assets/people/[id]`

Same layout as the equipment detail page.

- **Aside:** photo uploader; stats (age and date of birth, relationship, blood
  type, primary provider linked to `/providers`); an **allergy callout** that
  is always visible, red for `SEVERE`; insurance policies covering the person;
  `AssetCostPanel` for medical spend; notes.
- **Header:** edit, Report, Download all files.
- **Tabs:**
  1. **Visits & Expenses** — `ServiceRecordList` for `PERSON`.
  2. **Conditions** — table + dialog, attachments.
  3. **Medications** — active and past split, dialog with prescriber and
     condition pickers and refill fields.
  4. **Immunizations** — table + dialog.
  5. **Allergies** — table + dialog.
  6. **Reminders** — `MaintenanceList` for `PERSON`.

New lists and dialogs follow the `warranty-list` / `warranty-form-dialog`
pattern: sortable table, react-hook-form + zod dialog, server action returning
`fieldErrors`, toast on result.

### `/providers`

Table with create/edit dialog. Each row shows visit count and total spend from
linked service records.

### `/insurance`

One card per policy: carrier, plan, kind, member ID, group number, dates,
members, card images from attachments, expiry badge.

### Changes to shared screens

- `lib/assets.ts`, `lib/assets-server.ts`, `lib/report-server.ts`: `PERSON`
  entries (`people` segment, `HeartPulse` icon, `Person` label, name index).
- **Service record form**, when `assetType` is `PERSON`: medical category
  subset; provider picker and condition picker; the vendor field is labelled
  "Facility"; the mileage field is hidden.
- **Maintenance form**, when `PERSON`: day interval only.
- `/records`, `/maintenance`, `/costs`, dashboard: people appear through the
  asset index. The Costs type filter gains "People".
- **Download route**: includes condition attachments for the person and
  insurance attachments for policies the person is a member of.

### Report: `/reports/people/[id]`

A printable medical summary, ordered by what a clinician needs first: identity
and date of birth, allergies, active conditions, current medications,
immunizations, insurance (carrier, member ID, group number, phone), providers,
then recent visits. Reuses `asset-report.tsx` where its sections fit and adds
person-only sections where they do not.

## Notifications

`lib/notifications/checker.ts` gains three triggers, deduplicated the same way
as the existing two and included in the email digest:

| Type | Fires when |
|---|---|
| `MEDICATION_REFILL` | active medication with `nextRefillDate` within 7 days |
| `IMMUNIZATION_DUE` | `nextDueDate` within 30 days |
| `INSURANCE_EXPIRING` | policy `endDate` within 60 days |

Checkups use the existing `MAINTENANCE_DUE` path unchanged.

## Phase 0: upload and delete hardening

Medical files must not land on the current upload path. Before anything else:

1. **`lib/upload-path.ts`** — `resolveUploadPath(...segments)` resolves the
   path and throws unless it is inside `path.resolve(UPLOAD_DIR)`. Every `rm`,
   `mkdir` and `writeFile` in `lib/actions/*` and `app/api/**` goes through it.
2. **`/api/uploads`** — allowlist `recordType` (existing three plus
   `CONDITION`, `INSURANCE`); verify `recordId` exists for that type before
   writing; extension allowlist (pdf, jpg, jpeg, png, webp, heic, heif); store
   a MIME type derived from the extension, not the client's.
3. **Delete actions** — look the record up first and return early if absent,
   then delete from disk, then from the database (SEC-001).
4. **`/api/files`** — send `X-Content-Type-Options: nosniff` and a
   `Content-Disposition` header.

SEC-002 (committed `AUTH_SECRET`), SEC-003 (default admin password) and the
authorization findings are out of scope here but should be done soon: medical
data raises the cost of all of them.

## Phases

Each phase leaves the app working and is committed separately on
`people-health`.

0. Upload/delete hardening.
1. Schema and migration: `PERSON`, `Person`, `Provider`, `InsurancePolicy`,
   health tables, medical categories, `ServiceRecord` and `Attachment` links.
2. People list and detail page with Visits, Reminders and cost panel — the
   reuse layer. People are usable from here on.
3. Conditions, Medications, Allergies, Immunizations tabs.
4. Providers and Insurance pages.
5. Notification triggers.
6. Medical summary report, download-all coverage, demo seed data.

## Error handling

Matches the existing actions: `auth()` check, zod `safeParse`, `fieldErrors`
returned to the dialog, toast on success or failure, `revalidatePath` on the
affected pages, `notFound()` for a missing person, provider or policy.

## Testing

The repo has no test runner. Add **Vitest** for pure logic only:

- `resolveUploadPath` rejects traversal and accepts valid paths;
- age calculation from date of birth;
- medication active/refill-due and immunization-due date logic;
- cost rollups including `PERSON` rows and medical categories.

Every phase is also verified by `npm run lint`, `next build`, and driving the
app. The migration is tested against a copy of `prisma/dev.db` before touching
the real one.

## Out of scope

- Per-person access control (design leaves room; v1 has none).
- Encryption at rest, audit logging.
- Parsing receipts or lab results automatically.
- Pets.
- Patient-portal or pharmacy integrations.
