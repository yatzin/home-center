-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "data" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
