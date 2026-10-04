// Code-side checks on what the model says, so a reply can never promise something that does not exist.

/** Shown when the model keeps claiming a pending change although no proposal was created. */
export const NOTHING_PREPARED_REPLY =
  "I couldn't prepare that change, so nothing is waiting for your confirmation. Please try again, or tell me a bit more about what you want.";

/** Sent to the model once when its reply claims a pending proposal that was never created. */
export const PHANTOM_PROPOSAL_NOTE =
  "System note (not from the user): your last message says a change is waiting for the user's confirmation, but no proposal tool succeeded in this turn, so nothing is waiting. " +
  "If you have what you need, call the proposal tool now. Otherwise tell the user plainly that nothing was prepared and what you still need.";

const CLAIM =
  /(waiting for (your|the) (confirmation|approval)|confirm (it |this |that |the \w+ )?(in|using|with|on) the (panel|card|button)|\b(proposal|request|change|record) (is|was) (ready|prepared)\b|\bI('ve| have) prepared (a |an |the )?(proposal|request|change|record|preview)\b|\b(here'?s|here is) the (proposal|preview)\b)/i;
const NEGATED_OR_CONDITIONAL = /\b(nothing|not|no|never|none|n't|if you|once you|unless|would you|do you|want me to|can still|could)\b/i;

/** True when the reply says a change is pending although the run created no proposal. */
export function claimsPendingProposal(reply: string, proposalCount: number): boolean {
  if (proposalCount > 0) return false;
  return reply
    .split(/(?<=[.!?:])\s+/)
    .some((sentence) => CLAIM.test(sentence) && !NEGATED_OR_CONDITIONAL.test(sentence));
}

/** When the model runs out of rounds after a proposal exists, say so from code instead of giving up. */
export function proposalFallbackReply(summaries: string[]): string {
  const list = summaries.map((summary) => `"${summary}"`).join("; ");
  return `I prepared ${list}. It is waiting for your confirmation in the panel. Nothing has changed yet.`;
}
