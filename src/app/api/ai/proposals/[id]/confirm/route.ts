import { getAiActor } from "@/lib/ai/actor";
import { eduProposals } from "@/lib/ai/domain/edu/proposal-types";
import { errorResponse, unauthenticated } from "@/lib/ai/http";

// POST /api/ai/proposals/:id/confirm: runs the proposal at most once (contract section 9).
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getAiActor();
  if (!actor) return unauthenticated();

  const { id } = await ctx.params;
  const result = await eduProposals.confirm(actor, id);
  if (!result.ok) return errorResponse(result.error);
  const { status, result: data, error } = result.data;
  return Response.json(
    status === "executed"
      ? { status, result: data }
      : { status, error: error && { code: error.code, message: error.message, details: error.details } },
  );
}
