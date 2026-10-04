/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script reads untyped tool JSON */
// Assertion script for course creation, scheduling proposals and the scheduling helpers.
// Run: npx tsx src/lib/ai/dev/schedule-check.ts
import { ok, type Result } from "@/contracts";
import { runAgent, type AgentDeps } from "../core/agent-loop";
import { resolveSessions, resolveWhen, zonedTimeToUtc } from "../core/time";
import type { Completion } from "../core/types";
import { eduProposals, proposalStore } from "../domain/edu/proposal-types";
import { findTool, getToolsForRole } from "../domain/edu/tools";
import { createSessions, listMyCourses, listMyStudents } from "../services";
import { actorFor, ids, resetStore, store } from "./fake-store";
import { timeZoneDataProblem } from "./tz-sanity";

const TZ = "America/Vancouver"; // fixed, so these checks do not depend on the APP_TZ environment variable
const alex = actorFor("teacher1@example.test")!;
const taylor = actorFor("teacher2@example.test")!;
const jordan = actorFor("student1@example.test")!;

let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}
const reset = () => { resetStore(); proposalStore.clear(); };
async function call(tool: string, actor: typeof alex, args: unknown) {
  const result = await findTool("TEACHER", tool)!.run(actor, args);
  return { ...result, data: JSON.parse(result.content) as Record<string, any> };
}
const business = () => JSON.stringify({ c: store.courses.length, e: store.enrollments.length, s: store.sessions.length });

