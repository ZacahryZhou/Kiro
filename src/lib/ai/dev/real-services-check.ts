// Application-runtime smoke check. Run against an isolated migrated development database:
// NODE_ENV=development npx tsx src/lib/ai/dev/real-services-check.ts
import { prisma } from "@/lib/db/prisma";
import { findTool } from "../domain/edu/tools";
import { eduProposals } from "../domain/edu/proposal-types";
import * as services from "../services";
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

  let createdUnitId: string | undefined;
  let createdMemoryId: string | undefined;
  const createdSessionIds: string[] = [];
  const smokeProposalIds: string[] = [];
  const smokeSessionId = "kora-ai-session-real-check";
  let assertions = 0;
  const check = (condition: boolean, description: string) => {
    if (!condition) throw new Error(`FAIL: ${description}`);
    assertions += 1;
    console.info(`PASS ${description}`);
  };
  try {
    await prisma.deduction.deleteMany({ where: { sessionId: smokeSessionId } });
    await prisma.attendance.deleteMany({ where: { sessionId: smokeSessionId } });
    await prisma.sessionChange.deleteMany({ where: { sessionId: smokeSessionId } });
    await prisma.session.deleteMany({ where: { id: smokeSessionId } });
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
    createdUnitId = unitId;
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
    await prisma.session.create({ data: { id: smokeSessionId, courseId: course.id, startAt: sessionTime, durationMin: 60, status: "SCHEDULED" } });
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
  } finally {
    if (createdUnitId) {
      await prisma.material.deleteMany({ where: { unitId: createdUnitId } });
      await prisma.courseUnit.deleteMany({ where: { id: createdUnitId } });
    }
    await prisma.deduction.deleteMany({ where: { sessionId: smokeSessionId } });
    await prisma.attendance.deleteMany({ where: { sessionId: smokeSessionId } });
    await prisma.sessionChange.deleteMany({ where: { sessionId: smokeSessionId } });
    await prisma.session.deleteMany({ where: { id: smokeSessionId } });
    if (createdSessionIds.length > 0) await prisma.session.deleteMany({ where: { id: { in: createdSessionIds } } });
    if (createdMemoryId) await prisma.agentMemory.deleteMany({ where: { id: createdMemoryId } });
    if (smokeProposalIds.length > 0) await prisma.agentProposal.deleteMany({ where: { id: { in: smokeProposalIds } } });
    await prisma.$disconnect();
  }
  console.info(`All ${assertions} real-service checks passed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Real-service acceptance check failed.");
  process.exitCode = 1;
});
