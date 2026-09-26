-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'OTHER',
    "dateOfBirth" DATETIME,
    "sex" TEXT,
    "bloodType" TEXT,
    "notes" TEXT,
    "imageFilename" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "primaryProviderId" TEXT,
    CONSTRAINT "Person_primaryProviderId_fkey" FOREIGN KEY ("primaryProviderId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "practice" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HealthCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "diagnosedDate" DATETIME,
    "resolvedDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "personId" TEXT NOT NULL,
    "providerId" TEXT,
    CONSTRAINT "HealthCondition_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HealthCondition_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "dosage" TEXT,
    "frequency" TEXT,
    "pharmacy" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "refillIntervalDays" INTEGER,
    "nextRefillDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "personId" TEXT NOT NULL,
    "prescriberId" TEXT,
    "conditionId" TEXT,
    CONSTRAINT "Medication_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Medication_prescriberId_fkey" FOREIGN KEY ("prescriberId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Medication_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "HealthCondition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Allergy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MODERATE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "personId" TEXT NOT NULL,
    CONSTRAINT "Allergy_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Immunization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vaccine" TEXT NOT NULL,
    "dateGiven" DATETIME NOT NULL,
    "dose" TEXT,
    "givenBy" TEXT,
    "nextDueDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "personId" TEXT NOT NULL,
    CONSTRAINT "Immunization_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carrier" TEXT NOT NULL,
    "planName" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'MEDICAL',
    "policyNumber" TEXT,
    "groupNumber" TEXT,
    "memberId" TEXT,
    "phone" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "deductible" REAL,
    "outOfPocketMax" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_InsurancePolicyToPerson" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_InsurancePolicyToPerson_A_fkey" FOREIGN KEY ("A") REFERENCES "InsurancePolicy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_InsurancePolicyToPerson_B_fkey" FOREIGN KEY ("B") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "uploadedById" TEXT NOT NULL,
    "serviceRecordId" TEXT,
    "warrantyId" TEXT,
    "maintenanceScheduleId" TEXT,
    "healthConditionId" TEXT,
    "insurancePolicyId" TEXT,
    CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Attachment_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "Warranty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_maintenanceScheduleId_fkey" FOREIGN KEY ("maintenanceScheduleId") REFERENCES "MaintenanceSchedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_healthConditionId_fkey" FOREIGN KEY ("healthConditionId") REFERENCES "HealthCondition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_insurancePolicyId_fkey" FOREIGN KEY ("insurancePolicyId") REFERENCES "InsurancePolicy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Attachment" ("filename", "id", "maintenanceScheduleId", "mimeType", "originalName", "recordType", "serviceRecordId", "sizeBytes", "uploadedAt", "uploadedById", "warrantyId") SELECT "filename", "id", "maintenanceScheduleId", "mimeType", "originalName", "recordType", "serviceRecordId", "sizeBytes", "uploadedAt", "uploadedById", "warrantyId" FROM "Attachment";
DROP TABLE "Attachment";
ALTER TABLE "new_Attachment" RENAME TO "Attachment";
CREATE TABLE "new_ServiceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vendor" TEXT,
    "cost" REAL,
    "category" TEXT,
    "mileageAtService" INTEGER,
    "providerId" TEXT,
    "conditionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "ServiceRecord_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ServiceRecord_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "HealthCondition" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ServiceRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ServiceRecord" ("assetId", "assetType", "category", "cost", "createdAt", "createdById", "date", "description", "id", "mileageAtService", "title", "updatedAt", "vendor") SELECT "assetId", "assetType", "category", "cost", "createdAt", "createdById", "date", "description", "id", "mileageAtService", "title", "updatedAt", "vendor" FROM "ServiceRecord";
DROP TABLE "ServiceRecord";
ALTER TABLE "new_ServiceRecord" RENAME TO "ServiceRecord";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "_InsurancePolicyToPerson_AB_unique" ON "_InsurancePolicyToPerson"("A", "B");

-- CreateIndex
CREATE INDEX "_InsurancePolicyToPerson_B_index" ON "_InsurancePolicyToPerson"("B");
