-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "nameChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "logo" TEXT;

-- CreateTable
CREATE TABLE "OneTimeCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneTimeCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OneTimeCode_code_key" ON "OneTimeCode"("code");

-- CreateIndex
CREATE INDEX "OneTimeCode_code_idx" ON "OneTimeCode"("code");

-- CreateIndex
CREATE INDEX "OneTimeCode_expiresAt_idx" ON "OneTimeCode"("expiresAt");

-- CreateIndex
CREATE INDEX "OneTimeCode_userId_idx" ON "OneTimeCode"("userId");

-- AddForeignKey
ALTER TABLE "OneTimeCode" ADD CONSTRAINT "OneTimeCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
