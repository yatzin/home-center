-- CreateTable
CREATE TABLE "LlmSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT,
    "apiKeyEnc" TEXT,
    "model" TEXT,
    "temperature" REAL,
    "maxTokens" INTEGER,
    "systemPrompt" TEXT,
    "updatedAt" DATETIME NOT NULL
);
