/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script reads untyped tool JSON */
// Assertion script for proposals, confirmation and the attendance proposal tool (no network, no key).
// Run: npx tsx src/lib/ai/dev/proposals-check.ts
import { ok, type ProposalType } from "@/contracts";
import { runAgent } from "../core/agent-loop";
import type { Completion } from "../core/types";
import { eduProposals, proposalStore } from "../domain/edu/proposal-types";
import { findTool, getToolsForRole } from "../domain/edu/tools";
import { confirmAttendance } from "../services";
import { actorFor, ids, resetStore, store } from "./fake-store";

const alex = actorFor("teacher1@example.test")!;
const taylor = actorFor("teacher2@example.test")!;
const jordan = actorFor("student1@example.test")!;

let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}

function reset() {
  resetStore();
  proposalStore.clear();
}
async function propose(actor = alex, args: unknown) {
  const result = await findTool("TEACHER", "proposeMarkAttendance")!.run(actor, args);
  return { ...result, data: JSON.parse(result.content) as Record<string, any> };
}
const business = () => ({
  attendance: store.attendance.length,
  deductions: store.deductions.length,
  changes: store.sessionChanges.length,
  statuses: store.sessions.map((s) => `${s.id}:${s.status}`).join(),
});
const todayRecords = [
  { studentId: ids.jordan, status: "PRESENT" },
  { studentId: ids.sam, status: "LEAVE" },
];

