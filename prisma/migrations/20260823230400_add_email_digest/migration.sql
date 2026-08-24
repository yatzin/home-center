-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "emailedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "mustResetPassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailDigest" TEXT NOT NULL DEFAULT 'DAILY',
    "lastDigestAt" DATETIME
);
INSERT INTO "new_User" ("createdAt", "email", "id", "mustResetPassword", "name", "passwordHash", "role") SELECT "createdAt", "email", "id", "mustResetPassword", "name", "passwordHash", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
