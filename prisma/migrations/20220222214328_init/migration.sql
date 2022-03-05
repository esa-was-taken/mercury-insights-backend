/*
  Warnings:

  - The primary key for the `TConnection` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `TUser` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "TConnection" DROP CONSTRAINT "TConnection_fromId_fkey";

-- DropForeignKey
ALTER TABLE "TConnection" DROP CONSTRAINT "TConnection_toId_fkey";

-- DropIndex
DROP INDEX "TConnection_fromId_toId_version_idx";

-- DropIndex
DROP INDEX "TConnection_version_idx";

-- DropIndex
DROP INDEX "TUser_scrapedAt_idx";

-- DropIndex
DROP INDEX "TUser_username_idx";

-- AlterTable
ALTER TABLE "TConnection" DROP CONSTRAINT "TConnection_pkey",
ALTER COLUMN "fromId" SET DATA TYPE TEXT,
ALTER COLUMN "toId" SET DATA TYPE TEXT,
ADD CONSTRAINT "TConnection_pkey" PRIMARY KEY ("fromId", "toId", "version");

-- AlterTable
ALTER TABLE "TUser" DROP CONSTRAINT "TUser_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "TUser_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "TConnection_fromId_idx" ON "TConnection"("fromId");

-- CreateIndex
CREATE INDEX "TConnection_toId_idx" ON "TConnection"("toId");

-- CreateIndex
CREATE INDEX "TConnection_version_idx" ON "TConnection"("version");

-- CreateIndex
CREATE INDEX "TUser_username_idx" ON "TUser"("username");

-- CreateIndex
CREATE INDEX "TUser_scrapedAt_idx" ON "TUser"("scrapedAt");

-- AddForeignKey
ALTER TABLE "TConnection" ADD CONSTRAINT "TConnection_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "TUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TConnection" ADD CONSTRAINT "TConnection_toId_fkey" FOREIGN KEY ("toId") REFERENCES "TUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
