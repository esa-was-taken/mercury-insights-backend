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

-- CreateIndex
CREATE INDEX "TConnection_version_idx" ON "TConnection"("version");

-- CreateIndex
CREATE INDEX "TConnection_fromId_toId_version_idx" ON "TConnection"("fromId", "toId", "version" DESC);

-- CreateIndex
CREATE INDEX "TUser_username_idx" ON "TUser"("username");

-- CreateIndex
CREATE INDEX "TUser_scrapedAt_idx" ON "TUser"("scrapedAt");

-- AddForeignKey
ALTER TABLE "TConnection" ADD CONSTRAINT "TConnection_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "TUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TConnection" ADD CONSTRAINT "TConnection_toId_fkey" FOREIGN KEY ("toId") REFERENCES "TUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
