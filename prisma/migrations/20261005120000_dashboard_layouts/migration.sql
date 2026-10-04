-- AlterEnum
ALTER TYPE "ProposalType" ADD VALUE 'DASHBOARD_LAYOUT';

-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "motion" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardLayout_teacherId_lastUsedAt_idx" ON "DashboardLayout"("teacherId", "lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayout_teacherId_name_key" ON "DashboardLayout"("teacherId", "name");

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
