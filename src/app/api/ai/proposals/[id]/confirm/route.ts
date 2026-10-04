import { getAiActor } from "@/lib/ai/actor";
import { eduProposals } from "@/lib/ai/domain/edu/proposal-types";
import { errorResponse, unauthenticated } from "@/lib/ai/http";
import { createTracer } from "@/lib/ai/trace";

// POST /api/ai/proposals/:id/confirm: runs the proposal at most once (contract section 9).
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getAiActor();
  if (!actor) return unauthenticated();

  const tracer = createTracer(actor.role);
  tracer.emit("identity", "done");
  const { id } = await ctx.params;
  tracer.emit("confirm", "start");
  const began = Date.now();
  const result = await eduProposals.confirm(actor, id);
  tracer.emit("confirm", result.ok && result.data.status === "executed" ? "done" : "error", {
    label: result.ok ? result.data.status : result.error.code,
    ms: Date.now() - began,
  });
  if (!result.ok) return errorResponse(result.error);
  const { status, result: data, error } = result.data;
  return Response.json(
    status === "executed"
      ? { status, result: data }
      : { status, error: error && { code: error.code, message: error.message, details: error.details } },
  );
}
