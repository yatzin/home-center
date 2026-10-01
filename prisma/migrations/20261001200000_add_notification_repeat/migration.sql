-- AlterTable
ALTER TABLE "User" ADD COLUMN "notificationRepeat" TEXT NOT NULL DEFAULT 'REACHED_AND_DUE';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "cycleKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN "stage" TEXT;
