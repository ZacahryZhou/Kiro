-- CreateEnum
CREATE TYPE "ProgressNextAction" AS ENUM ('PRACTICE', 'REVIEW', 'EXTRA_MATERIAL', 'RECAP_NEXT');

-- CreateTable
CREATE TABLE "ProgressRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "issue" TEXT,
    "nextAction" "ProgressNextAction" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProgressRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgressRecord_studentId_createdAt_idx" ON "ProgressRecord"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressRecord_sessionId_studentId_key" ON "ProgressRecord"("sessionId", "studentId");

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
