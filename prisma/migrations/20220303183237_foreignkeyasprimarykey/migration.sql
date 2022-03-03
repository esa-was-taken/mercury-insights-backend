/*
  Warnings:

  - The primary key for the `TUserMetadata` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `TUserMetadata` table. All the data in the column will be lost.
  - The primary key for the `TUserPublicMetrics` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `TUserPublicMetrics` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tUserId]` on the table `TUserMetadata` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tUserId]` on the table `TUserPublicMetrics` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "TConnection_createdAt_idx";

-- DropIndex
DROP INDEX "TConnection_fromId_idx";

-- DropIndex
DROP INDEX "TConnection_fromId_toId_version_idx";

-- DropIndex
DROP INDEX "TConnection_toId_idx";

-- DropIndex
DROP INDEX "TUser_scrapedAt_idx";

-- DropIndex
DROP INDEX "TUser_username_idx";

-- DropIndex
DROP INDEX "TUserMetadata_tUserId_key";

-- DropIndex
DROP INDEX "TUserPublicMetrics_tUserId_key";

-- AlterTable
ALTER TABLE "TUserMetadata" DROP CONSTRAINT "TUserMetadata_pkey",
DROP COLUMN "id";

-- AlterTable
ALTER TABLE "TUserPublicMetrics" DROP CONSTRAINT "TUserPublicMetrics_pkey",
DROP COLUMN "id";

-- CreateIndex
CREATE INDEX "TConnection_fromId_idx" ON "TConnection"("fromId");

-- CreateIndex
CREATE INDEX "TConnection_toId_idx" ON "TConnection"("toId");

-- CreateIndex
CREATE INDEX "TConnection_fromId_toId_version_idx" ON "TConnection"("fromId", "toId", "version" DESC);

-- CreateIndex
CREATE INDEX "TConnection_createdAt_idx" ON "TConnection"("createdAt");

-- CreateIndex
CREATE INDEX "TUser_username_idx" ON "TUser"("username");

-- CreateIndex
CREATE INDEX "TUser_scrapedAt_idx" ON "TUser"("scrapedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TUserMetadata_tUserId_key" ON "TUserMetadata"("tUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TUserPublicMetrics_tUserId_key" ON "TUserPublicMetrics"("tUserId");
