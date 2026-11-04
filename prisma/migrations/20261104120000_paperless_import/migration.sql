-- CreateTable
CREATE TABLE "PaperlessSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT,
    "apiTokenEnc" TEXT,
    "access" TEXT NOT NULL DEFAULT 'EVERYONE',
    "schedule" TEXT NOT NULL DEFAULT 'OFF',
    "time" TEXT NOT NULL DEFAULT '03:30',
    "weekday" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" DATETIME,
    "lastCheckSummary" TEXT,
    "lastCheckError" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "serviceRecordId" TEXT,
    "warrantyId" TEXT,
    "maintenanceScheduleId" TEXT,
    "healthConditionId" TEXT,
    "insurancePolicyId" TEXT,
    "observationId" TEXT,
    "medicationId" TEXT,
    "allergyId" TEXT,
    "immunizationId" TEXT,
    "assetType" TEXT,
    "assetId" TEXT,
    "inboxItemId" TEXT,
    "roomId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'LOCAL',
    "paperlessId" INTEGER,
    "paperlessVersionId" INTEGER,
    "paperlessChecksum" TEXT,
    "paperlessTextHash" TEXT,
    "paperlessLinkStatus" TEXT,
    "paperlessSyncedAt" DATETIME,
    "paperlessUpdatedAt" DATETIME,
    CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Attachment_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "Warranty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_maintenanceScheduleId_fkey" FOREIGN KEY ("maintenanceScheduleId") REFERENCES "MaintenanceSchedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_healthConditionId_fkey" FOREIGN KEY ("healthConditionId") REFERENCES "HealthCondition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_insurancePolicyId_fkey" FOREIGN KEY ("insurancePolicyId") REFERENCES "InsurancePolicy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_allergyId_fkey" FOREIGN KEY ("allergyId") REFERENCES "Allergy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_immunizationId_fkey" FOREIGN KEY ("immunizationId") REFERENCES "Immunization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_inboxItemId_fkey" FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Attachment" ("allergyId", "assetId", "assetType", "filename", "healthConditionId", "id", "immunizationId", "inboxItemId", "insurancePolicyId", "maintenanceScheduleId", "medicationId", "mimeType", "observationId", "originalName", "recordType", "roomId", "serviceRecordId", "sizeBytes", "uploadedAt", "uploadedById", "warrantyId") SELECT "allergyId", "assetId", "assetType", "filename", "healthConditionId", "id", "immunizationId", "inboxItemId", "insurancePolicyId", "maintenanceScheduleId", "medicationId", "mimeType", "observationId", "originalName", "recordType", "roomId", "serviceRecordId", "sizeBytes", "uploadedAt", "uploadedById", "warrantyId" FROM "Attachment";
DROP TABLE "Attachment";
ALTER TABLE "new_Attachment" RENAME TO "Attachment";
CREATE INDEX "Attachment_paperlessId_idx" ON "Attachment"("paperlessId");
CREATE INDEX "Attachment_roomId_idx" ON "Attachment"("roomId");
CREATE INDEX "Attachment_assetType_assetId_idx" ON "Attachment"("assetType", "assetId");
CREATE INDEX "Attachment_inboxItemId_idx" ON "Attachment"("inboxItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
