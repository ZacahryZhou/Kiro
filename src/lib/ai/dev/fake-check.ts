// Assertion script for the fake services. Run: npx tsx src/lib/ai/dev/fake-check.ts
import type { Actor } from "@/contracts";
import {
  addExistingStudentToCourse,
  checkConflicts,
  confirmAttendance,
  createCourse,
  createSessions,
  getCourseMaterials,
  getStudentWorkspace,
  getTeacherSchedule,
  listAttendance,
  listDeductions,
  listMyCourses,
  listMyStudents,
  rescheduleSession,
} from "../services";
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
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error!.code);

const FAR = "2031-03-04T10:00:00.000Z";

async function main() {
  const wide = { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" };

  // ----- access isolation -----
  resetStore();
  check("Taylor cannot list Alex's students", code(await listMyStudents(taylor, { courseId: ids.courseA })) === "FORBIDDEN");
  check("Taylor cannot read Alex's materials", code(await getCourseMaterials(taylor, { courseId: ids.courseA })) === "FORBIDDEN");
  check("Taylor cannot filter the schedule by Alex's course", code(await getTeacherSchedule(taylor, { ...wide, courseId: ids.courseA })) === "FORBIDDEN");
  const taylorSchedule = await getTeacherSchedule(taylor, wide);
  check("Taylor's schedule only has her own course", taylorSchedule.ok && taylorSchedule.data.sessions.length > 0 && taylorSchedule.data.sessions.every((s) => s.courseId === ids.courseC));
  const taylorCourses = await listMyCourses(taylor);
  check("Taylor sees only her own course", taylorCourses.ok && taylorCourses.data.courses.length === 1 && taylorCourses.data.courses[0].id === ids.courseC);
  const taylorAttendance = await listAttendance(taylor, { studentId: ids.jordan });
  check("Taylor gets no attendance for Jordan", taylorAttendance.ok && taylorAttendance.data.records.length === 0);
  const jordanAttendance = await listAttendance(jordan, { studentId: ids.sam });
  check("Jordan's supplied studentId is ignored (own records only)", jordanAttendance.ok && jordanAttendance.data.records.length > 0 && jordanAttendance.data.records.every((r) => r.studentId === ids.jordan));
  const jordanDeductions = await listDeductions(jordan);
  check("Jordan sees only own deductions", jordanDeductions.ok && jordanDeductions.data.records.length > 0 && jordanDeductions.data.records.every((r) => r.studentId === ids.jordan));
  check("Jordan cannot read Casey's course materials", code(await getCourseMaterials(jordan, { courseId: ids.courseC })) === "FORBIDDEN");
  check("Student cannot call a write function", code(await createCourse(jordan, { name: "x", subject: "y", type: "ONE_ON_ONE" })) === "FORBIDDEN");
  check("Student cannot call getTeacherSchedule", code(await getTeacherSchedule(jordan, wide)) === "FORBIDDEN");
  check("Teacher cannot call getStudentWorkspace", code(await getStudentWorkspace(alex, wide)) === "FORBIDDEN");
  check("Taylor cannot take attendance for Alex's session", code(await confirmAttendance(taylor, { sessionId: "s_a_today", records: [{ studentId: ids.jordan, status: "PRESENT" }, { studentId: ids.sam, status: "PRESENT" }] })) === "FORBIDDEN");
  check("Taylor cannot reschedule Alex's session", code(await rescheduleSession(taylor, { sessionId: "s_a_today", newStartAt: FAR })) === "FORBIDDEN");
  check("Taylor cannot schedule in Alex's course", code(await createSessions(taylor, { courseId: ids.courseA, sessions: [{ startAt: FAR, durationMin: 60 }] })) === "FORBIDDEN");
  check("Unknown course is NOT_FOUND", code(await listMyStudents(alex, { courseId: "nope" })) === "NOT_FOUND");

  // ----- enrollment -----
  resetStore();
  const newCourse = await createCourse(alex, { name: "Weekend Math", subject: "Math", type: "SMALL_CLASS" });
  check("createCourse works", newCourse.ok);
  const courseId = newCourse.ok ? newCourse.data.courseId : "";
  check("Unregistered email -> NOT_FOUND", code(await addExistingStudentToCourse(alex, { courseId, email: "nobody@example.test" })) === "NOT_FOUND");
  const first = await addExistingStudentToCourse(alex, { courseId, email: "student1@example.test" });
  const again = await addExistingStudentToCourse(alex, { courseId, email: "student1@example.test" });
  check("Adding a student twice -> alreadyJoined, one enrollment", first.ok && again.ok && !first.data.alreadyJoined && again.data.alreadyJoined && store.enrollments.filter((e) => e.courseId === courseId).length === 1);
  check("A teacher email is not a student account", code(await addExistingStudentToCourse(alex, { courseId, email: "teacher2@example.test" })) === "NOT_FOUND");

  // ----- conflicts -----
  resetStore();
  const nextTueA = store.sessions.find((s) => s.id === "s_a_next_tue")!;
  const overlap = await checkConflicts(alex, { courseId: ids.courseB, startAt: nextTueA.startAt, durationMin: 60 });
  check("checkConflicts finds the Course A / Course B overlap", overlap.ok && overlap.data.conflicts.some((c) => c.sessionId === "s_a_next_tue") && overlap.data.conflicts.some((c) => c.sessionId === "s_b_next_tue"), overlap);
  const free = await checkConflicts(alex, { courseId: ids.courseA, startAt: FAR, durationMin: 60 });
  check("checkConflicts is empty for a free slot", free.ok && free.data.conflicts.length === 0);
  const sessionCount = store.sessions.length;
  const clash = await createSessions(alex, { courseId: ids.courseB, sessions: [{ startAt: FAR, durationMin: 60 }, { startAt: nextTueA.startAt, durationMin: 60 }] });
  check("Conflicting batch -> CONFLICT with details, nothing written", !clash.ok && clash.error.code === "CONFLICT" && Array.isArray(clash.error.details) && store.sessions.length === sessionCount);
  const internal = await createSessions(taylor, { courseId: ids.courseC, sessions: [{ startAt: FAR, durationMin: 60 }, { startAt: "2031-03-04T10:30:00.000Z", durationMin: 60 }] });
  check("Overlap inside one batch -> CONFLICT, nothing written", code(internal) === "CONFLICT" && store.sessions.length === sessionCount);
  const good = await createSessions(alex, { courseId: ids.courseA, sessions: [{ startAt: FAR, durationMin: 60 }, { startAt: "2031-03-05T10:00:00.000Z", durationMin: 60 }] });
  check("Conflict-free batch is written as SCHEDULED", good.ok && good.data.sessionIds.length === 2 && store.sessions.length === sessionCount + 2 && store.sessions.slice(-2).every((s) => s.status === "SCHEDULED"));
  const backToBack = await checkConflicts(alex, { courseId: ids.courseA, startAt: "2031-03-04T11:00:00.000Z", durationMin: 60 });
  check("Back-to-back sessions do not conflict", backToBack.ok && backToBack.data.conflicts.length === 0);

  // ----- attendance (contract 6.1) -----
  resetStore();
  const attendance = (a: Actor, records: { studentId: string; status: "PRESENT" | "LEAVE" | "ABSENT" }[]) =>
    confirmAttendance(a, { sessionId: "s_a_today", records });
  check("Missing a student -> VALIDATION, session unchanged", code(await attendance(alex, [{ studentId: ids.jordan, status: "PRESENT" }])) === "VALIDATION" && store.sessions.find((s) => s.id === "s_a_today")!.status === "SCHEDULED");
  check("Student not in the course -> VALIDATION", code(await attendance(alex, [{ studentId: ids.jordan, status: "PRESENT" }, { studentId: ids.casey, status: "PRESENT" }])) === "VALIDATION");
  const deductionsBefore = store.deductions.length;
  const records = [{ studentId: ids.jordan, status: "PRESENT" as const }, { studentId: ids.sam, status: "LEAVE" as const }];
  const firstConfirm = await attendance(alex, records);
  check("Attendance: 2 records, 1 deduction (Jordan), session COMPLETED", firstConfirm.ok && firstConfirm.data.attendance.length === 2 && firstConfirm.data.deductions.length === 1 && firstConfirm.data.deductions[0].studentId === ids.jordan && firstConfirm.data.deductions[0].amountCents === 4000 && store.sessions.find((s) => s.id === "s_a_today")!.status === "COMPLETED", firstConfirm);
  const attendanceCount = store.attendance.length;
  const secondConfirm = await attendance(alex, records);
  check("Repeated identical call -> ok, no new records or deductions", secondConfirm.ok && store.attendance.length === attendanceCount && store.deductions.length === deductionsBefore + 1);
  check("Different status after submission -> CONFLICT", code(await attendance(alex, [{ studentId: ids.jordan, status: "ABSENT" }, { studentId: ids.sam, status: "LEAVE" }])) === "CONFLICT");
  check("Exactly one SessionChange was written", store.sessionChanges.filter((c) => c.sessionId === "s_a_today").length === 1);
  check("A completed session cannot be rescheduled", code(await rescheduleSession(alex, { sessionId: "s_a_today", newStartAt: FAR })) === "CONFLICT");

  // ----- rescheduling (contract 6.2) -----
  resetStore();
  const target = store.sessions.find((s) => s.id === "s_a_next_tue")!.startAt;
  check("Reschedule onto a conflicting time -> CONFLICT, unchanged", code(await rescheduleSession(alex, { sessionId: "s_b_next_tue", newStartAt: target })) === "CONFLICT" && store.sessions.find((s) => s.id === "s_b_next_tue")!.startAt !== target);
  const thu = store.sessions.find((s) => s.id === "s_a_thu")!;
  const oldStart = thu.startAt;
  const moved = await rescheduleSession(alex, { sessionId: "s_a_thu", newStartAt: FAR });
  check("Reschedule: RESCHEDULED, originalStartAt kept, no deduction", moved.ok && thu.status === "RESCHEDULED" && thu.originalStartAt === oldStart && thu.startAt === FAR && store.deductions.every((d) => d.sessionId !== "s_a_thu"));

  // ----- materials and workspace -----
  resetStore();
  const materials = await getCourseMaterials(jordan, { courseId: ids.courseA });
  const text = materials.ok ? materials.data.units.flatMap((u) => u.materials).map((m) => m.content ?? "").join(" ").toLowerCase() : "";
  check("Student reads their course materials", materials.ok && materials.data.units.length === 2);
  check("Materials do not contain the vertex formula", materials.ok && !text.includes("vertex"));
  const workspace = await getStudentWorkspace(sam, wide);
  check("Sam's workspace has only Course A", workspace.ok && workspace.data.courses.length === 1 && workspace.data.courses[0].id === ids.courseA && workspace.data.sessions.every((s) => s.courseId === ids.courseA));

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
