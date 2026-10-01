-- CreateTable
CREATE TABLE "AttachmentText" (
    "attachmentId" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "text" TEXT,
    "pageCount" INTEGER,
    "charCount" INTEGER,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "extractorVersion" INTEGER NOT NULL DEFAULT 0,
    "extractedAt" DATETIME,
    CONSTRAINT "AttachmentText_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "indexingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ocrEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LlmSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT,
    "apiKeyEnc" TEXT,
    "model" TEXT,
    "temperature" REAL,
    "maxTokens" INTEGER,
    "systemPrompt" TEXT,
    "timeoutSeconds" INTEGER,
    "maxToolRounds" INTEGER,
    "extraBody" TEXT,
    "documentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "healthDocumentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_LlmSettings" ("apiKeyEnc", "baseUrl", "enabled", "extraBody", "hidden", "id", "maxTokens", "maxToolRounds", "model", "systemPrompt", "temperature", "timeoutSeconds", "updatedAt") SELECT "apiKeyEnc", "baseUrl", "enabled", "extraBody", "hidden", "id", "maxTokens", "maxToolRounds", "model", "systemPrompt", "temperature", "timeoutSeconds", "updatedAt" FROM "LlmSettings";
DROP TABLE "LlmSettings";
ALTER TABLE "new_LlmSettings" RENAME TO "LlmSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AttachmentText_status_idx" ON "AttachmentText"("status");

-- Every existing upload gets a PENDING row so the boot reconcile indexes it.
INSERT INTO "AttachmentText" ("attachmentId") SELECT "id" FROM "Attachment";
