/*
  Warnings:

  - The primary key for the `TConnection` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `TUser` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `fromId` on the `TConnection` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `toId` on the `TConnection` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `TUser` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "TConnection" DROP CONSTRAINT "TConnection_fromId_fkey";

-- DropForeignKey
ALTER TABLE "TConnection" DROP CONSTRAINT "TConnection_toId_fkey";

-- DropIndex
DROP INDEX "TConnection_version_idx";

-- DropIndex
DROP INDEX "TUser_scrapedAt_idx";

-- DropIndex
DROP INDEX "TUser_username_idx";

-- AlterTable
ALTER TABLE "TConnection" DROP CONSTRAINT "TConnection_pkey",
DROP COLUMN "fromId",
ADD COLUMN     "fromId" BIGINT NOT NULL,
DROP COLUMN "toId",
ADD COLUMN     "toId" BIGINT NOT NULL,
ADD CONSTRAINT "TConnection_pkey" PRIMARY KEY ("fromId", "toId", "version");

-- AlterTable
ALTER TABLE "TUser" DROP CONSTRAINT "TUser_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" BIGINT NOT NULL,
ADD CONSTRAINT "TUser_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "TConnection_version_idx" ON "TConnection"("version");

-- CreateIndex
CREATE INDEX "TUser_username_idx" ON "TUser"("username");

-- CreateIndex
CREATE INDEX "TUser_scrapedAt_idx" ON "TUser"("scrapedAt");

-- AddForeignKey
ALTER TABLE "TConnection" ADD CONSTRAINT "TConnection_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "TUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TConnection" ADD CONSTRAINT "TConnection_toId_fkey" FOREIGN KEY ("toId") REFERENCES "TUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
