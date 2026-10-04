import type { Citation } from "@/contracts";

// Storage for chats between a signed-in user and the assistant (AgentConversation, AgentMessage).
// Every method takes the actor's id and only ever sees that actor's own rows, so one person can never
// read, continue, rename or delete another person's chat. Each conversation is its own context: the
// assistant is shown the recent messages of the conversation in use and nothing from the others.

export type ConversationRecord = { id: string; actorId: string; courseId?: string; title: string; createdAt: string; updatedAt: string };
export type MessageRecord = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  proposalIds: string[];
  citations: Citation[];
  createdAt: string;
};
export type NewMessage = { role: "user" | "assistant"; content: string; proposalIds?: string[]; citations?: Citation[] };

export const MAX_CONVERSATIONS = 100;
export const MAX_MESSAGES_PER_CONVERSATION = 200;
export const MAX_TITLE = 80;

/** A short title taken from the first thing the user said. */
export function titleFrom(message: string): string {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > MAX_TITLE ? `${flat.slice(0, MAX_TITLE - 1).trimEnd()}…` : flat;
}

export interface ConversationStore {
  /** Starts a chat. When the actor already has MAX_CONVERSATIONS, the least recently used one is removed. */
  create(actorId: string, title: string, courseId?: string): Promise<ConversationRecord>;
  get(actorId: string, id: string): Promise<ConversationRecord | undefined>;
  /** Most recently used first. Without `courseId` only global chats are listed; with it, only that course's chats. */
  list(actorId: string, limit?: number, courseId?: string): Promise<ConversationRecord[]>;
  rename(actorId: string, id: string, title: string): Promise<ConversationRecord | undefined>;
  remove(actorId: string, id: string): Promise<boolean>;
  /** Appends a message and marks the conversation as used. Returns undefined if it is not the actor's. */
  addMessage(actorId: string, conversationId: string, message: NewMessage): Promise<MessageRecord | undefined>;
  /** Oldest first. With `last`, only the most recent `last` messages. */
  messages(actorId: string, conversationId: string, last?: number): Promise<MessageRecord[]>;
  count(actorId: string, conversationId: string): Promise<number>;
  /** Ids of the actor's conversations that contain any of these proposals (used to flag chats waiting for a decision). */
  withProposals(actorId: string, proposalIds: string[]): Promise<Set<string>>;
}

export function createMemoryConversationStore(): ConversationStore & { clear(): void } {
  const conversations = new Map<string, ConversationRecord>();
  const messages = new Map<string, MessageRecord[]>();
  let counter = 0;
  let clock = 0;
  const stamp = () => new Date(Date.now() + (clock += 1)).toISOString(); // strictly increasing, so order is stable
  const own = (actorId: string, id: string) => {
    const record = conversations.get(id);
    return record && record.actorId === actorId ? record : undefined;
  };
  return {
    async create(actorId, title, courseId) {
      const mine = [...conversations.values()].filter((c) => c.actorId === actorId).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
      while (mine.length >= MAX_CONVERSATIONS) {
        const oldest = mine.shift()!;
        conversations.delete(oldest.id);
        messages.delete(oldest.id);
      }
      counter += 1;
      const now = stamp();
      const record: ConversationRecord = { id: `conv_${counter}`, actorId, ...(courseId ? { courseId } : {}), title: title.slice(0, 120), createdAt: now, updatedAt: now };
      conversations.set(record.id, record);
      messages.set(record.id, []);
      return { ...record };
    },
    async get(actorId, id) {
      const record = own(actorId, id);
      return record ? { ...record } : undefined;
    },
    async list(actorId, limit = 50, courseId) {
      return [...conversations.values()].filter((c) => c.actorId === actorId && (courseId ? c.courseId === courseId : !c.courseId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit).map((c) => ({ ...c }));
    },
    async rename(actorId, id, title) {
      const record = own(actorId, id);
      if (!record) return undefined;
      record.title = title.slice(0, 120);
      return { ...record };
    },
    async remove(actorId, id) {
      if (!own(actorId, id)) return false;
      conversations.delete(id);
      messages.delete(id);
      return true;
    },
    async addMessage(actorId, conversationId, message) {
      const record = own(actorId, conversationId);
      if (!record) return undefined;
      counter += 1;
      const saved: MessageRecord = { id: `msg_${counter}`, conversationId, role: message.role, content: message.content, proposalIds: message.proposalIds ?? [], citations: message.citations ?? [], createdAt: stamp() };
      messages.get(conversationId)!.push(saved);
      record.updatedAt = saved.createdAt;
      return { ...saved };
    },
    async messages(actorId, conversationId, last) {
      if (!own(actorId, conversationId)) return [];
      const all = messages.get(conversationId) ?? [];
      return (last ? all.slice(-last) : all).map((m) => ({ ...m }));
    },
    async count(actorId, conversationId) {
      return own(actorId, conversationId) ? (messages.get(conversationId)?.length ?? 0) : 0;
    },
    async withProposals(actorId, proposalIds) {
      const wanted = new Set(proposalIds);
      const found = new Set<string>();
      for (const record of conversations.values()) {
        if (record.actorId !== actorId) continue;
        if ((messages.get(record.id) ?? []).some((m) => m.proposalIds.some((id) => wanted.has(id)))) found.add(record.id);
      }
      return found;
    },
    clear() {
      conversations.clear();
      messages.clear();
    },
  };
}
