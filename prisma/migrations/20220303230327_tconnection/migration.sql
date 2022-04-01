/*
  Warnings:

  - You are about to drop the column `currentVersion` on the `TConnection` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tUserId]` on the table `TUserMetadata` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tUserId]` on the table `TUserPublicMetrics` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `versionValue` to the `TConnection` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "TConnectionVersion" DROP CONSTRAINT "TConnectionVersion_fromId_toId_fkey";

-- DropIndex
DROP INDEX "TConnection_fromId_idx";

-- DropIndex
DROP INDEX "TConnection_toId_idx";

-- DropIndex
DROP INDEX "TConnectionVersion_createdAt_idx";

-- DropIndex
DROP INDEX "TUser_scrapedAt_idx";

-- DropIndex
DROP INDEX "TUser_username_idx";

-- DropIndex
DROP INDEX "TUserMetadata_tUserId_key";

-- DropIndex
DROP INDEX "TUserPublicMetrics_tUserId_key";

-- AlterTable
ALTER TABLE "TConnection" DROP COLUMN "currentVersion",
ADD COLUMN     "versionValue" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "TConnection_fromId_idx" ON "TConnection"("fromId");

-- CreateIndex
CREATE INDEX "TConnection_toId_idx" ON "TConnection"("toId");

-- CreateIndex
CREATE INDEX "TConnectionVersion_fromId_idx" ON "TConnectionVersion"("fromId");

-- CreateIndex
CREATE INDEX "TConnectionVersion_toId_idx" ON "TConnectionVersion"("toId");

-- CreateIndex
CREATE INDEX "TConnectionVersion_createdAt_idx" ON "TConnectionVersion"("createdAt");

-- CreateIndex
CREATE INDEX "TUser_username_idx" ON "TUser"("username");

-- CreateIndex
CREATE INDEX "TUser_scrapedAt_idx" ON "TUser"("scrapedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TUserMetadata_tUserId_key" ON "TUserMetadata"("tUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TUserPublicMetrics_tUserId_key" ON "TUserPublicMetrics"("tUserId");

-- AddForeignKey
ALTER TABLE "TConnection" ADD CONSTRAINT "TConnection_fromId_toId_versionValue_fkey" FOREIGN KEY ("fromId", "toId", "versionValue") REFERENCES "TConnectionVersion"("fromId", "toId", "version") ON DELETE CASCADE ON UPDATE CASCADE;
