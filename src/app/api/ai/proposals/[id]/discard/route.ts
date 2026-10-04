import { getAiActor } from "@/lib/ai/actor";
import { eduProposals } from "@/lib/ai/domain/edu/proposal-types";
import { errorResponse, unauthenticated } from "@/lib/ai/http";

// POST /api/ai/proposals/:id/discard: only a pending proposal can be discarded.
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getAiActor();
  if (!actor) return unauthenticated();

  const { id } = await ctx.params;
  const result = await eduProposals.discard(actor, id);
  return result.ok ? Response.json(result.data) : errorResponse(result.error);
}
