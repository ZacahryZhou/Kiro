import { z } from "zod";
import { getAiActor } from "@/lib/ai/actor";
import { conversationStore } from "@/lib/ai/conversation-store";
import { MAX_TITLE } from "@/lib/ai/core/conversations";
import { eduProposals } from "@/lib/ai/domain/edu/proposal-types";
import { errorResponse, unauthenticated } from "@/lib/ai/http";

// One of the signed-in user's own chats. Another user's chat is always "not found".
const notFound = () => errorResponse({ code: "NOT_FOUND", message: "That chat was not found." });

/** GET: the chat and its messages. Proposals in it come back with their current status. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getAiActor();
  if (!actor) return unauthenticated();
  const { id } = await context.params;
  const chat = await conversationStore.get(actor.userId, id);
  if (!chat) return notFound();
  const messages = await conversationStore.messages(actor.userId, id);
  const proposals = await eduProposals.listByIds(actor, messages.flatMap((m) => m.proposalIds));
  const byId = new Map(proposals.map((p) => [p.id, p]));
  return Response.json({
    conversation: { id: chat.id, title: chat.title, updatedAt: chat.updatedAt },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ...(m.citations.length > 0 ? { citations: m.citations } : {}),
      ...(m.proposalIds.length > 0 ? { proposals: m.proposalIds.flatMap((pid) => (byId.has(pid) ? [byId.get(pid)!] : [])) } : {}),
    })),
  });
}

/** PATCH { title }: rename the chat. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getAiActor();
  if (!actor) return unauthenticated();
  const { id } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse({ code: "VALIDATION", message: "The request body must be JSON." });
  }
  const parsed = z.object({ title: z.string().trim().min(1, "Enter a title.").max(MAX_TITLE, `Use at most ${MAX_TITLE} characters.`) }).safeParse(json);
  if (!parsed.success) return errorResponse({ code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "That title is not valid." });
  const renamed = await conversationStore.rename(actor.userId, id, parsed.data.title);
  if (!renamed) return notFound();
  return Response.json({ conversation: { id: renamed.id, title: renamed.title, updatedAt: renamed.updatedAt } });
}

/** DELETE: remove the chat and its messages. Proposals it prepared are unaffected. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getAiActor();
  if (!actor) return unauthenticated();
  const { id } = await context.params;
  if (!(await conversationStore.remove(actor.userId, id))) return notFound();
  return Response.json({ ok: true });
}
