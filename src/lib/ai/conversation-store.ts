import { createMemoryConversationStore } from "./core/conversations";
import { prismaConversationStore } from "./core/prisma-conversation-store";
import { useRealBackend } from "./runtime";

// A global singleton in development, so every route handler sees the same chats when no database is used.
const globalForConversations = globalThis as unknown as { __koraConversationStore?: ReturnType<typeof createMemoryConversationStore> };
export const memoryConversationStore = (globalForConversations.__koraConversationStore ??= createMemoryConversationStore());

/** The store the app uses: the database in Next.js, memory in plain check scripts. */
export const conversationStore = useRealBackend ? prismaConversationStore : memoryConversationStore;
