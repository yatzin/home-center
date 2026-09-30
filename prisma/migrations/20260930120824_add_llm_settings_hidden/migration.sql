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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_LlmSettings" ("apiKeyEnc", "baseUrl", "enabled", "extraBody", "id", "maxTokens", "maxToolRounds", "model", "systemPrompt", "temperature", "timeoutSeconds", "updatedAt") SELECT "apiKeyEnc", "baseUrl", "enabled", "extraBody", "id", "maxTokens", "maxToolRounds", "model", "systemPrompt", "temperature", "timeoutSeconds", "updatedAt" FROM "LlmSettings";
DROP TABLE "LlmSettings";
ALTER TABLE "new_LlmSettings" RENAME TO "LlmSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
