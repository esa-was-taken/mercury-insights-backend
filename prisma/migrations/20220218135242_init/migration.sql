/*
  Warnings:

  - Made the column `scrapedAt` on table `TUser` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "TConnection_version_idx";

-- DropIndex
DROP INDEX "TUser_scrapedAt_idx";

-- DropIndex
DROP INDEX "TUser_username_idx";

-- AlterTable
ALTER TABLE "TUser" ALTER COLUMN "scrapedAt" SET NOT NULL,
ALTER COLUMN "scrapedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "TConnection_version_idx" ON "TConnection"("version");

-- CreateIndex
CREATE INDEX "TUser_username_idx" ON "TUser"("username");

-- CreateIndex
CREATE INDEX "TUser_scrapedAt_idx" ON "TUser"("scrapedAt");