async function main() {
  // ----- creating a proposal never changes business data -----
  reset();
  const before = business();
  const created = await propose(alex, { sessionId: "s_a_today", records: todayRecords });
  check("proposeMarkAttendance creates a pending proposal", created.ok && created.proposal?.status === "pending" && created.proposal.type === "MARK_ATTENDANCE" && created.data.status === "PENDING_CONFIRMATION", created.data);
  check("Business data is unchanged after the proposal is created", JSON.stringify(business()) === JSON.stringify(before));
  check("Summary counts are computed by code", created.proposal?.summary.includes("1 present, 1 on leave, 0 absent") === true, created.proposal?.summary);
  check("The tool result says nothing was recorded yet", String(created.data.note).includes("Nothing has been recorded"));
  check("Preview shows who is charged (computed by code)", created.data.preview.find((p: any) => p.student === "Jordan Lee")?.sessionsDeducted === 1 && created.data.preview.find((p: any) => p.student === "Sam Patel")?.sessionsDeducted === 0);
  const lines = await eduProposals.describe(alex, created.proposal!.id);
  check("describe() gives readable preview lines with names", lines.ok && lines.data.includes("Jordan Lee: Present (1 session deducted)") && lines.data.includes("Sam Patel: Leave (0 sessions deducted)"), lines);

  // ----- preflight refusals create no proposal -----
  reset();
  const refusals: [string, Awaited<ReturnType<typeof propose>>, string][] = [
    ["Missing student", await propose(alex, { sessionId: "s_a_today", records: [todayRecords[0]] }), "VALIDATION"],
    ["Student not in the course", await propose(alex, { sessionId: "s_a_today", records: [...todayRecords, { studentId: ids.casey, status: "PRESENT" }] }), "VALIDATION"],
    ["Duplicate student", await propose(alex, { sessionId: "s_a_today", records: [todayRecords[0], todayRecords[0], todayRecords[1]] }), "VALIDATION"],
    ["Unknown session", await propose(alex, { sessionId: "nope", records: todayRecords }), "NOT_FOUND"],
    ["Completed session", await propose(alex, { sessionId: "s_a_past1", records: todayRecords }), "CONFLICT"],
    ["Another teacher's session", await propose(taylor, { sessionId: "s_a_today", records: todayRecords }), "NOT_FOUND"],
    ["A student running the tool", await propose(jordan, { sessionId: "s_a_today", records: todayRecords }), "FORBIDDEN"],
    ["Invalid status word", await propose(alex, { sessionId: "s_a_today", records: [{ studentId: ids.jordan, status: "present" }, todayRecords[1]] }), "INVALID_ARGUMENTS"],
  ];
  for (const [name, result, code] of refusals) {
    check(`${name} -> ${code}, no proposal`, !result.ok && result.data.error.code === code, result.data);
  }
  check("The missing-student refusal names who is missing", /Sam Patel/.test(refusals[0][1].content));
  check("No proposals were created by any refusal", (await eduProposals.list(alex)).length === 0 && (await eduProposals.list(taylor)).length === 0);

  // ----- confirmation -----
  reset();
  const first = await propose(alex, { sessionId: "s_a_today", records: todayRecords });
  const id = first.proposal!.id;
  const pendingBefore = await eduProposals.list(alex, "pending");
  check("The proposal is listed as pending for its owner only", pendingBefore.length === 1 && (await eduProposals.list(taylor, "pending")).length === 0);
  const deductionsBefore = store.deductions.length;
  const confirmed = await eduProposals.confirm(alex, id);
  check("Confirm executes: 2 attendance records, 1 deduction (Jordan), session COMPLETED", confirmed.ok && confirmed.data.status === "executed" && store.attendance.filter((r) => r.sessionId === "s_a_today").length === 2 && store.deductions.length === deductionsBefore + 1 && store.deductions.at(-1)!.studentId === ids.jordan && store.sessions.find((s) => s.id === "s_a_today")!.status === "COMPLETED", confirmed);
  const afterFirst = business();
  const again = await eduProposals.confirm(alex, id);
  check("Confirming again returns the stored result and writes nothing", again.ok && again.data.status === "executed" && JSON.stringify(business()) === JSON.stringify(afterFirst));
  check("The proposal is now executed", (await proposalStore.get(id))?.status === "executed" && !!(await proposalStore.get(id))?.executedAt);

  // ----- concurrent confirmation executes once -----
  reset();
  const racing = await propose(alex, { sessionId: "s_a_thu", records: todayRecords });
  const outcomes = await Promise.all([1, 2, 3, 4].map(() => eduProposals.confirm(alex, racing.proposal!.id)));
  check("Four simultaneous confirms execute exactly once", store.attendance.filter((r) => r.sessionId === "s_a_thu").length === 2 && store.deductions.filter((d) => d.sessionId === "s_a_thu").length === 1 && store.sessionChanges.filter((c) => c.sessionId === "s_a_thu").length === 1 && outcomes.some((o) => o.ok && o.data.status === "executed"), outcomes);

  // ----- identity and ownership -----
  reset();
  const mine = await propose(alex, { sessionId: "s_a_today", records: todayRecords });
  const stolen = await eduProposals.confirm(taylor, mine.proposal!.id);
  check("Another teacher cannot confirm my proposal", !stolen.ok && stolen.error.code === "FORBIDDEN" && (await proposalStore.get(mine.proposal!.id))?.status === "pending" && store.attendance.length === business().attendance);
  const stolenDiscard = await eduProposals.discard(taylor, mine.proposal!.id);
  check("Another teacher cannot discard it either", !stolenDiscard.ok && stolenDiscard.error.code === "FORBIDDEN");
  check("Confirming an unknown id -> NOT_FOUND", (await eduProposals.confirm(alex, "prop_999")).ok === false);

  // ----- discard -----
  const beforeDiscard = business();
  const discarded = await eduProposals.discard(alex, mine.proposal!.id);
  check("Discard works on a pending proposal and changes no business data", discarded.ok && JSON.stringify(business()) === JSON.stringify(beforeDiscard));
  const afterDiscard = await eduProposals.confirm(alex, mine.proposal!.id);
  check("A discarded proposal cannot be confirmed", !afterDiscard.ok && afterDiscard.error.code === "CONFLICT" && JSON.stringify(business()) === JSON.stringify(beforeDiscard));
  check("Discarding twice -> CONFLICT", (await eduProposals.discard(alex, mine.proposal!.id)).ok === false);
  const executed = await propose(alex, { sessionId: "s_a_today", records: todayRecords });
  await eduProposals.confirm(alex, executed.proposal!.id);
  check("An executed proposal cannot be discarded", (await eduProposals.discard(alex, executed.proposal!.id)).ok === false);

  // ----- failure at confirmation is recorded, not thrown -----
  reset();
  const stale = await propose(alex, { sessionId: "s_a_today", records: todayRecords });
  await confirmAttendance(alex, { sessionId: "s_a_today", records: [{ studentId: ids.jordan, status: "ABSENT" }, { studentId: ids.sam, status: "ABSENT" }] });
  const snapshot = business();
  const failed = await eduProposals.confirm(alex, stale.proposal!.id);
  const stored = await proposalStore.get(stale.proposal!.id);
  check("If the session changed meanwhile, confirm reports failed with the service error", failed.ok && failed.data.status === "failed" && failed.data.error?.code === "CONFLICT" && stored?.status === "failed" && stored.error?.code === "CONFLICT");
  check("A failed confirmation writes nothing", JSON.stringify(business()) === JSON.stringify(snapshot));
  const replay = await eduProposals.confirm(alex, stale.proposal!.id);
  check("Confirming a failed proposal returns the stored failure without retrying", replay.ok && replay.data.status === "failed" && JSON.stringify(business()) === JSON.stringify(snapshot));

  // ----- validation at creation -----
  reset();
  const badPayload = await eduProposals.create({ actor: alex, type: "MARK_ATTENDANCE", payload: { sessionId: "", records: [] }, summary: "x" });
  const unsupported = await eduProposals.create({ actor: alex, type: "CREATE_COURSE" as ProposalType, payload: {}, summary: "x" });
  check("An invalid payload is rejected before anything is stored", !badPayload.ok && badPayload.error.code === "VALIDATION" && (await eduProposals.list(alex)).length === 0);
  check("A proposal type without a handler is rejected", !unsupported.ok && unsupported.error.code === "VALIDATION");

  // ----- the agent cannot confirm, and only proposes -----
  reset();
  check("The agent has no confirm or discard tool", getToolsForRole("TEACHER").every((t) => !/confirm|discard/i.test(t.name)));
  const steps: Completion[] = [
    { content: null, toolCalls: [{ id: "c1", name: "proposeMarkAttendance", args: { sessionId: "s_a_today", records: todayRecords } }], message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "proposeMarkAttendance", arguments: JSON.stringify({ sessionId: "s_a_today", records: todayRecords }) } }] } },
    { content: "I prepared the attendance. Please confirm it.", toolCalls: [], message: { role: "assistant", content: "I prepared the attendance. Please confirm it." } },
  ];
  let n = 0;
  const snap = business();
  const out = await runAgent({ actor: alex, role: "TEACHER", userMessage: "Jordan came, Sam is on leave", history: [] }, {
    chatCompletion: (async () => ok(steps[n++])) as any,
    record: () => undefined,
  });
  check("The loop returns the created proposal to the caller", out.status === "OK" && out.proposals.length === 1 && out.proposals[0].status === "pending");
  check("Business data is still unchanged after the whole agent run", JSON.stringify(business()) === JSON.stringify(snap));
  const system = (await import("../domain/edu/prompts")).teacherSystemPrompt();
  check("The prompt forbids claiming attendance was recorded", /Never say attendance was recorded/.test(system));

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
