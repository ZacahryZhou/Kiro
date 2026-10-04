import { getAiActor } from "@/lib/ai/actor";
import { conversationStore } from "@/lib/ai/conversation-store";
import { eduProposals } from "@/lib/ai/domain/edu/proposal-types";
import { unauthenticated } from "@/lib/ai/http";

// GET /api/ai/conversations[?courseId=]: the signed-in user's own chats, most recently used first.
// Without courseId only global chats are listed; a course page lists only that course's chats.
export async function GET(request: Request) {
  const actor = await getAiActor();
  if (!actor) return unauthenticated();
  const courseId = new URL(request.url).searchParams.get("courseId") ?? undefined;
  const chats = await conversationStore.list(actor.userId, 50, courseId);
  // A chat is flagged when it holds a proposal that is still waiting for a decision.
  const pending = await eduProposals.list(actor, "pending");
  const waiting = await conversationStore.withProposals(actor.userId, pending.map((p) => p.id));
  return Response.json({
    conversations: chats.map((chat) => ({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt, hasPending: waiting.has(chat.id) })),
  });
}
