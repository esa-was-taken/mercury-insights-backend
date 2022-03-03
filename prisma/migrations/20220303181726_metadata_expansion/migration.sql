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

-- CreateTable
CREATE TABLE "TUserMetadata" (
    "id" TEXT NOT NULL,
    "tUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "description" TEXT,
    "entities" JSONB,
    "location" TEXT,
    "pinned_tweet_id" TEXT,
    "profile_image_url" TEXT,
    "protected" BOOLEAN,
    "url" TEXT,
    "verified" BOOLEAN,
    "recordCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TUserMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TUserPublicMetrics" (
    "id" TEXT NOT NULL,
    "tUserId" TEXT NOT NULL,
    "followers_count" INTEGER,
    "following_count" INTEGER,
    "tweet_count" INTEGER,
    "listed_count" INTEGER,
    "recordCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TUserPublicMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TUserMetadata_tUserId_key" ON "TUserMetadata"("tUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TUserPublicMetrics_tUserId_key" ON "TUserPublicMetrics"("tUserId");

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

-- AddForeignKey
ALTER TABLE "TUserMetadata" ADD CONSTRAINT "TUserMetadata_tUserId_fkey" FOREIGN KEY ("tUserId") REFERENCES "TUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TUserPublicMetrics" ADD CONSTRAINT "TUserPublicMetrics_tUserId_fkey" FOREIGN KEY ("tUserId") REFERENCES "TUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
