-- DropIndex
DROP INDEX "TConnection_createdAt_idx";

-- DropIndex
DROP INDEX "TConnection_fromId_idx";

-- DropIndex
DROP INDEX "TConnection_fromId_toId_version_idx";

-- DropIndex
DROP INDEX "TConnection_toId_idx";

-- DropIndex
DROP INDEX "TConnection_version_idx";

-- DropIndex
DROP INDEX "TUser_scrapedAt_idx";

-- DropIndex
DROP INDEX "TUser_username_idx";

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
