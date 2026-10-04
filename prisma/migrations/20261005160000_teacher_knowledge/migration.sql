-- AlterEnum
ALTER TYPE "ProposalType" ADD VALUE 'KNOWLEDGE';

-- CreateEnum
CREATE TYPE "KnowledgeKind" AS ENUM ('LESSON_SUMMARY', 'KNOWLEDGE_POINT', 'COMMON_MISTAKE', 'EXAMPLE', 'FAQ', 'TEACHING_STYLE');

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT,
    "kind" "KnowledgeKind" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeEntry_teacherId_courseId_idx" ON "KnowledgeEntry"("teacherId", "courseId");

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
