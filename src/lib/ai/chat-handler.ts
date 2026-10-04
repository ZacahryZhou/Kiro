import { z } from "zod";
import type { Citation } from "@/contracts";
import { runAgent, type AgentDeps, type AgentOutput } from "./core/agent-loop";
import { getAiActor } from "./actor";
import { errorResponse, unauthenticated } from "./http";
import { MAX_MESSAGES_PER_CONVERSATION, titleFrom, type ConversationStore } from "./core/conversations";
import { conversationStore } from "./conversation-store";
import * as services from "./services";
import { createTracer } from "./trace";

// Logic behind POST /api/ai/chat. The signed-in user and role come from the server session only;
// the request body carries just the message and recent conversation text.

const MAX_HISTORY = 10;
const FRIENDLY_FAILURE = "The assistant is unavailable right now. Please try again in a moment.";
// These end reasons already come with a user-friendly reply from the agent loop.
const FRIENDLY_ERRORS = new Set(["MAX_ROUNDS", "TIMEOUT"]);

const body = z.object({
  message: z.string().trim().min(1, "Enter a message.").max(2000, "That message is too long."),
  /** Continue one of the signed-in user's own chats. Omit to start a new chat. */
  conversationId: z.string().min(1).max(64).optional(),
  /** Start a chat for one course page. Ignored when continuing a chat (the chat keeps its own course). */
  courseId: z.string().min(1).max(64).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(100)
    .optional(),
});

export type ChatDeps = {
  conversations?: ConversationStore;
  runAgent?: (input: Parameters<typeof runAgent>[0], deps?: AgentDeps) => Promise<AgentOutput>;
  getActor?: typeof getAiActor;
};

/** The course, if the signed-in user teaches it or is enrolled in it. */
async function courseOf(actor: Parameters<typeof services.listMyCourses>[0], courseId: string): Promise<{ courseId: string; courseName: string } | undefined> {
  const mine = await services.listMyCourses(actor);
  const course = mine.ok ? mine.data.courses.find((c) => c.id === courseId) : undefined;
  return course ? { courseId: course.id, courseName: course.name } : undefined;
}

export async function handleChat(request: Request, deps: ChatDeps = {}): Promise<Response> {
  const actor = await (deps.getActor ?? getAiActor)();
  if (!actor) return unauthenticated();
  const tracer = createTracer(actor.role);
  tracer.emit("request", "start");
  tracer.emit("identity", "done");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse({ code: "VALIDATION", message: "The request body must be JSON." });
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) {
    return errorResponse({ code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "The request is not valid." });
  }

  tracer.emit("request", "done");

  // Each chat is its own context. The assistant is shown only the recent messages of the chat in use,
  // read by the server from that chat (owned by the signed-in user), never what the browser claims.
  const store = deps.conversations ?? conversationStore;
  let conversationId: string | undefined;
  let scope: { courseId: string; courseName: string } | undefined;
  let title: string | undefined;
  let isNew = false;
  let history: { role: "user" | "assistant"; content: string }[];
  if (parsed.data.conversationId) {
    const existing = await store.get(actor.userId, parsed.data.conversationId);
    if (!existing) return errorResponse({ code: "NOT_FOUND", message: "That chat was not found." });
    if ((await store.count(actor.userId, existing.id)) >= MAX_MESSAGES_PER_CONVERSATION) {
      return errorResponse({ code: "CONFLICT", message: "This chat is full. Start a new chat to keep going." });
    }
    conversationId = existing.id;
    title = existing.title;
    if (existing.courseId) {
      const course = await courseOf(actor, existing.courseId);
      if (!course) return errorResponse({ code: "NOT_FOUND", message: "That chat was not found." });
      scope = course;
    }
    history = (await store.messages(actor.userId, existing.id, MAX_HISTORY)).map(({ role, content }) => ({ role, content }));
  } else if (parsed.data.history) {
    // Stateless call (no stored chat): the caller supplies the context.
    history = parsed.data.history.slice(-MAX_HISTORY);
  } else {
    if (parsed.data.courseId) {
      const course = await courseOf(actor, parsed.data.courseId);
      if (!course) return errorResponse({ code: "NOT_FOUND", message: "That course was not found." });
      scope = course;
    }
    const created = await store.create(actor.userId, titleFrom(parsed.data.message), scope?.courseId);
    conversationId = created.id;
    title = created.title;
    isNew = true;
    history = [];
  }
  if (conversationId) await store.addMessage(actor.userId, conversationId, { role: "user", content: parsed.data.message });

  const save = async (reply: string, proposalIds: string[] = [], citations: Citation[] = []) => {
    if (conversationId) await store.addMessage(actor.userId, conversationId, { role: "assistant", content: reply, proposalIds, citations });
  };
  const chatInfo = conversationId ? { conversationId, title, isNew } : {};

  try {
    const output = await (deps.runAgent ?? runAgent)({
      actor,
      role: actor.role,
      userMessage: parsed.data.message,
      history,
      ...(scope ? { scope } : {}),
    }, { tracer });
    // Internal failure details (missing keys, upstream errors) stay out of production responses.
    const expose = process.env.NODE_ENV !== "production" || FRIENDLY_ERRORS.has(output.error ?? "");
    const reply = output.status === "ERROR" && !expose ? FRIENDLY_FAILURE : output.reply;
    await save(reply, output.proposals.map((p) => p.id), output.citations);
    return Response.json({
      reply,
      ...chatInfo,
      ...(output.proposals.length > 0 ? { proposals: output.proposals } : {}),
      ...(output.citations.length > 0 ? { citations: output.citations } : {}),
    });
  } catch {
    await save(FRIENDLY_FAILURE);
    return Response.json({ reply: FRIENDLY_FAILURE, ...chatInfo });
  }
}
