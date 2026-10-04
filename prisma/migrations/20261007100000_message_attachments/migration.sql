-- AlterTable
ALTER TABLE "AgentMessage" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "modelContext" TEXT;
