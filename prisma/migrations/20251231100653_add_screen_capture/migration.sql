/*
  Warnings:

  - The values [COMPANY_ADMIN] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "CaptureStatus" AS ENUM ('SUCCESS', 'FAILED', 'PERMISSION_DENIED', 'IDLE_DETECTED', 'SCREEN_LOCKED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('WINDOWS', 'MAC', 'LINUX');

-- CreateEnum
CREATE TYPE "AgentActivityType" AS ENUM ('STARTED', 'STOPPED', 'HEARTBEAT', 'CAPTURE_SUCCESS', 'CAPTURE_FAILED', 'ERROR', 'UPDATED', 'PERMISSION_CHANGED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'SCREENSHOT_CAPTURED';
ALTER TYPE "ActivityType" ADD VALUE 'SCREENSHOT_DELETED';
ALTER TYPE "ActivityType" ADD VALUE 'AGENT_REGISTERED';
ALTER TYPE "ActivityType" ADD VALUE 'AGENT_DISCONNECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SCREENSHOT_DELETED';
ALTER TYPE "NotificationType" ADD VALUE 'TIME_DEDUCTED';
ALTER TYPE "NotificationType" ADD VALUE 'AGENT_OFFLINE';
ALTER TYPE "NotificationType" ADD VALUE 'AGENT_INSTALLED';

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('USER', 'QC_ADMIN', 'COMPANY', 'SUPER_ADMIN');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';
COMMIT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "screenCaptureEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "screenCaptureEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "screenCaptureInterval" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "time_trackings" ADD COLUMN     "screenCaptureRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timeDeducted" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "screenshots" (
    "id" TEXT NOT NULL,
    "timeTrackingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intervalStart" TIMESTAMP(3) NOT NULL,
    "intervalEnd" TIMESTAMP(3) NOT NULL,
    "intervalMinutes" INTEGER NOT NULL,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "monitorIndex" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "captureStatus" "CaptureStatus" NOT NULL DEFAULT 'SUCCESS',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletionReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desktop_agents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "machineName" TEXT,
    "platform" "Platform" NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "lastHeartbeat" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "installDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "captureQuality" INTEGER NOT NULL DEFAULT 70,
    "captureAllMonitors" BOOLEAN NOT NULL DEFAULT false,
    "agentToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "desktop_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_activity_logs" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "activityType" "AgentActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screenshots_timeTrackingId_idx" ON "screenshots"("timeTrackingId");

-- CreateIndex
CREATE INDEX "screenshots_userId_idx" ON "screenshots"("userId");

-- CreateIndex
CREATE INDEX "screenshots_capturedAt_idx" ON "screenshots"("capturedAt");

-- CreateIndex
CREATE INDEX "screenshots_expiresAt_idx" ON "screenshots"("expiresAt");

-- CreateIndex
CREATE INDEX "screenshots_isDeleted_idx" ON "screenshots"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "desktop_agents_agentToken_key" ON "desktop_agents"("agentToken");

-- CreateIndex
CREATE INDEX "desktop_agents_userId_idx" ON "desktop_agents"("userId");

-- CreateIndex
CREATE INDEX "desktop_agents_agentToken_idx" ON "desktop_agents"("agentToken");

-- CreateIndex
CREATE INDEX "desktop_agents_isOnline_idx" ON "desktop_agents"("isOnline");

-- CreateIndex
CREATE UNIQUE INDEX "desktop_agents_userId_machineId_key" ON "desktop_agents"("userId", "machineId");

-- CreateIndex
CREATE INDEX "agent_activity_logs_agentId_idx" ON "agent_activity_logs"("agentId");

-- CreateIndex
CREATE INDEX "agent_activity_logs_createdAt_idx" ON "agent_activity_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_timeTrackingId_fkey" FOREIGN KEY ("timeTrackingId") REFERENCES "time_trackings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desktop_agents" ADD CONSTRAINT "desktop_agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
