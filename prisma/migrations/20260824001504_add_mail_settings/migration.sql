-- CreateTable
CREATE TABLE "MailSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "host" TEXT,
    "port" INTEGER,
    "username" TEXT,
    "passwordEnc" TEXT,
    "secure" BOOLEAN,
    "fromAddress" TEXT,
    "digestHour" INTEGER,
    "updatedAt" DATETIME NOT NULL
);
