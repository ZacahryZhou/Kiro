/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script reads untyped tool JSON */
// Assertion script for the teacher tools and the calendar helpers.
// Run: npx tsx src/lib/ai/dev/tools-check.ts
import {
  addDaysTo,
  describeInstant,
  parseDateOnly,
  parseTimeOnly,
  resolveWhen,
  todayLocal,
  formatDateOnly,
} from "../core/time";
import { findTool, getToolsForRole } from "../domain/edu/tools";
import { eduProposals } from "../domain/edu/proposal-types";
import { addMaterial } from "../services";
import { actorFor, ids, resetStore, store } from "./fake-store";
import { timeZoneDataProblem, vancouverWinterRule } from "./tz-sanity";

const alex = actorFor("teacher1@example.test")!;
const taylor = actorFor("teacher2@example.test")!;
const jordan = actorFor("student1@example.test")!;

let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}

async function run(tool: string, actor = alex, args: unknown = {}) {
  const result = await findTool("TEACHER", tool)!.run(actor, args);
  return { ok: result.ok, content: result.content, data: JSON.parse(result.content) as Record<string, any> };
}

async function main() {
  const tzProblem = timeZoneDataProblem();
  check("Vancouver wall-clock times round-trip through UTC around the autumn change (any tz database version)", tzProblem === null, tzProblem);
  console.info(`INFO  ${vancouverWinterRule()}`);

  // ----- tool sets -----
  const names = getToolsForRole("TEACHER").map((t) => t.name).sort();
  check("Teacher has 13 read-only tools plus nine proposal tools", JSON.stringify(names) === JSON.stringify(["checkConflicts", "findMyStudent", "getAttendanceTrends", "getCourseMaterials", "getMyProfile", "getStudentMemory", "getTeacherSchedule", "listAttendance", "listDeductions", "listMyCourses", "listMyStudents", "listProgressRecords", "listStudentRequests", "proposeAddContent", "proposeAddStudent", "proposeAddStudentNote", "proposeCreateCourse", "proposeCreateSessions", "proposeLessonPrep", "proposeMarkAttendance", "proposeProgressRecord", "proposeReschedule"]), names);
  check("Students get three read tools, a request list, a progress list and one proposal tool (leave requests to their own teacher)", JSON.stringify(getToolsForRole("STUDENT").map((t) => t.name).sort()) === JSON.stringify(["answerFromCourseMaterials", "getMyProfile", "getStudentWorkspace", "listProgressRecords", "listStudentRequests", "proposeStudentRequest"]));
  const schemaText = JSON.stringify(getToolsForRole("TEACHER").map((t) => t.parameters));
  check("No tool parameter is called userId or role", !/"userId"|"role"/.test(schemaText));
  check("No tool can write directly (nine propose* tools only prepare pending proposals)", getToolsForRole("TEACHER").every((t) => !/^(create|add|confirm|reschedule|delete|update|discard)/.test(t.name)) && getToolsForRole("TEACHER").filter((t) => t.name.startsWith("propose")).length === 9);

  // ----- calendar helpers -----
  check("parseDateOnly rejects 2026-02-30", parseDateOnly("2026-02-30") === null && parseDateOnly("2026-2-3") === null && parseDateOnly("2026-02-28") !== null);
  check("parseTimeOnly validates HH:mm", parseTimeOnly("24:00") === null && parseTimeOnly("9:00") === null && parseTimeOnly("16:30")?.minute === 30);
  const beforeDst = new Date("2026-10-28T19:00:00.000Z");
  const week = resolveWhen("this_week", beforeDst, "America/Vancouver");
  const weekEnd = describeInstant(week.to.toISOString(), "America/Vancouver");
  const weekSpanHours = (week.to.getTime() - week.from.getTime()) / 3_600_000;
  check("this_week runs local Monday 00:00 to next local Monday 00:00 across the autumn change (any tz database version)", week.from.toISOString() === "2026-10-26T07:00:00.000Z" && weekEnd.localDate === "2026-11-02" && weekEnd.localTime === "00:00" && Math.abs(weekSpanHours - 168) <= 1, { week, weekEnd, weekSpanHours });
  const tomorrow = resolveWhen("tomorrow", new Date("2026-10-08T06:30:00.000Z"), "America/Vancouver");
  check("tomorrow uses the local date (06:30Z is still Oct 7 in Vancouver)", tomorrow.from.toISOString() === "2026-10-08T07:00:00.000Z" && tomorrow.to.toISOString() === "2026-10-09T07:00:00.000Z", tomorrow);
  check("describeInstant gives local date, time and weekday", JSON.stringify(describeInstant("2026-10-08T23:00:00.000Z", "America/Vancouver")) === JSON.stringify({ localDate: "2026-10-08", localTime: "16:00", weekday: "Thu" }));

  // ----- schedule tool -----
  resetStore();
  const thisWeek = await run("getTeacherSchedule", alex, { when: "this_week" });
  const range = resolveWhen("this_week");
  check("getTeacherSchedule(this_week) returns only Alex's sessions inside this week", thisWeek.ok && thisWeek.data.sessions.length > 0 && thisWeek.data.sessions.every((s: any) => Date.parse(s.startAt) >= +range.from && Date.parse(s.startAt) < +range.to && s.courseId !== ids.courseC), thisWeek.data);
  check("Schedule rows carry local date, time and weekday", thisWeek.data.sessions.every((s: any) => /^\d{4}-\d{2}-\d{2}$/.test(s.localDate) && /^\d{2}:\d{2}$/.test(s.localTime) && s.weekday));
  const todayText = formatDateOnly(todayLocal());
  const explicit = await run("getTeacherSchedule", alex, { startDate: todayText, endDate: formatDateOnly(addDaysTo(todayLocal(), 1)) });
  check("Explicit startDate/endDate works", explicit.ok && explicit.data.sessions.some((s: any) => s.sessionId === "s_a_today"), explicit.data);
  check("Missing range -> INVALID_ARGUMENTS, not a crash", !(await run("getTeacherSchedule", alex, {})).ok);
  check("Reversed range -> INVALID_ARGUMENTS", (await run("getTeacherSchedule", alex, { startDate: "2026-10-09", endDate: "2026-10-01" })).data.error?.code === "INVALID_ARGUMENTS");
  check("Bad date -> INVALID_ARGUMENTS", (await run("getTeacherSchedule", alex, { startDate: "tomorrow" })).data.error?.code === "INVALID_ARGUMENTS");
  check("null / array arguments are rejected cleanly", !(await run("listMyStudents", alex, null)).ok && !(await run("listMyStudents", alex, [])).ok);

  // ----- identity is never taken from arguments -----
  const spoof = await run("getTeacherSchedule", taylor, { when: "this_week", userId: alex.userId, role: "TEACHER", teacherId: alex.userId });
  check("userId in arguments is ignored (Taylor still only sees her course)", spoof.ok && spoof.data.sessions.length > 0 && spoof.data.sessions.every((s: any) => s.courseId === ids.courseC), spoof.data);
  const crossCourse = await run("listMyStudents", taylor, { courseId: ids.courseA });
  check("Taylor asking for Alex's roster -> FORBIDDEN with no names", !crossCourse.ok && crossCourse.data.error.code === "FORBIDDEN" && !/Jordan|Sam/.test(crossCourse.content));
  check("A student running a teacher tool is refused by the service", (await run("getTeacherSchedule", jordan, { when: "this_week" })).data.error?.code === "FORBIDDEN");
  check("Taylor cannot read Alex's materials via the tool", (await run("getCourseMaterials", taylor, { courseId: ids.courseA })).data.error?.code === "FORBIDDEN");
  const taylorAttendance = await run("listAttendance", taylor, { studentId: ids.jordan });
  check("Taylor gets an empty attendance list for Jordan", taylorAttendance.ok && taylorAttendance.data.records.length === 0 && taylorAttendance.data.summary.total === 0);

  // ----- courses, students, attendance, deductions -----
  const courses = await run("listMyCourses");
  check("listMyCourses returns Alex's two courses", courses.ok && courses.data.total === 2 && courses.data.courses.every((c: any) => c.courseId !== ids.courseC));
  const roster = await run("listMyStudents", alex, { courseId: ids.courseA });
  check("listMyStudents returns Jordan and Sam", roster.ok && roster.data.students.map((s: any) => s.name).sort().join() === "Jordan Lee,Sam Patel");
  const memories = await run("getStudentMemory", alex, { courseId: ids.courseA });
  check("Teacher can read only teacher-private memories for their course", memories.ok && memories.data.memories.length === 2 && !findTool("STUDENT", "getStudentMemory"));
  check("A different teacher cannot read those memories", (await run("getStudentMemory", taylor, { courseId: ids.courseA })).data.error?.code === "FORBIDDEN");
  const trends = await run("getAttendanceTrends", alex, { courseId: ids.courseA, studentId: ids.jordan });
  check("Attendance trends refuse to judge students with fewer than three records", trends.ok && trends.data.trends[0].enoughData === false && trends.data.trends[0].attendanceRate === null, trends.data);
  const memoryCount = store.memories.length;
  const note = await run("proposeAddStudentNote", alex, { courseId: ids.courseA, studentId: ids.jordan, kind: "AVAILABILITY", content: "Unavailable Monday mornings." });
  const noteId = note.data.proposalId as string;
  check("Adding a private note creates a proposal without writing memory", note.ok && note.data.status === "PENDING_CONFIRMATION" && store.memories.length === memoryCount);
  const noteConfirmation = await eduProposals.confirm(alex, noteId);
  check("Confirming a private note writes teacher-only memory", noteConfirmation.ok && noteConfirmation.data.status === "executed" && store.memories.length === memoryCount + 1);
  // ----- add an existing student to a course (by name or email) -----
  const enrollmentsBefore = store.enrollments.length;
  const byName = await run("proposeAddStudent", alex, { courseId: ids.courseB, studentName: "Sam" });
  check("Adding a student by name resolves the email from the teacher's own roster and writes nothing yet", byName.ok && byName.data.status === "PENDING_CONFIRMATION" && byName.data.email === "student2@example.test" && store.enrollments.length === enrollmentsBefore, byName.data);
  const addConfirm = await eduProposals.confirm(alex, byName.data.proposalId as string);
  check("Confirming enrolls the student exactly once", addConfirm.ok && addConfirm.data.status === "executed" && store.enrollments.length === enrollmentsBefore + 1);
  const addAgain = await run("proposeAddStudent", alex, { courseId: ids.courseB, studentName: "Sam" });
  check("A student who is already enrolled gets no proposal", addAgain.ok && addAgain.data.status === "ALREADY_ENROLLED");
  const unknownName = await run("proposeAddStudent", alex, { courseId: ids.courseB, studentName: "Casey" });
  check("A name that is not in the teacher's own courses asks for an email instead of guessing", !unknownName.ok && unknownName.data.error?.code === "NOT_FOUND");
  const ambiguousName = await run("proposeAddStudent", alex, { courseId: ids.courseA, studentName: "student" });
  check("An ambiguous name returns candidates instead of a proposal", ambiguousName.ok && ambiguousName.data.status === "AMBIGUOUS" && ambiguousName.data.candidates.length >= 2, ambiguousName.data);
  const otherTeacherCourse = await run("proposeAddStudent", taylor, { courseId: ids.courseA, studentEmail: "student1@example.test" });
  check("A teacher cannot add students to someone else's course", !otherTeacherCourse.ok && otherTeacherCourse.data.error?.code === "NOT_FOUND");
  check("A student has no add-student tool", !findTool("STUDENT", "proposeAddStudent"));
  const attendance = await run("listAttendance", alex, { courseId: ids.courseA });
  check("Attendance summary is computed by code (3 present, 1 leave, 4 total)", attendance.ok && attendance.data.summary.present === 3 && attendance.data.summary.leave === 1 && attendance.data.summary.absent === 0 && attendance.data.summary.total === 4, attendance.data.summary);
  const absentOnly = await run("listAttendance", alex, { status: "LEAVE" });
  check("Status filter works", absentOnly.ok && absentOnly.data.records.every((r: any) => r.status === "LEAVE") && absentOnly.data.summary.leave === 1);
  const deductions = await run("listDeductions", alex, { courseId: ids.courseA });
  check("Deduction total is computed by code (3 x 40.00 = 120.00)", deductions.ok && deductions.data.count === 3 && deductions.data.totalAmountCents === 12000 && deductions.data.totalAmount === "120.00", deductions.data);

  // ----- conflicts -----
  const nextTue = store.sessions.find((s) => s.id === "s_a_next_tue")!;
  const local = describeInstant(nextTue.startAt);
  const clash = await run("checkConflicts", alex, { courseId: ids.courseB, date: local.localDate, time: local.localTime, durationMin: 60 });
  check("checkConflicts converts local date/time to UTC and finds the overlap", clash.ok && clash.data.hasConflict === true && clash.data.startAt === nextTue.startAt && clash.data.conflicts.some((c: any) => c.sessionId === "s_a_next_tue"), clash.data);
  const free = await run("checkConflicts", alex, { courseId: ids.courseA, date: "2031-03-04", time: "10:00", durationMin: 60 });
  check("checkConflicts reports no conflict for a free slot", free.ok && free.data.hasConflict === false);
  check("checkConflicts rejects a bad time", (await run("checkConflicts", alex, { courseId: ids.courseA, date: "2031-03-04", time: "4pm", durationMin: 60 })).data.error?.code === "INVALID_ARGUMENTS");
  check("checkConflicts on another teacher's course -> FORBIDDEN", (await run("checkConflicts", taylor, { courseId: ids.courseA, date: "2031-03-04", time: "10:00", durationMin: 60 })).data.error?.code === "FORBIDDEN");

  // ----- own profile and student lookup -----
  const runAs = async (role: "TEACHER" | "STUDENT", tool: string, actor: typeof alex, args: unknown = {}) => {
    const result = await findTool(role, tool)!.run(actor, args);
    return { ok: result.ok, content: result.content, data: JSON.parse(result.content) as Record<string, any> };
  };
  const alexProfile = await runAs("TEACHER", "getMyProfile", alex);
  check("getMyProfile (teacher): own name, role, 2 courses and 2 distinct students counted by code", alexProfile.ok && alexProfile.data.name === "Alex Morgan" && alexProfile.data.role === "teacher" && alexProfile.data.courseCount === 2 && alexProfile.data.totalStudents === 2 && alexProfile.data.courses.some((c: any) => c.students.includes("Sam Patel")), alexProfile.data);
  const taylorProfile = await runAs("TEACHER", "getMyProfile", taylor);
  check("getMyProfile (another teacher) shows only her own account and students", taylorProfile.data.name === "Taylor Chen" && taylorProfile.data.totalStudents === 1 && !/Jordan|Sam|Alex/.test(taylorProfile.content), taylorProfile.data);
  const jordanProfile = await runAs("STUDENT", "getMyProfile", jordan);
  check("getMyProfile (student): own name, role and courses with their teachers, no other students", jordanProfile.data.name === "Jordan Lee" && jordanProfile.data.role === "student" && jordanProfile.data.courses.length === 2 && jordanProfile.data.courses.every((c: any) => c.teacher === "Alex Morgan") && !/Sam|Casey/.test(jordanProfile.content), jordanProfile.data);
  const spoofProfile = await runAs("TEACHER", "getMyProfile", taylor, { userId: alex.userId, role: "TEACHER" });
  check("getMyProfile ignores a supplied userId", spoofProfile.data.name === "Taylor Chen");
  const found = await runAs("TEACHER", "findMyStudent", alex, { query: "jor" });
  check("findMyStudent finds Jordan by part of the name, with both courses", found.ok && found.data.total === 1 && found.data.matches[0].name === "Jordan Lee" && found.data.matches[0].courses.length === 2, found.data);
  check("findMyStudent also matches by email", (await runAs("TEACHER", "findMyStudent", alex, { query: "student2@" })).data.matches[0]?.name === "Sam Patel");
  const notMine = await runAs("TEACHER", "findMyStudent", alex, { query: "casey" });
  check("findMyStudent cannot find another teacher's student, and hints nothing more", notMine.ok && notMine.data.total === 0 && /enrolled in your courses/.test(notMine.data.note));
  check("findMyStudent for another teacher does not see Jordan", (await runAs("TEACHER", "findMyStudent", taylor, { query: "jordan" })).data.total === 0);
  check("findMyStudent rejects a one-letter query", (await runAs("TEACHER", "findMyStudent", alex, { query: "j" })).data.error?.code === "INVALID_ARGUMENTS");
  check("A student running findMyStudent is refused", (await runAs("TEACHER", "findMyStudent", jordan, { query: "sam" })).data.error?.code === "FORBIDDEN");
  check("Students do not have the student lookup tool", findTool("STUDENT", "findMyStudent") === undefined);

  // ----- materials -----
  const unitId = store.units.find((u) => u.courseId === ids.courseA)!.id;
  await addMaterial(alex, { unitId, title: "Long text", kind: "TEXT", content: "x".repeat(5000) });
  const materials = await run("getCourseMaterials", alex, { courseId: ids.courseA });
  const long = materials.data.units.flatMap((u: any) => u.materials).find((m: any) => m.title === "Long text");
  check("Long material text is cut at 2000 characters and flagged", materials.ok && long.content.length === 2000 && long.truncated === true);

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
