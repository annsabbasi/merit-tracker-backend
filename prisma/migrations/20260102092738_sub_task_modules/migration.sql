-- CreateEnum
CREATE TYPE "SubProjectMemberRole" AS ENUM ('MEMBER', 'CONTRIBUTOR', 'REVIEWER', 'QC_HEAD');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "LeaderboardPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ALL_TIME');

-- CreateEnum
CREATE TYPE "AchievementType" AS ENUM ('FIRST_TASK_COMPLETED', 'TASKS_10_COMPLETED', 'TASKS_50_COMPLETED', 'TASKS_100_COMPLETED', 'TASKS_500_COMPLETED', 'HOURS_10_TRACKED', 'HOURS_50_TRACKED', 'HOURS_100_TRACKED', 'HOURS_500_TRACKED', 'HOURS_1000_TRACKED', 'STREAK_7_DAYS', 'STREAK_30_DAYS', 'STREAK_90_DAYS', 'STREAK_365_DAYS', 'TOP_PERFORMER_WEEK', 'TOP_PERFORMER_MONTH', 'MOST_IMPROVED', 'TEAM_PLAYER', 'MENTOR', 'EARLY_BIRD', 'NIGHT_OWL', 'QUALITY_CHAMPION', 'ZERO_DEFECTS', 'CUSTOM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'SUBPROJECT_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'SUBPROJECT_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'SUBPROJECT_MEMBER_ADDED';
ALTER TYPE "ActivityType" ADD VALUE 'SUBPROJECT_MEMBER_REMOVED';
ALTER TYPE "ActivityType" ADD VALUE 'TASK_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'TASK_ASSIGNED';
ALTER TYPE "ActivityType" ADD VALUE 'TASK_COMPLETED';
ALTER TYPE "ActivityType" ADD VALUE 'TASK_DELETED';
ALTER TYPE "ActivityType" ADD VALUE 'LEADERBOARD_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'ACHIEVEMENT_UNLOCKED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SUBPROJECT_ASSIGNMENT';
ALTER TYPE "NotificationType" ADD VALUE 'SUBPROJECT_MEMBER_ADDED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBPROJECT_QC_HEAD_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_REASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'LEADERBOARD_RANK_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'ACHIEVEMENT_EARNED';
ALTER TYPE "NotificationType" ADD VALUE 'STREAK_MILESTONE';

-- AlterTable
ALTER TABLE "sub_projects" ADD COLUMN     "actualHours" INTEGER,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "qcHeadId" TEXT,
ADD COLUMN     "totalTimeSpent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currentStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActiveDate" TIMESTAMP(3),
ADD COLUMN     "longestStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalPointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalTasksCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalTimeTrackedMinutes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sub_project_members" (
    "id" TEXT NOT NULL,
    "subProjectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SubProjectMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "totalTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sub_project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subProjectId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "pointsValue" INTEGER NOT NULL DEFAULT 10,
    "estimatedMinutes" INTEGER,
    "actualMinutes" INTEGER,
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_time_trackings" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_time_trackings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_snapshots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" "LeaderboardPeriod" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "rank" INTEGER NOT NULL,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "subProjectsContributed" INTEGER NOT NULL DEFAULT 0,
    "projectsContributed" INTEGER NOT NULL DEFAULT 0,
    "performanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leaderboard_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "AchievementType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconUrl" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sub_project_members_subProjectId_idx" ON "sub_project_members"("subProjectId");

-- CreateIndex
CREATE INDEX "sub_project_members_userId_idx" ON "sub_project_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sub_project_members_subProjectId_userId_key" ON "sub_project_members"("subProjectId", "userId");

-- CreateIndex
CREATE INDEX "tasks_subProjectId_idx" ON "tasks"("subProjectId");

-- CreateIndex
CREATE INDEX "tasks_assignedToId_idx" ON "tasks"("assignedToId");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "task_time_trackings_taskId_idx" ON "task_time_trackings"("taskId");

-- CreateIndex
CREATE INDEX "task_time_trackings_userId_idx" ON "task_time_trackings"("userId");

-- CreateIndex
CREATE INDEX "task_time_trackings_isActive_idx" ON "task_time_trackings"("isActive");

-- CreateIndex
CREATE INDEX "leaderboard_snapshots_companyId_periodType_periodStart_idx" ON "leaderboard_snapshots"("companyId", "periodType", "periodStart");

-- CreateIndex
CREATE INDEX "leaderboard_snapshots_userId_idx" ON "leaderboard_snapshots"("userId");

-- CreateIndex
CREATE INDEX "leaderboard_snapshots_rank_idx" ON "leaderboard_snapshots"("rank");

-- CreateIndex
CREATE INDEX "achievements_userId_idx" ON "achievements"("userId");

-- CreateIndex
CREATE INDEX "achievements_companyId_type_idx" ON "achievements"("companyId", "type");

-- CreateIndex
CREATE INDEX "sub_projects_qcHeadId_idx" ON "sub_projects"("qcHeadId");

-- CreateIndex
CREATE INDEX "sub_projects_status_idx" ON "sub_projects"("status");

-- AddForeignKey
ALTER TABLE "sub_projects" ADD CONSTRAINT "sub_projects_qcHeadId_fkey" FOREIGN KEY ("qcHeadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_project_members" ADD CONSTRAINT "sub_project_members_subProjectId_fkey" FOREIGN KEY ("subProjectId") REFERENCES "sub_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_project_members" ADD CONSTRAINT "sub_project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_subProjectId_fkey" FOREIGN KEY ("subProjectId") REFERENCES "sub_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_time_trackings" ADD CONSTRAINT "task_time_trackings_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
