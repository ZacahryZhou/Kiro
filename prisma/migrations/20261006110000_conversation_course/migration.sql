-- AlterTable
ALTER TABLE "AgentConversation" ADD COLUMN "courseId" TEXT;

-- DropIndex
DROP INDEX "AgentConversation_actorId_updatedAt_idx";

-- CreateIndex
CREATE INDEX "AgentConversation_actorId_courseId_updatedAt_idx" ON "AgentConversation"("actorId", "courseId", "updatedAt");

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
