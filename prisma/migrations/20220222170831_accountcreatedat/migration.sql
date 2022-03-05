-- DropIndex
DROP INDEX "TConnection_fromId_toId_version_idx";

-- DropIndex
DROP INDEX "TConnection_version_idx";

-- DropIndex
DROP INDEX "TUser_scrapedAt_idx";

-- DropIndex
DROP INDEX "TUser_username_idx";

-- AlterTable
ALTER TABLE "TUser" ADD COLUMN     "accountCreatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TConnection_version_idx" ON "TConnection"("version");

-- CreateIndex
CREATE INDEX "TConnection_fromId_toId_version_idx" ON "TConnection"("fromId", "toId", "version" DESC);

-- CreateIndex
CREATE INDEX "TUser_username_idx" ON "TUser"("username");

-- CreateIndex
CREATE INDEX "TUser_scrapedAt_idx" ON "TUser"("scrapedAt");
