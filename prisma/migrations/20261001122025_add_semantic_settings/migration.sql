-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DocumentSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "indexingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ocrEnabled" BOOLEAN NOT NULL DEFAULT true,
    "semanticEnabled" BOOLEAN NOT NULL DEFAULT true,
    "embeddingModel" TEXT NOT NULL DEFAULT 'bge-small-en-v1.5',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DocumentSettings" ("id", "indexingEnabled", "ocrEnabled", "updatedAt") SELECT "id", "indexingEnabled", "ocrEnabled", "updatedAt" FROM "DocumentSettings";
DROP TABLE "DocumentSettings";
ALTER TABLE "new_DocumentSettings" RENAME TO "DocumentSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
