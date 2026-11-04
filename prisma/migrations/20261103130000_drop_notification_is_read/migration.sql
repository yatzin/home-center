
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedEntityId" TEXT,
    "relatedEntityType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailedAt" DATETIME,
    "pushedAt" DATETIME,
    "dismissedAt" DATETIME,
    "cycleKey" TEXT,
    "stage" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Notification" ("createdAt", "cycleKey", "dismissedAt", "emailedAt", "id", "message", "pushedAt", "relatedEntityId", "relatedEntityType", "stage", "title", "type", "userId") SELECT "createdAt", "cycleKey", "dismissedAt", "emailedAt", "id", "message", "pushedAt", "relatedEntityId", "relatedEntityType", "stage", "title", "type", "userId" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

