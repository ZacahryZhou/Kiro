import { z } from "zod";
import { runAgent, type AgentDeps, type AgentOutput } from "./core/agent-loop";
import { getAiActor } from "./actor";
import { errorResponse, unauthenticated } from "./http";
import { createTracer } from "./trace";

// Logic behind POST /api/ai/chat. The signed-in user and role come from the server session only;
// the request body carries just the message and recent conversation text.

const MAX_HISTORY = 10;
const FRIENDLY_FAILURE = "The assistant is unavailable right now. Please try again in a moment.";
// These end reasons already come with a user-friendly reply from the agent loop.
const FRIENDLY_ERRORS = new Set(["MAX_ROUNDS", "TIMEOUT"]);

const body = z.object({
  message: z.string().trim().min(1, "Enter a message.").max(2000, "That message is too long."),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(100)
    .optional(),
});

export type ChatDeps = {
  runAgent?: (input: Parameters<typeof runAgent>[0], deps?: AgentDeps) => Promise<AgentOutput>;
  getActor?: typeof getAiActor;
};

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
  try {
    const output = await (deps.runAgent ?? runAgent)({
      actor,
      role: actor.role,
      userMessage: parsed.data.message,
      history: (parsed.data.history ?? []).slice(-MAX_HISTORY),
    }, { tracer });
    // Internal failure details (missing keys, upstream errors) stay out of production responses.
    const expose = process.env.NODE_ENV !== "production" || FRIENDLY_ERRORS.has(output.error ?? "");
    const reply = output.status === "ERROR" && !expose ? FRIENDLY_FAILURE : output.reply;
    return Response.json({
      reply,
      ...(output.proposals.length > 0 ? { proposals: output.proposals } : {}),
      ...(output.citations.length > 0 ? { citations: output.citations } : {}),
    });
  } catch {
    return Response.json({ reply: FRIENDLY_FAILURE });
  }
}
