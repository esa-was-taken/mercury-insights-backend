/*
  Warnings:

  - The primary key for the `TConnection` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `status` on the `TConnection` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `TConnection` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tUserId]` on the table `TUserMetadata` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tUserId]` on the table `TUserPublicMetrics` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `currentVersion` to the `TConnection` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "TConnection_createdAt_idx";

-- DropIndex
DROP INDEX "TConnection_fromId_idx";

-- DropIndex
DROP INDEX "TConnection_fromId_toId_version_idx";

-- DropIndex
DROP INDEX "TConnection_status_idx";

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
ALTER TABLE "TConnection" DROP CONSTRAINT "TConnection_pkey",
DROP COLUMN "status",
DROP COLUMN "version",
ADD COLUMN     "currentVersion" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD CONSTRAINT "TConnection_pkey" PRIMARY KEY ("fromId", "toId");

-- CreateTable
CREATE TABLE "TConnectionVersion" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ConnectionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TConnectionVersion_pkey" PRIMARY KEY ("fromId","toId","version")
);

-- CreateIndex
CREATE INDEX "TConnectionVersion_createdAt_idx" ON "TConnectionVersion"("createdAt");

-- CreateIndex
CREATE INDEX "TConnection_fromId_idx" ON "TConnection"("fromId");

-- CreateIndex
CREATE INDEX "TConnection_toId_idx" ON "TConnection"("toId");

-- CreateIndex
CREATE INDEX "TUser_username_idx" ON "TUser"("username");

-- CreateIndex
CREATE INDEX "TUser_scrapedAt_idx" ON "TUser"("scrapedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TUserMetadata_tUserId_key" ON "TUserMetadata"("tUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TUserPublicMetrics_tUserId_key" ON "TUserPublicMetrics"("tUserId");

-- AddForeignKey
ALTER TABLE "TConnectionVersion" ADD CONSTRAINT "TConnectionVersion_fromId_toId_fkey" FOREIGN KEY ("fromId", "toId") REFERENCES "TConnection"("fromId", "toId") ON DELETE CASCADE ON UPDATE CASCADE;
