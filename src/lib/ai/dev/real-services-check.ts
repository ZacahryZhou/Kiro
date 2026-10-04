// Application-runtime smoke check. Run against an isolated migrated development database:
// NODE_ENV=development npx tsx src/lib/ai/dev/real-services-check.ts
import { prisma } from "@/lib/db/prisma";
import { demoPassword, seedFixtures } from "../../../../prisma/seed-ai";
import { findTool } from "../domain/edu/tools";
import { eduProposals } from "../domain/edu/proposal-types";
import * as services from "../services";
import * as coreRead from "@/services/read";
import * as coreWrite from "@/services/write";
import type { Actor } from "@/contracts";

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.info("SKIP real-service smoke check (run with NODE_ENV=development against an isolated database).");
    await prisma.$disconnect();
    return;
  }
  const teacherUser = await prisma.user.findUnique({ where: { email: "t+alex@example.test" } });
  const otherTeacherUser = await prisma.user.findUnique({ where: { email: "t+taylor@example.test" } });
  const jordanUser = await prisma.user.findUnique({ where: { email: "s+jordan@example.test" } });
  const samUser = await prisma.user.findUnique({ where: { email: "s+sam@example.test" } });
  if (!teacherUser || !otherTeacherUser || !jordanUser || !samUser) throw new Error("Run npm run db:seed:demo first.");
  const teacher: Actor = { userId: teacherUser.id, role: "TEACHER" };
  const otherTeacher: Actor = { userId: otherTeacherUser.id, role: "TEACHER" };
  const jordan: Actor = { userId: jordanUser.id, role: "STUDENT" };
  const course = await prisma.course.findUnique({ where: { id: "kora-ai-course-math" } });
  if (!course) throw new Error("Acceptance demo course is missing.");
  const tool = findTool("TEACHER", "proposeAddContent");
  if (!tool) throw new Error("ADD_CONTENT proposal tool is unavailable.");

  let createdMemoryId: string | undefined;
  const createdSessionIds: string[] = [];
  const smokeProposalIds: string[] = [];
  let smokeSessionId = "";
  let assertions = 0;
  const check = (condition: boolean, description: string) => {
    if (!condition) throw new Error(`FAIL: ${description}`);
    assertions += 1;
    console.info(`PASS ${description}`);
  };
  try {
    // Start from pristine fixtures; the fixture seed owns all business-table writes.
    await seedFixtures(prisma, { reset: true });
    const beforeUnits = await prisma.courseUnit.count({ where: { courseId: course.id } });
    const draft = await tool.run(teacher, {
      courseId: course.id,
      unitTitle: "Acceptance Content Flow",
      materials: [{ title: "Acceptance Notes", kind: "TEXT", content: "To solve 2x + 4 = 10, subtract 4 from both sides, then divide both sides by 2." }],
    });
    check(draft.ok && draft.proposal?.status === "pending" && draft.proposal.type === "ADD_CONTENT", "teacher creates a persisted pending ADD_CONTENT proposal");
    if (draft.proposal) smokeProposalIds.push(draft.proposal.id);
    const afterDraftUnits = await prisma.courseUnit.count({ where: { courseId: course.id } });
    check(afterDraftUnits === beforeUnits, "creating a proposal does not write business content");
    check(!(await eduProposals.list(jordan, "pending")).some((proposal) => proposal.id === draft.proposal?.id), "student cannot list a teacher's proposal");
    const confirmed = await eduProposals.confirm(teacher, draft.proposal!.id);
    check(confirmed.ok && confirmed.data.status === "executed", "teacher confirmation executes the proposal through real write services");
    const unitId = (confirmed.ok ? confirmed.data.result as { unitId?: string } : {}).unitId;
    if (!unitId) throw new Error("Confirmed result did not include its created unit id.");
    const materials = await services.getCourseMaterials(teacher, { courseId: course.id });
    check(materials.ok && materials.data.units.some((unit) => unit.id === unitId && unit.materials.some((item) => item.title === "Acceptance Notes")), "confirmed unit and material are readable from the real course database");
    const studentView = await services.getStudentWorkspace(jordan, {
      from: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      to: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    check(studentView.ok && studentView.data.courses.some((item) => item.id === course.id), "the enrolled student sees the seeded course through the real student service");
    const repeated = await eduProposals.confirm(teacher, draft.proposal!.id);
    check(repeated.ok && repeated.data.status === "executed", "reconfirming an executed proposal does not execute it again");

    const privateMemory = await services.getStudentMemory(teacher, { courseId: course.id, studentId: jordan.userId });
    check(privateMemory.ok && privateMemory.data.memories.some((memory) => memory.kind === "AVAILABILITY"), "teacher can read the enrolled student's private availability memory");
    check(!(await services.getStudentMemory(otherTeacher, { courseId: course.id })).ok, "another teacher cannot read that memory");
    check(!(await services.getStudentMemory(jordan, { courseId: course.id })).ok, "a student cannot read teacher-private memory");
    const noteTool = findTool("TEACHER", "proposeAddStudentNote")!;
    const noteDraft = await noteTool.run(teacher, {
      courseId: course.id, studentId: jordan.userId, kind: "NOTE", content: "Real service proposal smoke check.",
    });
    check(noteDraft.ok && noteDraft.proposal?.status === "pending", "student memory write requires a pending teacher proposal");
    if (noteDraft.proposal) smokeProposalIds.push(noteDraft.proposal.id);
    const memoryCount = await prisma.agentMemory.count({ where: { courseId: course.id, studentId: jordan.userId } });
    const noteConfirmation = await eduProposals.confirm(teacher, noteDraft.proposal!.id);
    const noteResult = noteConfirmation.ok ? noteConfirmation.data.result as { memoryId?: string } : undefined;
    createdMemoryId = noteResult?.memoryId;
    check(noteConfirmation.ok && noteConfirmation.data.status === "executed" && !!createdMemoryId, "confirming the note proposal writes a real AgentMemory row");
    check(await prisma.agentMemory.count({ where: { courseId: course.id, studentId: jordan.userId } }) === memoryCount + 1, "memory appears only after the teacher confirms it");

    const trendTool = findTool("TEACHER", "getAttendanceTrends")!;
    const trend = await trendTool.run(teacher, { courseId: course.id, studentId: jordan.userId });
    const trendRows = JSON.parse(trend.content).trends as { enoughData: boolean; attendanceRate: number | null }[];
    check(trend.ok && trendRows[0]?.enoughData === true && trendRows[0]?.attendanceRate === 100, "attendance rate and minimum sample threshold are calculated from real records");

    const scheduleTool = findTool("TEACHER", "proposeCreateSessions")!;
    const preference = await scheduleTool.run(teacher, { courseId: course.id, time: "16:00", durationMin: 60, when: "next_week", weekdays: ["TUE"] });
    check(preference.ok && JSON.parse(preference.content).status === "MEMORY_PREFERENCE_CONFLICTS" && !preference.proposal, "schedule proposal honors an enrolled student's recorded afternoon availability");
    const freeSchedule = await scheduleTool.run(teacher, { courseId: course.id, time: "10:00", durationMin: 60, when: "next_week", weekdays: ["MON"] });
    check(freeSchedule.ok && freeSchedule.proposal?.status === "pending", "a conflict-free schedule proposal is persisted but not yet applied");
    if (freeSchedule.proposal) smokeProposalIds.push(freeSchedule.proposal.id);
    const scheduleConfirmation = await eduProposals.confirm(teacher, freeSchedule.proposal!.id);
    const scheduledIds = scheduleConfirmation.ok && scheduleConfirmation.data.status === "executed"
      ? (scheduleConfirmation.data.result as { sessionIds?: string[] }).sessionIds ?? []
      : [];
    createdSessionIds.push(...scheduledIds);
    check(scheduleConfirmation.ok && scheduleConfirmation.data.status === "executed" && scheduledIds.length === 1, "confirmation writes the session through the real conflict-checking service");

    const sessionTime = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const scheduledForAttendance = await services.createSessions(teacher, { courseId: course.id, sessions: [{ startAt: sessionTime.toISOString(), durationMin: 60 }] });
    if (!scheduledForAttendance.ok) throw new Error("Could not schedule the attendance smoke session.");
    smokeSessionId = scheduledForAttendance.data.sessionIds[0];
    const roster = await services.listMyStudents(teacher, { courseId: course.id });
    if (!roster.ok) throw new Error("Could not load demo roster.");
    const markTool = findTool("TEACHER", "proposeMarkAttendance")!;
    const proposedAttendance = await markTool.run(teacher, {
      sessionId: smokeSessionId,
      records: roster.data.students.map((entry) => ({ studentId: entry.id, status: entry.name === "Jordan Lee" ? "PRESENT" : "LEAVE" })),
    });
    check(proposedAttendance.ok && proposedAttendance.proposal?.status === "pending", "real attendance tool creates a pending proposal for the full roster");
    if (proposedAttendance.proposal) smokeProposalIds.push(proposedAttendance.proposal.id);
    check(await prisma.attendance.count({ where: { sessionId: smokeSessionId } }) === 0, "real attendance proposal has no side effects before confirmation");
    const attendanceConfirmation = await eduProposals.confirm(teacher, proposedAttendance.proposal!.id);
    check(attendanceConfirmation.ok && attendanceConfirmation.data.status === "executed", "confirmation writes attendance through the real atomic service");
    const marked = await prisma.attendance.findMany({ where: { sessionId: smokeSessionId }, orderBy: { studentId: "asc" } });
    const deductions = await prisma.deduction.findMany({ where: { sessionId: smokeSessionId } });
    check(marked.length === 2 && deductions.length === 1 && deductions[0].studentId === jordan.userId, "present is deducted once and leave is not charged");
    await eduProposals.confirm(teacher, proposedAttendance.proposal!.id);
    check(await prisma.attendance.count({ where: { sessionId: smokeSessionId } }) === 2 && await prisma.deduction.count({ where: { sessionId: smokeSessionId } }) === 1, "reconfirming the database-backed attendance proposal creates no duplicate records");

    // ----- student leave requests -----
    const upcoming = await services.getStudentWorkspace(jordan, { from: new Date().toISOString(), to: new Date(Date.now() + 30 * 86_400_000).toISOString() });
    const mathSession = upcoming.ok ? upcoming.data.sessions.find((x) => x.courseId === course.id) : undefined;
    const physicsSession = upcoming.ok ? upcoming.data.sessions.find((x) => x.courseId !== course.id) : undefined;
    if (!mathSession || !physicsSession) throw new Error("The fixtures need upcoming sessions in two of Jordan's courses.");
    const sam: Actor = { userId: samUser.id, role: "STUDENT" };
    const attendanceBefore = await prisma.attendance.count();
    const startBefore = (await prisma.session.findUniqueOrThrow({ where: { id: mathSession.id } })).startAt.toISOString();

    const leave = await services.submitStudentRequest(jordan, { sessionId: mathSession.id, kind: "LEAVE", note: "Family trip" });
    check(leave.ok && leave.data.status === "PENDING" && leave.data.kind === "LEAVE", "a student can submit a pending leave request for an upcoming session");
    check(await prisma.attendance.count() === attendanceBefore && (await prisma.session.findUniqueOrThrow({ where: { id: mathSession.id } })).startAt.toISOString() === startBefore, "a request changes neither attendance nor the schedule");
    const duplicate = await services.submitStudentRequest(jordan, { sessionId: mathSession.id, kind: "LEAVE" });
    check(!duplicate.ok && duplicate.error.code === "CONFLICT", "a second pending request for the same session is refused");
    const otherCourse = await prisma.session.findFirstOrThrow({ where: { course: { teacherId: otherTeacher.userId } } });
    const notMine = await services.submitStudentRequest(jordan, { sessionId: otherCourse.id, kind: "LEAVE" });
    check(!notMine.ok && notMine.error.code === "FORBIDDEN", "a student cannot request a session of a course they are not in");
    const samPhysics = await services.submitStudentRequest(sam, { sessionId: physicsSession.id, kind: "LEAVE" });
    check(!samPhysics.ok && samPhysics.error.code === "FORBIDDEN", "a student cannot request a session of another student's course");
    const asTeacher = await services.submitStudentRequest(teacher, { sessionId: mathSession.id, kind: "LEAVE" });
    check(!asTeacher.ok && asTeacher.error.code === "FORBIDDEN", "a teacher cannot submit student requests");
    const badLeave = await services.submitStudentRequest(jordan, { sessionId: physicsSession.id, kind: "LEAVE", preferredStartAt: new Date(Date.now() + 86_400_000).toISOString() });
    check(!badLeave.ok && badLeave.error.code === "VALIDATION", "a leave request cannot carry a preferred time");
    const pastSession = await prisma.session.findFirstOrThrow({ where: { courseId: course.id, startAt: { lt: new Date() } } });
    const pastRequest = await services.submitStudentRequest(jordan, { sessionId: pastSession.id, kind: "LEAVE" });
    check(!pastRequest.ok && pastRequest.error.code === "CONFLICT", "a session that already happened cannot be requested");
    const racing = await Promise.all([1, 2, 3].map(() => services.submitStudentRequest(jordan, { sessionId: physicsSession.id, kind: "RESCHEDULE", preferredStartAt: new Date(Date.now() + 5 * 86_400_000).toISOString() })));
    check(racing.filter((r) => r.ok).length === 1 && await prisma.studentRequest.count({ where: { sessionId: physicsSession.id, status: "PENDING" } }) === 1, "parallel submissions leave exactly one pending request");

    const alexList = await services.listStudentRequests(teacher, { status: "PENDING" });
    check(alexList.ok && alexList.data.requests.length === 2 && alexList.data.requests.every((r) => r.studentName === "Jordan Lee"), "the course teacher sees the pending requests");
    const taylorList = await services.listStudentRequests(otherTeacher, {});
    check(taylorList.ok && taylorList.data.requests.length === 0, "another teacher sees none of them");
    const samList = await services.listStudentRequests(sam, {});
    const jordanList = await services.listStudentRequests(jordan, {});
    check(samList.ok && samList.data.requests.length === 0 && jordanList.ok && jordanList.data.requests.length === 2, "a student sees only their own requests");

    const requestId = leave.ok ? leave.data.id : "";
    const taylorResolve = await services.resolveStudentRequest(otherTeacher, { requestId, decision: "APPROVED" });
    const jordanResolve = await services.resolveStudentRequest(jordan, { requestId, decision: "APPROVED" });
    check(!taylorResolve.ok && taylorResolve.error.code === "FORBIDDEN" && !jordanResolve.ok && jordanResolve.error.code === "FORBIDDEN", "only the course teacher can answer a request");
    const approved = await services.resolveStudentRequest(teacher, { requestId, decision: "APPROVED" });
    check(approved.ok && approved.data.status === "APPROVED" && !!approved.data.resolvedAt, "the teacher approves a request");
    const answeredAgain = await services.resolveStudentRequest(teacher, { requestId, decision: "DECLINED" });
    check(!answeredAgain.ok && answeredAgain.error.code === "CONFLICT", "an answered request cannot be answered again");
    check(await prisma.attendance.count() === attendanceBefore && (await prisma.session.findUniqueOrThrow({ where: { id: mathSession.id } })).startAt.toISOString() === startBefore, "approving a request still changes neither attendance nor the schedule");

    // ----- progress records -----
    const caseyUser = await prisma.user.findUniqueOrThrow({ where: { email: "s+casey@example.test" } });
    const progressInput = { sessionId: pastSession.id, studentId: jordan.userId, goal: "Linear equations", output: "Solved 8 of 10 correctly", issue: "Sign errors", nextAction: "PRACTICE" as const, note: "Needs a calmer pace" };
    const saved = await services.saveProgressRecord(teacher, progressInput);
    check(saved.ok && saved.data.note === "Needs a calmer pace" && saved.data.nextAction === "PRACTICE", "a teacher saves a progress record for an enrolled student");
    const replaced = await services.saveProgressRecord(teacher, { ...progressInput, goal: "Linear equations, part 2", issue: undefined });
    check(replaced.ok && await prisma.progressRecord.count({ where: { sessionId: pastSession.id, studentId: jordan.userId } }) === 1 && replaced.data.goal === "Linear equations, part 2" && replaced.data.issue === undefined, "saving again replaces the record instead of adding another");
    const ownRecords = await services.listProgressRecords(jordan, {});
    check(ownRecords.ok && ownRecords.data.records.length === 1 && !("note" in ownRecords.data.records[0]), "a student sees their own record without the teacher's private note");
    const samRecords = await services.listProgressRecords(sam, {});
    const taylorRecords = await services.listProgressRecords(otherTeacher, {});
    check(samRecords.ok && samRecords.data.records.length === 0 && taylorRecords.ok && taylorRecords.data.records.length === 0, "another student and another teacher see none of it");
    const alexRecords = await services.listProgressRecords(teacher, { courseId: course.id });
    check(alexRecords.ok && alexRecords.data.records.length === 1 && alexRecords.data.records[0].note === "Needs a calmer pace", "the course teacher sees the record with the note");
    const taylorSave = await services.saveProgressRecord(otherTeacher, progressInput);
    check(!taylorSave.ok && taylorSave.error.code === "FORBIDDEN", "another teacher cannot save progress for this session");
    const notEnrolled = await services.saveProgressRecord(teacher, { ...progressInput, studentId: caseyUser.id });
    check(!notEnrolled.ok && notEnrolled.error.code === "NOT_FOUND", "progress cannot be saved for a student who is not enrolled");
    const byStudent = await services.saveProgressRecord(jordan as unknown as Actor, progressInput);
    check(!byStudent.ok && byStudent.error.code === "FORBIDDEN", "a student cannot save progress records");
    const future = await services.saveProgressRecord(teacher, { ...progressInput, sessionId: mathSession.id });
    check(!future.ok && future.error.code === "CONFLICT", "progress cannot be saved for a session that has not started");
    const blank = await services.saveProgressRecord(teacher, { ...progressInput, goal: "" });
    check(!blank.ok && blank.error.code === "VALIDATION", "a record needs a goal");

    // ----- account settings -----
    const hashBefore = (await prisma.user.findUniqueOrThrow({ where: { id: jordan.userId } })).passwordHash;
    const teacherHashBefore = (await prisma.user.findUniqueOrThrow({ where: { id: teacher.userId } })).passwordHash;
    const renamed = await coreWrite.updateMyProfile(jordan, { name: "Jordan L." });
    const account = await coreRead.getMyAccount(jordan);
    check(renamed.ok && account.ok && account.data.name === "Jordan L." && account.data.role === "STUDENT", "a user can change their own name and read it back");
    const emptyName = await coreWrite.updateMyProfile(jordan, { name: "   " });
    check(!emptyName.ok && emptyName.error.code === "VALIDATION", "an empty name is refused");
    const wrongCurrent = await coreWrite.changeMyPassword(jordan, { currentPassword: "not-the-password", newPassword: "A-new-passphrase-1" });
    check(!wrongCurrent.ok && wrongCurrent.error.code === "VALIDATION" && (await prisma.user.findUniqueOrThrow({ where: { id: jordan.userId } })).passwordHash === hashBefore, "a wrong current password changes nothing");
    const tooShort = await coreWrite.changeMyPassword(jordan, { currentPassword: "x", newPassword: "short" });
    check(!tooShort.ok && tooShort.error.code === "VALIDATION", "a short new password is refused");
    const changed = await coreWrite.changeMyPassword(jordan, { currentPassword: demoPassword, newPassword: "A-new-passphrase-1" });
    const hashAfter = (await prisma.user.findUniqueOrThrow({ where: { id: jordan.userId } })).passwordHash;
    check(changed.ok && hashAfter !== hashBefore, "the right current password lets a user change their own password");
    check((await prisma.user.findUniqueOrThrow({ where: { id: teacher.userId } })).passwordHash === teacherHashBefore, "changing one user's password never touches another account");
  } finally {
    // Leave the database in its pristine fixture state.
    await seedFixtures(prisma, { reset: true });
    await prisma.$disconnect();
  }
  console.info(`All ${assertions} real-service checks passed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Real-service acceptance check failed.");
  process.exitCode = 1;
});
