/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script reads untyped service results */
// Application-runtime smoke check. Run against an isolated migrated development database:
// NODE_ENV=development npx tsx src/lib/ai/dev/real-services-check.ts
import { prisma } from "@/lib/db/prisma";
import { demoPassword, seedFixtures } from "../../../../prisma/seed-ai";
import { findTool } from "../domain/edu/tools";
import { eduProposals } from "../domain/edu/proposal-types";
import * as services from "../services";
import * as coreRead from "@/services/read";
import * as coreWrite from "@/services/write";
import * as dashboard from "@/services/dashboard";
import { addMaterialsFromFile, deleteMaterial } from "@/services/materials-upload";
import * as quizzes from "@/services/quiz";
import * as knowledge from "@/services/knowledge";
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

    // ----- dashboard layouts -----
    const bareLayout = { name: "Teaching day", theme: "ocean" as const, motion: "calm" as const, items: [{ id: "a", type: "TODAY_SESSIONS" as const, x: 0, y: 0, w: 6, h: 4 }, { id: "b", type: "STUDENT_FOCUS" as const, x: 6, y: 0, w: 6, h: 4, studentId: jordan.userId }] };
    const noActive = await dashboard.getActiveLayout(teacher);
    check(noActive.ok && noActive.data.layout === null, "a teacher with no saved layout gets the built-in Classic layout (null)");
    const savedLayout = await dashboard.saveDashboardLayout(teacher, bareLayout);
    check(savedLayout.ok && savedLayout.data.isActive && savedLayout.data.items.length === 2, "a teacher saves a layout and it becomes active");
    const activeLayout = await dashboard.getActiveLayout(teacher);
    check(activeLayout.ok && activeLayout.data.layout?.name === "Teaching day" && activeLayout.data.layout.theme === "ocean", "the active layout reads back with its theme");
    const otherSees = await dashboard.listMyLayouts(otherTeacher);
    check(otherSees.ok && otherSees.data.layouts.length === 0, "another teacher cannot see the layout");
    const foreignStudent = await dashboard.saveDashboardLayout(otherTeacher, bareLayout);
    check(!foreignStudent.ok && foreignStudent.error.code === "FORBIDDEN", "another teacher cannot pin a student who is not in their courses");
    const foreignCourse = await dashboard.saveDashboardLayout(otherTeacher, { name: "Sneaky", theme: "kora", motion: "off", items: [{ id: "c", type: "ATTENDANCE_TREND", x: 0, y: 0, w: 6, h: 4, courseId: course.id }] });
    check(!foreignCourse.ok && foreignCourse.error.code === "FORBIDDEN", "another teacher cannot point a widget at a course they do not teach");
    const studentSave = await dashboard.saveDashboardLayout(jordan, bareLayout);
    check(!studentSave.ok && studentSave.error.code === "FORBIDDEN", "a student cannot save a layout");
    const studentList = await dashboard.listMyLayouts(jordan);
    check(!studentList.ok && studentList.error.code === "FORBIDDEN", "a student cannot list layouts");
    const noStudent = await dashboard.saveDashboardLayout(teacher, { name: "Broken", theme: "kora", motion: "calm", items: [{ id: "x", type: "STUDENT_FOCUS", x: 0, y: 0, w: 4, h: 3 }] });
    check(!noStudent.ok && noStudent.error.code === "VALIDATION", "a student focus widget without a student is refused");
    const tooWide = await dashboard.saveDashboardLayout(teacher, { name: "Wide", theme: "kora", motion: "calm", items: [{ id: "x", type: "STATS", x: 8, y: 0, w: 6, h: 3 }] });
    check(!tooWide.ok && tooWide.error.code === "VALIDATION", "a widget past the right edge is refused");
    const second = await dashboard.saveDashboardLayout(teacher, { name: "Prep evening", theme: "sunset", motion: "lively", items: [{ id: "m", type: "MONTH_CALENDAR", x: 0, y: 0, w: 12, h: 8 }] });
    const afterSecond = await dashboard.listMyLayouts(teacher);
    check(second.ok && afterSecond.ok && afterSecond.data.layouts.length === 2 && afterSecond.data.layouts[0].name === "Prep evening" && afterSecond.data.layouts[0].isActive, "saving a second layout activates it and keeps the first in history");
    const resaved = await dashboard.saveDashboardLayout(teacher, { ...bareLayout, theme: "forest" });
    const afterReplace = await dashboard.listMyLayouts(teacher);
    check(resaved.ok && afterReplace.ok && afterReplace.data.layouts.length === 2 && afterReplace.data.layouts.find((l) => l.name === "Teaching day")?.theme === "forest", "saving under an existing name replaces that layout");
    const switched = await dashboard.activateDashboardLayout(teacher, { layoutId: second.ok ? second.data.id : "" });
    const afterSwitch = await dashboard.getActiveLayout(teacher);
    check(switched.ok && afterSwitch.ok && afterSwitch.data.layout?.name === "Prep evening", "a teacher switches back to an older layout");
    const stolenSwitch = await dashboard.activateDashboardLayout(otherTeacher, { layoutId: savedLayout.ok ? savedLayout.data.id : "" });
    check(!stolenSwitch.ok && stolenSwitch.error.code === "NOT_FOUND", "another teacher cannot activate someone else's layout");
    const stolenDelete = await dashboard.deleteDashboardLayout(otherTeacher, { layoutId: savedLayout.ok ? savedLayout.data.id : "" });
    check(!stolenDelete.ok && stolenDelete.error.code === "NOT_FOUND" && (await prisma.dashboardLayout.count({ where: { teacherId: teacher.userId } })) === 2, "another teacher cannot delete someone else's layout");
    const classic = await dashboard.activateDashboardLayout(teacher, { layoutId: null });
    const afterClassic = await dashboard.getActiveLayout(teacher);
    check(classic.ok && afterClassic.ok && afterClassic.data.layout === null, "choosing Classic clears the active layout without deleting any");
    const layoutRemoved = await dashboard.deleteDashboardLayout(teacher, { layoutId: savedLayout.ok ? savedLayout.data.id : "" });
    check(layoutRemoved.ok && (await prisma.dashboardLayout.count({ where: { teacherId: teacher.userId } })) === 1, "a teacher deletes their own layout");

    // ----- AI-designed home page, against the real database -----
    const designTool = findTool("TEACHER", "proposeDashboardLayout");
    if (!designTool) throw new Error("Dashboard proposal tool is unavailable.");
    const layoutsBefore = await prisma.dashboardLayout.count({ where: { teacherId: teacher.userId } });
    const designed = await designTool.run(teacher, { name: "AI evening", theme: "sunset", motion: "lively", widgets: [{ type: "TODAY_SESSIONS" }, { type: "STUDENT_FOCUS", studentName: "Jordan" }] });
    check(designed.ok && designed.proposal?.type === "DASHBOARD_LAYOUT" && (await prisma.dashboardLayout.count({ where: { teacherId: teacher.userId } })) === layoutsBefore, "an AI layout proposal is stored without touching the layout table");
    const designedConfirm = await eduProposals.confirm(teacher, designed.proposal!.id);
    const designedRow = await prisma.dashboardLayout.findFirst({ where: { teacherId: teacher.userId, name: "AI evening" } });
    check(designedConfirm.ok && designedConfirm.data.status === "executed" && designedRow?.theme === "sunset" && (await dashboard.getActiveLayout(teacher)).ok, "confirming the proposal saves the layout and makes it active");
    const designedAgain = await eduProposals.confirm(teacher, designed.proposal!.id);
    check(!designedAgain.ok || designedAgain.data.status !== "executed" || (await prisma.dashboardLayout.count({ where: { teacherId: teacher.userId, name: "AI evening" } })) === 1, "confirming twice never saves a second copy");
    const otherConfirm = await eduProposals.confirm(otherTeacher, designed.proposal!.id);
    check(!otherConfirm.ok, "another teacher cannot confirm this proposal");
    const foreign = await designTool.run(otherTeacher, { name: "Mine", widgets: [{ type: "STUDENT_FOCUS", studentName: "Jordan" }] });
    check(!foreign.ok && !foreign.proposal, "another teacher cannot pin Jordan by name");
    const leftoverLayouts = await dashboard.listMyLayouts(teacher);
    if (leftoverLayouts.ok) for (const layout of leftoverLayouts.data.layouts) await dashboard.deleteDashboardLayout(teacher, { layoutId: layout.id });

    // ----- file upload into a unit -----
    const uploadUnit = await prisma.courseUnit.findFirst({ where: { courseId: course.id } });
    if (!uploadUnit) throw new Error("The demo course has no unit.");
    const enc = (text: string) => new TextEncoder().encode(text);
    const materialsBefore = await prisma.material.count({ where: { unitId: uploadUnit.id } });
    const uploaded = await addMaterialsFromFile(teacher, { unitId: uploadUnit.id, fileName: "slope_notes.txt", bytes: enc("The slope of a line is rise over run.") });
    check(uploaded.ok && uploaded.data.parts === 1 && (await prisma.material.count({ where: { unitId: uploadUnit.id } })) === materialsBefore + 1, "a teacher uploads a text file and gets one material");
    const uploadedRow = uploaded.ok ? await prisma.material.findUnique({ where: { id: uploaded.data.materialIds[0] } }) : null;
    check(uploadedRow?.title === "slope notes" && uploadedRow.kind === "TEXT" && uploadedRow.content === "The slope of a line is rise over run.", "the material takes its title from the file name and keeps only the text");
    const longText = Array.from({ length: 50 }, (_, i) => `Paragraph ${i + 1}. ${"Words about linear equations. ".repeat(30)}`).join("\n\n");
    const split = await addMaterialsFromFile(teacher, { unitId: uploadUnit.id, fileName: "long.md", title: "Long notes", bytes: enc(longText) });
    check(split.ok && split.data.parts > 1 && (await prisma.material.findMany({ where: { unitId: uploadUnit.id, title: { startsWith: "Long notes (part" } } })).length === split.data.parts, "a long file is split into numbered parts, all created together");
    const tooLong = await addMaterialsFromFile(teacher, { unitId: uploadUnit.id, fileName: "huge.txt", bytes: enc("Linear equations. ".repeat(7000)) });
    const countAfterHuge = await prisma.material.count({ where: { unitId: uploadUnit.id } });
    check(!tooLong.ok && tooLong.error.code === "VALIDATION" && countAfterHuge === (split.ok ? materialsBefore + 1 + split.data.parts : -1), "a file beyond the upload limit is refused and creates nothing");
    const foreignUpload = await addMaterialsFromFile(otherTeacher, { unitId: uploadUnit.id, fileName: "x.txt", bytes: enc("hello") });
    check(!foreignUpload.ok && foreignUpload.error.code === "FORBIDDEN" && (await prisma.material.count({ where: { unitId: uploadUnit.id } })) === countAfterHuge, "another teacher cannot upload into this unit");
    const studentUpload = await addMaterialsFromFile(jordan, { unitId: uploadUnit.id, fileName: "x.txt", bytes: enc("hello") });
    check(!studentUpload.ok && studentUpload.error.code === "FORBIDDEN", "a student cannot upload course materials");
    const missingUnit = await addMaterialsFromFile(teacher, { unitId: "no-such-unit", fileName: "x.txt", bytes: enc("hello") });
    check(!missingUnit.ok && missingUnit.error.code === "NOT_FOUND", "an unknown unit is reported as not found");
    const badType = await addMaterialsFromFile(teacher, { unitId: uploadUnit.id, fileName: "x.exe", bytes: enc("hello") });
    check(!badType.ok && badType.error.code === "VALIDATION", "an unsupported file type is refused");
    const strangerDelete = uploaded.ok ? await deleteMaterial(otherTeacher, { materialId: uploaded.data.materialIds[0] }) : undefined;
    check(!!strangerDelete && !strangerDelete.ok && strangerDelete.error.code === "NOT_FOUND" && !!(await prisma.material.findUnique({ where: { id: uploaded.ok ? uploaded.data.materialIds[0] : "" } })), "another teacher cannot delete this material");
    const studentDelete = uploaded.ok ? await deleteMaterial(jordan, { materialId: uploaded.data.materialIds[0] }) : undefined;
    check(!!studentDelete && !studentDelete.ok && studentDelete.error.code === "FORBIDDEN", "a student cannot delete a material");
    const ownDelete = uploaded.ok ? await deleteMaterial(teacher, { materialId: uploaded.data.materialIds[0] }) : undefined;
    check(!!ownDelete && ownDelete.ok && !(await prisma.material.findUnique({ where: { id: uploaded.ok ? uploaded.data.materialIds[0] : "" } })), "the teacher deletes their own material");

    // ----- quizzes -----
    const quizMaterial = await prisma.material.findFirst({ where: { unit: { courseId: course.id }, kind: "TEXT" } });
    if (!quizMaterial?.content) throw new Error("The demo course has no text material for a quiz.");
    const quote = quizMaterial.content.slice(0, 40);
    const quizInput = { courseId: course.id, title: "Real quiz", questions: [
      { type: "MULTIPLE_CHOICE" as const, difficulty: "EASY" as const, topic: "basics", prompt: "Pick the right one", options: ["right", "wrong", "other"], answer: "right", explanation: "Because.", sourceMaterialId: quizMaterial.id, sourceQuote: quote },
      { type: "TRUE_FALSE" as const, difficulty: "MEDIUM" as const, topic: "basics", prompt: "The sky is blue.", answer: "True", sourceMaterialId: quizMaterial.id, sourceQuote: quote },
      { type: "SHORT_ANSWER" as const, difficulty: "HARD" as const, topic: "basics", prompt: "Name a colour.", answer: "blue", sourceMaterialId: quizMaterial.id, sourceQuote: quote },
    ] };
    const quizDraft = await quizzes.createQuiz(teacher, quizInput);
    check(quizDraft.ok && quizDraft.data.questionCount === 3, "a teacher saves a quiz with its questions");
    const quizId = quizDraft.ok ? quizDraft.data.quizId : "";
    const keyView = await quizzes.listMyQuizzes(teacher, { courseId: course.id });
    check(keyView.ok && keyView.data.quizzes[0]?.published === false && keyView.data.quizzes[0].questions[0].answer === "right" && !!keyView.data.quizzes[0].questions[0].sourceTitle, "the teacher sees a draft quiz with the answer key and the source title");
    check((await quizzes.listMyQuizzes(otherTeacher)).ok && (await quizzes.listMyQuizzes(otherTeacher) as any).data.quizzes.length === 0, "another teacher sees no quizzes");
    check(!(await quizzes.createQuiz(otherTeacher, quizInput)).ok, "another teacher cannot save a quiz into this course");
    const wrongMaterial = await prisma.material.findFirst({ where: { unit: { course: { id: { not: course.id } } } } });
    check(!wrongMaterial || !(await quizzes.createQuiz(teacher, { ...quizInput, title: "Cross", questions: [{ ...quizInput.questions[0], sourceMaterialId: wrongMaterial.id }] })).ok, "a quiz cannot cite a material from another course");
    check(!(await quizzes.createQuiz(teacher, { ...quizInput, title: "Bad", questions: [{ ...quizInput.questions[0], answer: "not an option" }] })).ok, "a multiple-choice answer outside the options is refused");
    const draftToStudent = await quizzes.listStudentQuizzes(jordan);
    check(draftToStudent.ok && draftToStudent.data.quizzes.length === 0, "a student sees nothing while the quiz is a draft");
    check(!(await quizzes.checkQuizAnswers(jordan, { quizId, answers: [] })).ok, "a student cannot answer a draft quiz");
    check(!(await quizzes.setQuizPublished(otherTeacher, { quizId, published: true })).ok, "another teacher cannot publish this quiz");
    check(!(await quizzes.setQuizPublished(jordan, { quizId, published: true })).ok, "a student cannot publish a quiz");
    check((await quizzes.setQuizPublished(teacher, { quizId, published: true })).ok, "the teacher publishes the quiz");
    const quizStudentView = await quizzes.listStudentQuizzes(jordan);
    const studentQuestions = quizStudentView.ok ? quizStudentView.data.quizzes[0]?.questions ?? [] : [];
    check(quizStudentView.ok && studentQuestions.length === 3 && !JSON.stringify(quizStudentView.data).includes("explanation") && !JSON.stringify(quizStudentView.data).includes("sourceQuote") && !("answer" in (studentQuestions[0] ?? {})), "the student sees the questions with no answer, explanation or source");
    const samUser2 = await prisma.user.findUnique({ where: { email: "s+sam@example.test" } });
    const outsider = await prisma.user.findFirst({ where: { role: "STUDENT", enrollments: { none: { courseId: course.id } } } });
    check(!outsider || (await quizzes.listStudentQuizzes({ userId: outsider.id, role: "STUDENT" })) .ok && ((await quizzes.listStudentQuizzes({ userId: outsider.id, role: "STUDENT" })) as any).data.quizzes.length === 0, "a student who is not in the course sees no quiz");
    check(!outsider || !(await quizzes.checkQuizAnswers({ userId: outsider.id, role: "STUDENT" }, { quizId, answers: [] })).ok, "a student who is not in the course cannot answer it");
    check(!!samUser2, "the second enrolled student exists");
    const answers = studentQuestions.map((q) => ({ questionId: q.id, answer: q.type === "MULTIPLE_CHOICE" ? "right" : q.type === "TRUE_FALSE" ? "false" : "azure" }));
    const quizMarked = await quizzes.checkQuizAnswers(jordan, { quizId, answers });
    check(quizMarked.ok && quizMarked.data.graded === 2 && quizMarked.data.score === 1 && quizMarked.data.results.find((r) => r.correctAnswer === "blue")?.correct === null, "multiple choice and true/false are marked; short answers are left to the student");
    check(quizMarked.ok && quizMarked.data.results.every((r) => r.correctAnswer.length > 0), "the key and explanations come back only after answering");
    const blankMark = await quizzes.checkQuizAnswers(jordan, { quizId, answers: [] });
    check(blankMark.ok && blankMark.data.score === 0 && blankMark.data.graded === 2, "unanswered questions count as wrong");
    check(!(await quizzes.checkQuizAnswers(teacher, { quizId, answers: [] })).ok, "a teacher cannot use the student practice check");
    check((await quizzes.setQuizPublished(teacher, { quizId, published: false })).ok && (await quizzes.listStudentQuizzes(jordan) as any).data.quizzes.length === 0, "unpublishing hides the quiz from students again");
    check(!(await quizzes.deleteQuiz(otherTeacher, { quizId })).ok && !!(await prisma.quiz.findUnique({ where: { id: quizId } })), "another teacher cannot delete the quiz");
    check((await quizzes.deleteQuiz(teacher, { quizId })).ok && (await prisma.quizQuestion.count({ where: { quizId } })) === 0, "deleting a quiz removes its questions too");

    // ----- the AI writes a quiz against the real database -----
    process.env.AI_MOCK = "1";
    const quizTool = findTool("TEACHER", "proposeQuiz");
    if (!quizTool) throw new Error("Quiz tool is unavailable.");
    const { chatCompletion } = await import("../core/provider");
    const { eduMockModel } = await import("../domain/edu/mock-model");
    const written = await quizTool.run(teacher, { courseId: course.id, count: 4, title: "AI quiz" }, { complete: ((p: any, o: any) => chatCompletion(p, { mock: eduMockModel, ...o })) as any });
    const quizzesBefore = await prisma.quiz.count({ where: { courseId: course.id } });
    check(written.ok && written.proposal?.type === "QUIZ" && quizzesBefore === 0, "an AI quiz proposal is stored without creating a quiz");
    const writtenConfirm = await eduProposals.confirm(teacher, written.proposal!.id);
    const savedQuiz = await prisma.quiz.findFirst({ where: { courseId: course.id, title: "AI quiz" }, include: { questions: true } });
    check(writtenConfirm.ok && writtenConfirm.data.status === "executed" && savedQuiz?.published === false && savedQuiz.questions.length > 0 && savedQuiz.questions.every((q) => !!q.sourceQuote), "confirming saves a draft quiz whose questions all carry a source quote");
    await eduProposals.confirm(teacher, written.proposal!.id);
    check((await prisma.quiz.count({ where: { courseId: course.id, title: "AI quiz" } })) === 1, "confirming twice never saves a second quiz");
    check(!(await eduProposals.confirm(otherTeacher, written.proposal!.id)).ok, "another teacher cannot confirm this quiz proposal");
    delete process.env.AI_MOCK;
    if (savedQuiz) await quizzes.deleteQuiz(teacher, { quizId: savedQuiz.id });

    // ----- teaching knowledge (the simulated teacher knowledge base from the demo seed) -----
    const mine = await knowledge.listMyKnowledge(teacher);
    check(mine.ok && mine.data.entries.length >= 12 && mine.data.entries.some((e) => e.kind === "TEACHING_STYLE" && !e.courseId), "the demo teacher has a seeded knowledge base, including an all-courses teaching style");
    const theirs = await knowledge.listMyKnowledge(otherTeacher);
    check(theirs.ok && theirs.data.entries.length === 1 && !theirs.data.entries.some((e) => e.title.includes("balance")), "another teacher sees only their own notes");
    const forJordan = await knowledge.listKnowledgeForStudent(jordan);
    check(forJordan.ok && forJordan.data.entries.some((e) => e.title === "The balance method") && forJordan.data.entries.some((e) => e.title === "Speed and velocity") && !forJordan.data.entries.some((e) => e.kind === "TEACHING_STYLE"), "an enrolled student reads the notes of their courses, without teaching-style instructions");
    const forTutor = await knowledge.listKnowledgeForStudent(jordan, { includeStyle: true });
    check(forTutor.ok && forTutor.data.entries.some((e) => e.kind === "TEACHING_STYLE"), "the tutor can also read the teaching style");
    check(forJordan.ok && !forJordan.data.entries.some((e) => e.title.includes("thesis")), "a student never gets another teacher's notes");
    const kCasey = await prisma.user.findUnique({ where: { email: "s+casey@example.test" } });
    const forCasey = kCasey ? await knowledge.listKnowledgeForStudent({ userId: kCasey.id, role: "STUDENT" }) : undefined;
    check(!!forCasey && forCasey.ok && forCasey.data.entries.length === 1 && forCasey.data.entries[0].title.includes("thesis"), "a student in another course sees only their own teacher's notes");
    check(!(await knowledge.listKnowledgeForStudent(teacher)).ok && !(await knowledge.listMyKnowledge(jordan)).ok, "teachers and students cannot use each other's note readers");
    const memoryText = (await prisma.agentMemory.findMany({ select: { content: true } })).map((m) => m.content);
    check(forTutor.ok && memoryText.length > 0 && !JSON.stringify(forTutor.data).includes(memoryText[0]), "private student memory never appears among the notes a student or the tutor can read");
    const savedNote = await knowledge.saveKnowledgeEntry(teacher, { courseId: course.id, kind: "FAQ", title: "Test note", content: "Q: test? A: yes." });
    check(savedNote.ok && savedNote.data.courseName === course.name, "a teacher saves a note for their course");
    const noteId = savedNote.ok ? savedNote.data.id : "";
    check(!(await knowledge.saveKnowledgeEntry(otherTeacher, { id: noteId, kind: "FAQ", title: "Hijack", content: "x" })).ok, "another teacher cannot edit this note");
    check(!(await knowledge.saveKnowledgeEntry(otherTeacher, { courseId: course.id, kind: "FAQ", title: "Foreign", content: "x" })).ok, "another teacher cannot add a note to this course");
    check(!(await knowledge.saveKnowledgeEntry(jordan, { kind: "FAQ", title: "Student", content: "x" })).ok, "a student cannot write notes");
    check((await knowledge.saveKnowledgeEntry(teacher, { id: noteId, kind: "FAQ", title: "Test note v2", content: "Q: test? A: still yes." })).ok && (await prisma.knowledgeEntry.findUnique({ where: { id: noteId } }))?.title === "Test note v2", "a teacher edits their own note");
    check(!(await knowledge.saveKnowledgeEntries(teacher, { entries: [{ kind: "FAQ", title: "ok", content: "ok" }, { kind: "FAQ", title: "bad", content: "x", courseId: "no-such-course" }] })).ok && !(await prisma.knowledgeEntry.findFirst({ where: { title: "ok", teacherId: teacher.userId } })), "a batch with one bad note saves none of them");
    check(!(await knowledge.deleteKnowledgeEntry(otherTeacher, { entryId: noteId })).ok && (await knowledge.deleteKnowledgeEntry(teacher, { entryId: noteId })).ok, "only the author can delete a note");

    // ----- the AI saves notes and the student tutor teaches from them, against the real database -----
    process.env.AI_MOCK = "1";
    const { chatCompletion: realComplete } = await import("../core/provider");
    const { eduMockModel: mockModel } = await import("../domain/edu/mock-model");
    const complete = ((p: any, o: any) => realComplete(p, { mock: mockModel, ...o })) as any;
    const notesTool = findTool("TEACHER", "proposeKnowledge");
    const dictatedNotes = notesTool ? await notesTool.run(teacher, { entries: [{ kind: "KNOWLEDGE_POINT", title: "Parallel lines", content: "Two lines with equal slopes are parallel, so they never meet.", courseId: course.id }] }, { complete }) : undefined;
    const notesBefore = await prisma.knowledgeEntry.count({ where: { title: "Parallel lines" } });
    check(!!dictatedNotes?.ok && dictatedNotes.proposal?.type === "KNOWLEDGE" && notesBefore === 0, "an AI notes proposal is stored without saving any note");
    const notesConfirm = dictatedNotes?.proposal ? await eduProposals.confirm(teacher, dictatedNotes.proposal.id) : undefined;
    check(!!notesConfirm && notesConfirm.ok && notesConfirm.data.status === "executed" && (await prisma.knowledgeEntry.count({ where: { title: "Parallel lines" } })) === 1, "confirming saves the note");
    if (dictatedNotes?.proposal) await eduProposals.confirm(teacher, dictatedNotes.proposal.id);
    check((await prisma.knowledgeEntry.count({ where: { title: "Parallel lines" } })) === 1, "confirming twice never saves a second copy");
    check(!!dictatedNotes?.proposal && !(await eduProposals.confirm(otherTeacher, dictatedNotes.proposal.id)).ok, "another teacher cannot confirm this notes proposal");
    const tutorTool = findTool("STUDENT", "explainWithTeacherNotes");
    const lesson = tutorTool ? await tutorTool.run(jordan, { question: "Can you explain how the balance method works?" }, { complete }) : undefined;
    check(!!lesson?.finalReply && /subtract b from both sides|balanced scale|same operation on both sides/i.test(lesson.finalReply) && (lesson.citations ?? []).some((c) => c.title.startsWith("Key point")), "the tutor explains from the teacher's seeded notes and cites them");
    const nope = kCasey && tutorTool ? await tutorTool.run({ userId: kCasey.id, role: "STUDENT" }, { question: "Explain the balance method for equations" }, { complete }) : undefined;
    check(!!nope?.finalReply && /couldn't find/.test(nope.finalReply), "a student outside this teacher's courses cannot be taught from their notes");
    delete process.env.AI_MOCK;
    for (const leftover of await prisma.knowledgeEntry.findMany({ where: { title: "Parallel lines" }, select: { id: true } })) await knowledge.deleteKnowledgeEntry(teacher, { entryId: leftover.id });
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
