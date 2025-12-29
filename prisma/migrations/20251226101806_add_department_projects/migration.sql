-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- CreateTable
CREATE TABLE "department_projects" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "department_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "department_projects_departmentId_idx" ON "department_projects"("departmentId");

-- CreateIndex
CREATE INDEX "department_projects_projectId_idx" ON "department_projects"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "department_projects_departmentId_projectId_key" ON "department_projects"("departmentId", "projectId");

-- AddForeignKey
ALTER TABLE "department_projects" ADD CONSTRAINT "department_projects_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_projects" ADD CONSTRAINT "department_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_projects" ADD CONSTRAINT "department_projects_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
