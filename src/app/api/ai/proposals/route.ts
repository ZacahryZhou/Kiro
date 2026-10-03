import { PROPOSAL_STATUSES, type ProposalStatus } from "@/contracts";
import { getAiActor } from "@/lib/ai/actor";
import { eduProposals } from "@/lib/ai/domain/edu/proposal-types";
import { errorResponse, unauthenticated } from "@/lib/ai/http";

// GET /api/ai/proposals?status=pending: the signed-in user's own proposals.
export async function GET(request: Request) {
  const actor = await getAiActor();
  if (!actor) return unauthenticated();

  const status = new URL(request.url).searchParams.get("status");
  if (status !== null && !(PROPOSAL_STATUSES as readonly string[]).includes(status)) {
    return errorResponse({ code: "VALIDATION", message: "Unknown proposal status." });
  }
  const proposals = await eduProposals.list(actor, (status as ProposalStatus | null) ?? undefined);
  return Response.json({ proposals });
}
