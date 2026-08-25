-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "vin" TEXT,
    "color" TEXT,
    "purchaseDate" DATETIME,
    "currentMileage" INTEGER,
    "meterUnit" TEXT NOT NULL DEFAULT 'MILES',
    "notes" TEXT,
    "imageFilename" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Vehicle" ("color", "createdAt", "currentMileage", "id", "imageFilename", "make", "model", "name", "notes", "purchaseDate", "updatedAt", "vin", "year") SELECT "color", "createdAt", "currentMileage", "id", "imageFilename", "make", "model", "name", "notes", "purchaseDate", "updatedAt", "vin", "year" FROM "Vehicle";
DROP TABLE "Vehicle";
ALTER TABLE "new_Vehicle" RENAME TO "Vehicle";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
