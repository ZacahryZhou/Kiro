import type { Prisma } from "@prisma/client";
import type { Citation } from "@/contracts";
import { prisma } from "@/lib/db/prisma";
import { MAX_CONVERSATIONS, type AttachmentRecord, type ConversationRecord, type ConversationStore, type MessageRecord } from "./conversations";

// Database version of the conversation store. Every query is scoped by actorId.

function toConversation(row: { id: string; actorId: string; courseId: string | null; title: string; createdAt: Date; updatedAt: Date }): ConversationRecord {
  return { id: row.id, actorId: row.actorId, ...(row.courseId ? { courseId: row.courseId } : {}), title: row.title, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function toMessage(row: { id: string; conversationId: string; role: string; content: string; proposalIds: string[]; citations: Prisma.JsonValue | null; attachments: Prisma.JsonValue | null; modelContext: string | null; createdAt: Date }): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    proposalIds: row.proposalIds,
    citations: Array.isArray(row.citations) ? (row.citations as unknown as Citation[]) : [],
    attachments: Array.isArray(row.attachments) ? (row.attachments as unknown as AttachmentRecord[]) : [],
    ...(row.modelContext ? { modelContext: row.modelContext } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export const prismaConversationStore: ConversationStore = {
  async create(actorId, title, courseId) {
    const count = await prisma.agentConversation.count({ where: { actorId } });
    if (count >= MAX_CONVERSATIONS) {
      const oldest = await prisma.agentConversation.findMany({ where: { actorId }, orderBy: { updatedAt: "asc" }, take: count - MAX_CONVERSATIONS + 1, select: { id: true } });
      await prisma.agentConversation.deleteMany({ where: { actorId, id: { in: oldest.map((c) => c.id) } } });
    }
    return toConversation(await prisma.agentConversation.create({ data: { actorId, title: title.slice(0, 120), courseId: courseId ?? null } }));
  },
  async get(actorId, id) {
    const row = await prisma.agentConversation.findFirst({ where: { id, actorId } });
    return row ? toConversation(row) : undefined;
  },
  async list(actorId, limit = 50, courseId) {
    return (await prisma.agentConversation.findMany({ where: { actorId, courseId: courseId ?? null }, orderBy: { updatedAt: "desc" }, take: limit })).map(toConversation);
  },
  async rename(actorId, id, title) {
    const updated = await prisma.agentConversation.updateMany({ where: { id, actorId }, data: { title: title.slice(0, 120) } });
    if (updated.count === 0) return undefined;
    const row = await prisma.agentConversation.findFirst({ where: { id, actorId } });
    return row ? toConversation(row) : undefined;
  },
  async remove(actorId, id) {
    return (await prisma.agentConversation.deleteMany({ where: { id, actorId } })).count > 0;
  },
  async addMessage(actorId, conversationId, message) {
    const owner = await prisma.agentConversation.findFirst({ where: { id: conversationId, actorId }, select: { id: true } });
    if (!owner) return undefined;
    const [row] = await prisma.$transaction([
      prisma.agentMessage.create({
        data: { conversationId, role: message.role, content: message.content, proposalIds: message.proposalIds ?? [], citations: message.citations && message.citations.length > 0 ? (message.citations as unknown as Prisma.InputJsonValue) : undefined,
          attachments: message.attachments && message.attachments.length > 0 ? (message.attachments as unknown as Prisma.InputJsonValue) : undefined,
          modelContext: message.modelContext || null,
        },
      }),
      prisma.agentConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
    ]);
    return toMessage(row);
  },
  async messages(actorId, conversationId, last) {
    const owner = await prisma.agentConversation.findFirst({ where: { id: conversationId, actorId }, select: { id: true } });
    if (!owner) return [];
    if (last) {
      const rows = await prisma.agentMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: last });
      return rows.reverse().map(toMessage);
    }
    return (await prisma.agentMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } })).map(toMessage);
  },
  async count(actorId, conversationId) {
    return prisma.agentMessage.count({ where: { conversationId, conversation: { actorId } } });
  },
  async withProposals(actorId, proposalIds) {
    if (proposalIds.length === 0) return new Set();
    const rows = await prisma.agentMessage.findMany({ where: { conversation: { actorId }, proposalIds: { hasSome: proposalIds } }, select: { conversationId: true } });
    return new Set(rows.map((r) => r.conversationId));
  },
};
