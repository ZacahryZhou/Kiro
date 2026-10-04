/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script reads untyped tool JSON */
// Assertion script for progress records (AI tools and proposals).
// Run: npx tsx src/lib/ai/dev/progress-check.ts
import { eduProposals, proposalStore } from "../domain/edu/proposal-types";
import { findTool } from "../domain/edu/tools";
import { createSessions } from "../services";
import { actorFor, ids, resetStore, store } from "./fake-store";

const alex = actorFor("teacher1@example.test")!;
const taylor = actorFor("teacher2@example.test")!;
const jordan = actorFor("student1@example.test")!;
const sam = actorFor("student2@example.test")!;

let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}
async function run(role: "TEACHER" | "STUDENT", tool: string, actor: typeof alex, args: unknown = {}) {
  const found = findTool(role, tool);
  if (!found) return { ok: false, data: { error: { code: "UNKNOWN_TOOL" } } as Record<string, any>, proposal: undefined };
  const result = await found.run(actor, args);
  return { ok: result.ok, data: JSON.parse(result.content) as Record<string, any>, proposal: result.proposal };
}

async function main() {
  resetStore();
  proposalStore.clear();
  store.sessions.push({ id: "s_past", courseId: ids.courseA, startAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), durationMin: 60, status: "COMPLETED" });
  const future = await createSessions(alex, { courseId: ids.courseA, sessions: [{ startAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), durationMin: 60 }] });
  if (!future.ok) throw new Error("fixture session could not be created");
  const base = { sessionId: "s_past", studentId: ids.jordan, goal: "Fractions", output: "Solved 8 of 10", issue: "Mixed numbers", nextAction: "PRACTICE", note: "Prefers short tasks" };

  const first = await run("TEACHER", "proposeProgressRecord", alex, base);
  check("A progress record becomes a pending PROGRESS_RECORD proposal and stores nothing yet", first.ok && first.proposal?.type === "PROGRESS_RECORD" && store.progress.length === 0, first.data);
  check("The preview shows the fields and marks the note as private", (first.proposal?.preview ?? []).some((l) => l.startsWith("Goal: Fractions")) && (first.proposal?.preview ?? []).some((l) => l.startsWith("Private note")));
  const saved = await eduProposals.confirm(alex, first.proposal!.id);
  check("Confirming saves one record", saved.ok && saved.data.status === "executed" && store.progress.length === 1 && store.progress[0].note === "Prefers short tasks");

  const again = await run("TEACHER", "proposeProgressRecord", alex, { ...base, goal: "Fractions, part 2", issue: undefined });
  check("Proposing again warns that confirming replaces the earlier record", again.ok && Array.isArray(again.data.warnings), again.data);
  await eduProposals.confirm(alex, again.proposal!.id);
  check("Confirming the second proposal replaces the record instead of adding one", store.progress.length === 1 && store.progress[0].goal === "Fractions, part 2" && store.progress[0].issue === undefined);

  check("A session that has not started is refused", (await run("TEACHER", "proposeProgressRecord", alex, { ...base, sessionId: future.data.sessionIds[0] })).data.error?.code === "CONFLICT");
  check("A student who is not enrolled in the course is refused", (await run("TEACHER", "proposeProgressRecord", alex, { ...base, studentId: ids.casey })).data.error?.code === "NOT_FOUND");
  check("Another teacher cannot record progress for this session", (await run("TEACHER", "proposeProgressRecord", taylor, base)).data.error?.code === "NOT_FOUND");
  check("A missing next step is refused", !(await run("TEACHER", "proposeProgressRecord", alex, { ...base, nextAction: undefined })).ok);
  check("A student has no progress-writing tool", !findTool("STUDENT", "proposeProgressRecord"));

  const teacherView = await run("TEACHER", "listProgressRecords", alex, {});
  check("The course teacher sees the record, including the private note", teacherView.data.total === 1 && teacherView.data.records[0].privateNote === "Prefers short tasks" && teacherView.data.records[0].student === "Jordan Lee", teacherView.data);
  const studentView = await run("STUDENT", "listProgressRecords", jordan, {});
  check("The student sees their record without the private note or a student name", studentView.data.total === 1 && !("privateNote" in studentView.data.records[0]) && !("student" in studentView.data.records[0]) && !JSON.stringify(studentView.data).includes("Prefers short"), studentView.data);
  check("Another student sees nothing", (await run("STUDENT", "listProgressRecords", sam, {})).data.total === 0);
  check("Another teacher sees nothing", (await run("TEACHER", "listProgressRecords", taylor, {})).data.total === 0);

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}
main();
