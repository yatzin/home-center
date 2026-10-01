-- CreateTable
CREATE TABLE "FeatureSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "healthEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
