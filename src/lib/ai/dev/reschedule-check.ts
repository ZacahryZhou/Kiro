/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script reads untyped tool JSON */
// Assertion script for AI rescheduling (proposeReschedule and the RESCHEDULE proposal).
// Run: npx tsx src/lib/ai/dev/reschedule-check.ts
import { zonedTimeToUtc } from "../core/time";
import { eduProposals, proposalStore } from "../domain/edu/proposal-types";
import { findTool } from "../domain/edu/tools";
import { createSessions } from "../services";
import { actorFor, ids, resetStore, store } from "./fake-store";

const alex = actorFor("teacher1@example.test")!;
const taylor = actorFor("teacher2@example.test")!;

let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}
async function run(tool: string, actor = alex, args: unknown = {}) {
  const result = await findTool("TEACHER", tool)!.run(actor, args);
  return { ok: result.ok, data: JSON.parse(result.content) as Record<string, any>, proposal: result.proposal };
}
const at = (date: string, time: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return zonedTimeToUtc({ year, month, day, hour, minute }).toISOString();
};

async function main() {
  resetStore();
  proposalStore.clear();
  const first = await createSessions(alex, { courseId: ids.courseA, sessions: [{ startAt: at("2028-03-05", "16:00"), durationMin: 60 }] });
  const other = await createSessions(alex, { courseId: ids.courseB, sessions: [{ startAt: at("2028-03-06", "16:00"), durationMin: 60 }] });
  if (!first.ok || !other.ok) throw new Error("fixture sessions could not be created");
  const sessionId = first.data.sessionIds[0];
  const deductionsBefore = store.deductions.length;

  const ok = await run("proposeReschedule", alex, { sessionId, newDate: "2028-03-07", newTime: "10:00" });
  const session = () => store.sessions.find((s) => s.id === sessionId)!;
  check("A free slot creates a RESCHEDULE proposal and moves nothing yet", ok.ok && ok.data.status === "PENDING_CONFIRMATION" && ok.proposal?.type === "RESCHEDULE" && session().startAt === at("2028-03-05", "16:00"), ok.data);
  check("The preview names the old and new time", (ok.proposal?.preview ?? []).some((line) => line.startsWith("From:")) && (ok.proposal?.preview ?? []).some((line) => line.startsWith("To:")), ok.proposal?.preview);

  const confirmed = await eduProposals.confirm(alex, ok.proposal!.id);
  check("Confirming moves the session once, marks it RESCHEDULED and keeps the original time", confirmed.ok && confirmed.data.status === "executed" && session().startAt === at("2028-03-07", "10:00") && session().status === "RESCHEDULED" && session().originalStartAt === at("2028-03-05", "16:00"), session());
  check("Rescheduling creates no deduction", store.deductions.length === deductionsBefore);
  const again = await eduProposals.confirm(alex, ok.proposal!.id);
  check("Confirming twice changes nothing more", again.ok && again.data.status === "executed" && session().startAt === at("2028-03-07", "10:00"));

  const proposalsBefore = (await eduProposals.list(alex)).length;
  const clash = await run("proposeReschedule", alex, { sessionId, newDate: "2028-03-06", newTime: "16:30" });
  check("A clash with another session creates no proposal and explains it", clash.ok && clash.data.status === "CONFLICTS_FOUND" && clash.data.conflictsWith.length >= 1 && (await eduProposals.list(alex)).length === proposalsBefore, clash.data);
  check("A time in the past is refused", (await run("proposeReschedule", alex, { sessionId, newDate: "2020-01-01", newTime: "10:00" })).data.error?.code === "VALIDATION");
  check("An impossible date is refused", !(await run("proposeReschedule", alex, { sessionId, newDate: "2028-02-30", newTime: "10:00" })).ok);
  check("Another teacher cannot move this session", (await run("proposeReschedule", taylor, { sessionId, newDate: "2028-03-08", newTime: "10:00" })).data.error?.code === "NOT_FOUND");
  check("A student has no reschedule tool", !findTool("STUDENT", "proposeReschedule"));

  // Stage 2: a clash that appears after the proposal exists is caught at confirmation.
  const late = await run("proposeReschedule", alex, { sessionId, newDate: "2028-03-09", newTime: "09:00" });
  const blocker = await createSessions(alex, { courseId: ids.courseB, sessions: [{ startAt: at("2028-03-09", "09:00"), durationMin: 60 }] });
  const lateConfirm = await eduProposals.confirm(alex, late.proposal!.id);
  check("A clash created after the proposal is rejected at confirmation and nothing moves", blocker.ok && lateConfirm.ok && lateConfirm.data.status === "failed" && lateConfirm.data.error?.code === "CONFLICT" && session().startAt === at("2028-03-07", "10:00"), lateConfirm);

  // A weekday is resolved by code inside the session's own Monday-to-Sunday week.
  const byWeekday = await run("proposeReschedule", alex, { sessionId, newWeekday: "THU", newTime: "11:00" });
  check("A weekday is turned into a date by code (the session is on Tuesday 2028-03-07, so Thursday is 2028-03-09)", byWeekday.ok && (byWeekday.proposal?.payload as any)?.newStartAt === at("2028-03-09", "11:00"), byWeekday.data);
  check("Giving both a date and a weekday is refused", (await run("proposeReschedule", alex, { sessionId, newDate: "2028-03-08", newWeekday: "THU", newTime: "11:00" })).data.error?.code === "INVALID_ARGUMENTS");
  check("Giving neither a date nor a weekday is refused", (await run("proposeReschedule", alex, { sessionId, newTime: "11:00" })).data.error?.code === "INVALID_ARGUMENTS");

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}
main();