async function main() {
  const tzProblem = timeZoneDataProblem();
  check("Runtime time zone data knows the Nov 1 2026 clock change (America/Vancouver)", tzProblem === null, tzProblem);

  // ----- resolveSessions (pure code) -----
  const thu = new Date("2026-10-08T19:30:00.000Z"); // Thursday 12:30 in Vancouver
  const nextWeek = resolveSessions({ weekdays: ["TUE", "THU"], when: "next_week", time: "16:00" }, thu, TZ);
  check("next_week Tue+Thu from Thursday Oct 8 -> Oct 13 and Oct 15, 16:00 PDT = 23:00Z", nextWeek.ok && nextWeek.sessions.map((s) => s.localDate).join() === "2026-10-13,2026-10-15" && nextWeek.sessions[0].startAt === "2026-10-13T23:00:00.000Z" && nextWeek.sessions[0].weekday === "Tue", nextWeek);
  const thisWeek = resolveSessions({ weekdays: ["MON", "FRI"], when: "this_week", time: "09:30" }, thu, TZ);
  check("this_week uses Monday to Sunday of the current week", thisWeek.ok && thisWeek.sessions.map((s) => s.localDate).join() === "2026-10-05,2026-10-09");
  const dst = resolveSessions({ weekdays: ["TUE"], startDate: "2026-10-27", weeks: 2, time: "16:00" }, thu, TZ);
  check("A weekly pattern across the Nov 1 clock change keeps local 16:00 (23:00Z, then 00:00Z)", dst.ok && dst.sessions.map((s) => s.startAt).join() === "2026-10-27T23:00:00.000Z,2026-11-04T00:00:00.000Z", dst);
  const explicit = resolveSessions({ dates: ["2026-12-02", "2026-12-01", "2026-12-01"], time: "18:15" }, thu, TZ);
  check("Explicit dates are de-duplicated and sorted", explicit.ok && explicit.sessions.map((s) => s.localDate).join() === "2026-12-01,2026-12-02");
  check("An impossible date is rejected", !resolveSessions({ dates: ["2026-02-30"], time: "10:00" }, thu).ok);
  check("A bad time is rejected", !resolveSessions({ dates: ["2026-12-01"], time: "4pm" }, thu).ok);
  check("Weekdays without when/startDate are rejected", !resolveSessions({ weekdays: ["TUE"], time: "10:00" }, thu).ok);
  check("No pattern at all is rejected", !resolveSessions({ time: "10:00" }, thu).ok);
  const tooMany = resolveSessions({ weekdays: ["MON", "TUE", "WED"], startDate: "2026-12-01", weeks: 12, time: "10:00" }, thu, TZ);
  check("More than 30 sessions is rejected (contract limit)", !tooMany.ok && /30/.test((tooMany as any).message), tooMany);
  check("zonedTimeToUtc matches resolveSessions", zonedTimeToUtc({ year: 2026, month: 10, day: 13, hour: 16 }, TZ).toISOString() === "2026-10-13T23:00:00.000Z");

  // ----- scheduling proposals -----
  reset();
  const base = business();
  const week = resolveWhen("next_week");
  const free = await call("proposeCreateSessions", alex, { courseId: ids.courseA, weekdays: ["TUE", "THU"], when: "next_week", time: "10:00", durationMin: 60 });
  check("A conflict-free request creates a pending CREATE_SESSIONS proposal", free.ok && free.data.status === "PENDING_CONFIRMATION" && free.proposal?.type === "CREATE_SESSIONS" && free.proposal.status === "pending", free.data);
  check("Nothing is scheduled by creating the proposal", business() === base);
  const payload = free.proposal!.payload as any;
  check("The payload holds UTC times computed by code, inside next week", payload.sessions.length === 2 && payload.sessions.every((s: any) => Date.parse(s.startAt) >= +week.from && Date.parse(s.startAt) < +week.to) && payload.sessions[0].startAt === zonedTimeToUtc({ ...dateParts(free.data.sessions[0].localDate), hour: 10 }).toISOString());
  check("The preview marks each session with a tick and no conflicts", free.proposal!.preview!.filter((l) => l.startsWith("✅")).length === 2 && free.proposal!.preview![0].includes("2 sessions"), free.proposal!.preview);
  const confirmed = await eduProposals.confirm(alex, free.proposal!.id);
  check("Confirm schedules both sessions as SCHEDULED", confirmed.ok && confirmed.data.status === "executed" && store.sessions.filter((s) => s.courseId === ids.courseA && s.startAt === payload.sessions[0].startAt).length === 1 && store.sessions.length === JSON.parse(base).s + 2);
  const afterConfirm = business();
  await eduProposals.confirm(alex, free.proposal!.id);
  check("Confirming again does not create duplicates", business() === afterConfirm);

  // Stage 1: conflicts block the proposal, and report why.
  reset();
  const clash = await call("proposeCreateSessions", alex, { courseId: ids.courseB, weekdays: ["TUE"], when: "next_week", time: "16:00", durationMin: 60 });
  check("A conflicting slot creates NO proposal", clash.ok && clash.data.status === "CONFLICTS_FOUND" && !clash.proposal && (await eduProposals.list(alex)).length === 0, clash.data);
  check("Each session is marked with the reason it conflicts", clash.data.sessions[0].ok === false && clash.data.sessions[0].conflictsWith.some((c: any) => c.courseName === "Grade 8 Math Small Group") && /ask how to adjust/i.test(clash.data.note), clash.data.sessions);
  const mixed = await call("proposeCreateSessions", alex, { courseId: ids.courseB, weekdays: ["TUE", "WED"], when: "next_week", time: "16:00", durationMin: 60 });
  check("If only one of several sessions conflicts, the whole batch is held back", mixed.data.status === "CONFLICTS_FOUND" && mixed.data.sessions.filter((s: any) => s.ok).length === 1 && !mixed.proposal);

  // Stage 2: a conflict that appears between proposal and confirmation.
  reset();
  const stage = await call("proposeCreateSessions", alex, { courseId: ids.courseA, weekdays: ["WED"], when: "next_week", time: "11:00", durationMin: 60 });
  const stageStart = (stage.proposal!.payload as any).sessions[0].startAt;
  await createSessions(alex, { courseId: ids.courseB, sessions: [{ startAt: stageStart, durationMin: 60 }] });
  const snapshot = business();
  const failed = await eduProposals.confirm(alex, stage.proposal!.id);
  const stored = await proposalStore.get(stage.proposal!.id);
  check("A conflict found at confirmation fails the proposal and writes nothing", failed.ok && failed.data.status === "failed" && failed.data.error?.code === "CONFLICT" && stored?.status === "failed" && business() === snapshot);
  check("The failure message names what it conflicts with and says the schedule did not change", /Grade 8 Physics 1:1/.test(failed.ok ? failed.data.error!.message : "") && /schedule was not changed/i.test(failed.ok ? failed.data.error!.message : ""), failed);

  // Validation and isolation.
  reset();
  const refusals: [string, Awaited<ReturnType<typeof call>>, string][] = [
    ["Past dates", await call("proposeCreateSessions", alex, { courseId: ids.courseA, dates: ["2000-01-03"], time: "10:00", durationMin: 60 }), "VALIDATION"],
    ["Another teacher's course", await call("proposeCreateSessions", taylor, { courseId: ids.courseA, weekdays: ["TUE"], when: "next_week", time: "10:00", durationMin: 60 }), "NOT_FOUND"],
    ["A student", await call("proposeCreateSessions", jordan, { courseId: ids.courseA, weekdays: ["TUE"], when: "next_week", time: "10:00", durationMin: 60 }), "FORBIDDEN"],
    ["Weekdays without a week", await call("proposeCreateSessions", alex, { courseId: ids.courseA, weekdays: ["TUE"], time: "10:00", durationMin: 60 }), "INVALID_ARGUMENTS"],
    ["A bad time", await call("proposeCreateSessions", alex, { courseId: ids.courseA, weekdays: ["TUE"], when: "next_week", time: "4pm", durationMin: 60 }), "INVALID_ARGUMENTS"],
    ["A 10-minute session", await call("proposeCreateSessions", alex, { courseId: ids.courseA, weekdays: ["TUE"], when: "next_week", time: "10:00", durationMin: 10 }), "INVALID_ARGUMENTS"],
    ["Too many sessions", await call("proposeCreateSessions", alex, { courseId: ids.courseA, weekdays: ["MON", "TUE", "WED"], startDate: "2031-01-06", weeks: 12, time: "10:00", durationMin: 60 }), "INVALID_ARGUMENTS"],
  ];
  for (const [name, result, code] of refusals) check(`${name} -> ${code}, no proposal`, !result.ok && result.data.error.code === code && !result.proposal, result.data);
  check("No proposals exist after all the refusals", (await eduProposals.list(alex)).length === 0 && (await eduProposals.list(taylor)).length === 0);

  // ----- course creation -----
  reset();
  const coursesBefore = business();
  const created = await call("proposeCreateCourse", alex, { name: "Weekend Math", subject: "Math", type: "SMALL_CLASS", pricePerSession: 40.5, studentEmails: ["Student1@Example.test", "student1@example.test", "nobody@example.test"] });
  const course = (created.proposal!.payload as any);
  check("A pending CREATE_COURSE proposal is created and nothing exists yet", created.ok && created.proposal?.status === "pending" && business() === coursesBefore && created.data.status === "PENDING_CONFIRMATION");
  check("Price is converted from dollars to cents by code (40.5 -> 4050)", course.course.pricePerSessionCents === 4050 && created.data.pricePerSession === "$40.50");
  check("Emails are lower-cased and de-duplicated", JSON.stringify(course.studentEmails) === JSON.stringify(["student1@example.test", "nobody@example.test"]));
  check("The preview lists name, type, price and students", created.proposal!.preview!.join("|").includes("Weekend Math") && created.proposal!.preview!.join("|").includes("$40.50") && created.proposal!.preview!.join("|").includes("nobody@example.test"), created.proposal!.preview);
  const done = await eduProposals.confirm(alex, created.proposal!.id);
  const result = (done.ok ? done.data.result : undefined) as any;
  const outcomes = Object.fromEntries((result?.students ?? []).map((s: any) => [s.email, s.status]));
  check("Confirm creates the course and adds the registered student", done.ok && done.data.status === "executed" && outcomes["student1@example.test"] === "ADDED");
  check("An unregistered email is reported, and the course is kept (no rollback)", outcomes["nobody@example.test"] === "NOT_REGISTERED" && (await listMyCourses(alex)).ok && store.courses.some((c) => c.id === result.courseId), outcomes);
  const roster = await listMyStudents(alex, { courseId: result.courseId });
  check("The new course has exactly the one registered student", roster.ok && roster.data.students.length === 1 && roster.data.students[0].name === "Jordan Lee");
  const afterCourse = business();
  await eduProposals.confirm(alex, created.proposal!.id);
  check("Confirming again does not create a second course", business() === afterCourse);

  const dup = await call("proposeCreateCourse", alex, { name: "grade 8 math small group", subject: "Math", type: "SMALL_CLASS", pricePerSession: 40, studentEmails: [] });
  check("A same-name course is allowed but the model is warned", dup.ok && !!dup.proposal && dup.data.warnings?.some((w: string) => /already have a course/i.test(w)), dup.data);
  const free0 = await call("proposeCreateCourse", alex, { name: "Free Club", subject: "Art", type: "SMALL_CLASS", pricePerSession: 0 });
  check("A price of 0 triggers a warning", free0.data.warnings?.some((w: string) => /price per session is 0/i.test(w)));
  const badCourse: [string, any][] = [
    ["negative price", { name: "X", subject: "Y", type: "SMALL_CLASS", pricePerSession: -5 }],
    ["missing price", { name: "X", subject: "Y", type: "SMALL_CLASS" }],
    ["bad email", { name: "X", subject: "Y", type: "SMALL_CLASS", pricePerSession: 10, studentEmails: ["not-an-email"] }],
    ["bad type", { name: "X", subject: "Y", type: "GROUP", pricePerSession: 10 }],
    ["empty name", { name: "  ", subject: "Y", type: "SMALL_CLASS", pricePerSession: 10 }],
  ];
  for (const [name, args] of badCourse) check(`Course with ${name} is rejected`, (await call("proposeCreateCourse", alex, args)).data.error?.code === "INVALID_ARGUMENTS");
  check("A student cannot create a course proposal", (await call("proposeCreateCourse", jordan, { name: "X", subject: "Y", type: "SMALL_CLASS", pricePerSession: 10 })).data.error?.code === "FORBIDDEN");
  const pendingBefore = (await eduProposals.list(alex, "pending")).length;
  check("Only the valid requests left pending proposals", pendingBefore === 2, pendingBefore);

  // ----- through the agent loop -----
  reset();
  const args = { name: "Weekend Math", subject: "Math", type: "SMALL_CLASS", pricePerSession: 40, studentEmails: ["student1@example.test"] };
  const steps: Result<Completion>[] = [
    ok({ content: null, toolCalls: [{ id: "c1", name: "proposeCreateCourse", args }], message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "proposeCreateCourse", arguments: JSON.stringify(args) } }] } }),
    ok({ content: "I prepared the course. Please confirm.", toolCalls: [], message: { role: "assistant", content: "I prepared the course. Please confirm." } }),
  ];
  let n = 0;
  const snap = business();
  const out = await runAgent({ actor: alex, role: "TEACHER", userMessage: "Create a weekend math group with student1@example.test", history: [] }, { chatCompletion: (async () => steps[n++]) as unknown as AgentDeps["chatCompletion"], record: () => undefined });
  check("The agent returns the pending proposal and changes no data", out.proposals.length === 1 && out.proposals[0].type === "CREATE_COURSE" && business() === snap);
  check("The agent has no confirm tool for these either", getToolsForRole("TEACHER").every((t) => !/confirm|discard/i.test(t.name)));

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

function dateParts(text: string) {
  const [year, month, day] = text.split("-").map(Number);
  return { year, month, day };
}

main();
