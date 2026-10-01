-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "dismissedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
