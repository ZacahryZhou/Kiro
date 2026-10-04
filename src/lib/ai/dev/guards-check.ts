/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script uses a fake model */
// Assertion script for the reply guard that catches "a proposal is waiting" when none exists.
// Run: npx tsx src/lib/ai/dev/guards-check.ts
import { answerWithCitations, verifyAnswer } from "../core/citations";
import { claimsPendingProposal } from "../domain/edu/guards";

let failures = 0;
function check(name: string, condition: boolean) {
  if (!condition) failures += 1;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}`);
}

const phantom = `I've prepared a proposal to create the course "Math 150" — subject Math, one-on-one, $50 per session, with no students added. It's waiting for your confirmation in the panel; nothing has been created yet.`;
check("A claimed proposal is caught even when it adds that nothing has been created yet", claimsPendingProposal(phantom, 0));
check("The same reply is fine when a proposal really exists", !claimsPendingProposal(phantom, 1));
check("The same claim with another reassurance is caught", claimsPendingProposal("The change is ready. Please confirm it in the panel. No data has changed yet.", 0));
check("A real denial is not treated as a claim", !claimsPendingProposal("Nothing is waiting for your confirmation because I could not prepare the change.", 0));
check("A conditional is not a claim", !claimsPendingProposal("Once you confirm it in the panel the course is created.", 0));
check("A plain answer is not a claim", !claimsPendingProposal("Your next class is on Tuesday at 4 PM.", 0));

// ----- citations: tolerant matching and one retry -----
const source = { materialId: "m1", unitId: "u1", title: "Notes", content: "To solve it, we use the \u201Cbalance method\u201D \u2014 do the same thing to both sides.   Then check." };
const ok = (quote: string) => verifyAnswer({ found: true, answer: "Do the same on both sides.", citations: [{ materialId: "m1", quote }] }, [source]).found;
check("A quote with straight quotes and different spacing matches curly quotes in the source", ok('use the "balance method" - do the same thing to both sides'));
check("Letter case does not matter", ok("DO THE SAME THING TO BOTH SIDES"));
check("A reworded quote is still rejected", !ok("do an equal operation on each side"));
check("A made-up material id is still rejected", !verifyAnswer({ found: true, answer: "x", citations: [{ materialId: "nope", quote: "do the same thing to both sides" }] }, [source]).found);
let calls = 0;
const flaky: any = async () => {
  calls += 1;
  const quote = calls === 1 ? "do an equal operation" : "do the same thing to both sides";
  return { ok: true, data: { content: JSON.stringify({ found: true, answer: "Do the same on both sides.", citations: [{ materialId: "m1", quote }] }), toolCalls: [], message: { role: "assistant", content: "" } } };
};
answerWithCitations({ question: "How do I solve it?", sources: [source], system: "s", complete: flaky }).then((result) => {
  check("A bad quote gets one retry, and the corrected answer is accepted", result.found && calls === 2);
  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
});
