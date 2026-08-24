-- The READONLY role was never enforced by any write path, so it promised
-- something the app did not do. Dropping it from the enum is not enough on
-- SQLite: Role is a TEXT column with no CHECK constraint, so Prisma emits no
-- DDL for the enum change and any existing rows would keep an invalid value.
-- Demote them explicitly, which matches the access they actually had.
UPDATE "User" SET "role" = 'USER' WHERE "role" = 'READONLY';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MaintenanceSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "intervalDays" INTEGER,
    "intervalMiles" INTEGER,
    "lastCompletedDate" DATETIME,
    "lastCompletedMileage" INTEGER,
    "nextDueDate" DATETIME,
    "nextDueMileage" INTEGER,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 14,
    "reminderMilesBefore" INTEGER NOT NULL DEFAULT 500,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MaintenanceSchedule" ("assetId", "assetType", "createdAt", "description", "id", "intervalDays", "intervalMiles", "isActive", "lastCompletedDate", "lastCompletedMileage", "nextDueDate", "nextDueMileage", "reminderDaysBefore", "title", "updatedAt") SELECT "assetId", "assetType", "createdAt", "description", "id", "intervalDays", "intervalMiles", "isActive", "lastCompletedDate", "lastCompletedMileage", "nextDueDate", "nextDueMileage", "reminderDaysBefore", "title", "updatedAt" FROM "MaintenanceSchedule";
DROP TABLE "MaintenanceSchedule";
ALTER TABLE "new_MaintenanceSchedule" RENAME TO "MaintenanceSchedule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
