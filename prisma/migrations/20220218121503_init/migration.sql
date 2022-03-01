-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "TUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "marked" BOOLEAN NOT NULL DEFAULT false,
    "scrapedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TConnection" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ConnectionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TConnection_pkey" PRIMARY KEY ("fromId","toId","version")
);

-- CreateIndex
CREATE INDEX "TUser_username_idx" ON "TUser"("username");

-- CreateIndex
CREATE INDEX "TUser_marked_idx" ON "TUser" USING HASH ("marked");

-- CreateIndex
CREATE INDEX "TUser_scrapedAt_idx" ON "TUser"("scrapedAt");

-- CreateIndex
CREATE INDEX "TConnection_version_idx" ON "TConnection"("version");

-- CreateIndex
CREATE INDEX "TConnection_status_idx" ON "TConnection" USING HASH ("status");

-- AddForeignKey
ALTER TABLE "TConnection" ADD CONSTRAINT "TConnection_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "TUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TConnection" ADD CONSTRAINT "TConnection_toId_fkey" FOREIGN KEY ("toId") REFERENCES "TUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
