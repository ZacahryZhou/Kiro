import { z } from "zod";
import type { Citation } from "@/contracts";
import { runAgent, type AgentDeps, type AgentOutput } from "./core/agent-loop";
import { getAiActor } from "./actor";
import { errorResponse, unauthenticated } from "./http";
import { MAX_MESSAGES_PER_CONVERSATION, titleFrom, type ConversationStore, type MessageRecord } from "./core/conversations";
import { checkImages, MAX_IMAGE_BASE64_CHARS, MAX_IMAGES, readImages, wrapPhotoText } from "./core/vision";
import { conversationStore } from "./conversation-store";
import * as services from "./services";
import { createTracer } from "./trace";

// Logic behind POST /api/ai/chat. The signed-in user and role come from the server session only;
// the request body carries just the message and recent conversation text.

const MAX_HISTORY = 10;
const FRIENDLY_FAILURE = "The assistant is unavailable right now. Please try again in a moment.";
// These end reasons already come with a user-friendly reply from the agent loop.
const FRIENDLY_ERRORS = new Set(["MAX_ROUNDS", "TIMEOUT"]);

const body = z
  .object({
    message: z.string().trim().max(2000, "That message is too long.").default(""),
    /** Continue one of the signed-in user's own chats. Omit to start a new chat. */
    conversationId: z.string().min(1).max(64).optional(),
    /** Start a chat for one course page. Ignored when continuing a chat (the chat keeps its own course). */
    courseId: z.string().min(1).max(64).optional(),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
      .max(100)
      .optional(),
    /** Photos for the assistant to read (teachers only). Checked by their bytes, read once, never stored. */
    images: z
      .array(z.object({ name: z.string().max(200).optional(), mediaType: z.string().max(60).optional(), data: z.string().max(MAX_IMAGE_BASE64_CHARS + 200) }))
      .max(MAX_IMAGES, `Attach at most ${MAX_IMAGES} photos at a time.`)
      .optional(),
  })
  .refine((value) => value.message.length > 0 || (value.images?.length ?? 0) > 0, { message: "Enter a message.", path: ["message"] });

export type ChatDeps = {
  conversations?: ConversationStore;
  /** Reads photos into text; injectable for tests. */
  readImages?: typeof readImages;
  runAgent?: (input: Parameters<typeof runAgent>[0], deps?: AgentDeps) => Promise<AgentOutput>;
  getActor?: typeof getAiActor;
};

/** A stored message as the assistant sees it: what was read from its photos goes along with the text. */
function asTurn(message: MessageRecord): { role: "user" | "assistant"; content: string } {
  return { role: message.role, content: message.modelContext ? `${message.content}\n\n${message.modelContext}` : message.content };
}

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

  // Photos: teachers only. They are checked by their bytes and read once into text; the pictures are
  // never stored. The text is untrusted, so it reaches the assistant inside a marked data block.
  const typed = parsed.data.message;
  const rawImages = parsed.data.images ?? [];
  let photoNames: string[] = [];
  let photoContext: string | undefined;
  if (rawImages.length > 0) {
    if (actor.role !== "TEACHER") return errorResponse({ code: "FORBIDDEN", message: "Only teachers can attach photos." });
    const checked = checkImages(rawImages);
    if (!checked.ok) return errorResponse(checked.error);
    const read = await (deps.readImages ?? readImages)(checked.data);
    if (!read.ok) return errorResponse(read.error);
    photoNames = checked.data.map((image) => image.name);
    photoContext = wrapPhotoText(photoNames, read.data);
  }
  const shownText = typed || (photoNames.length > 0 ? (photoNames.length === 1 ? "Attached a photo" : `Attached ${photoNames.length} photos`) : "");
  const agentMessage = photoContext ? `${typed || "Please look at the attached photo."}\n\n${photoContext}` : typed;
  const attachments = photoNames.map((name) => ({ name }));

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
    history = (await store.messages(actor.userId, existing.id, MAX_HISTORY)).map(asTurn);
  } else if (parsed.data.history) {
    // Stateless call (no stored chat): the caller supplies the context.
    history = parsed.data.history.slice(-MAX_HISTORY);
  } else {
    if (parsed.data.courseId) {
      const course = await courseOf(actor, parsed.data.courseId);
      if (!course) return errorResponse({ code: "NOT_FOUND", message: "That course was not found." });
      scope = course;
    }
    const created = await store.create(actor.userId, titleFrom(shownText), scope?.courseId);
    conversationId = created.id;
    title = created.title;
    isNew = true;
    history = [];
  }
  if (conversationId) {
    await store.addMessage(actor.userId, conversationId, {
      role: "user",
      content: shownText,
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(photoContext ? { modelContext: photoContext } : {}),
    });
  }

  const save = async (reply: string, proposalIds: string[] = [], citations: Citation[] = []) => {
    if (conversationId) await store.addMessage(actor.userId, conversationId, { role: "assistant", content: reply, proposalIds, citations });
  };
  const chatInfo = conversationId ? { conversationId, title, isNew } : {};

  try {
    const output = await (deps.runAgent ?? runAgent)({
      actor,
      role: actor.role,
      userMessage: agentMessage,
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
