// Course management against the real database: edit, delete, units, materials, sessions, students.
// Run against an isolated migrated development database after `npm run db:seed:demo`:
//   NODE_ENV=development npx tsx src/lib/ai/dev/course-admin-real-check.ts
import { prisma } from "@/lib/db/prisma";
import { seedFixtures } from "../../../../prisma/seed-ai";
import * as admin from "@/services/course-admin";
import * as coreRead from "@/services/read";
import * as coreWrite from "@/services/write";
import type { Actor } from "@/contracts";

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.info("SKIP course admin check (run with NODE_ENV=development against an isolated database).");
    await prisma.$disconnect();
    return;
  }
  const users = {
    teacher: await prisma.user.findUnique({ where: { email: "t+alex@example.test" } }),
    other: await prisma.user.findUnique({ where: { email: "t+taylor@example.test" } }),
    jordan: await prisma.user.findUnique({ where: { email: "s+jordan@example.test" } }),
    sam: await prisma.user.findUnique({ where: { email: "s+sam@example.test" } }),
  };
  if (!users.teacher || !users.other || !users.jordan || !users.sam) throw new Error("Run npm run db:seed:demo first.");
  const teacher: Actor = { userId: users.teacher.id, role: "TEACHER" };
  const other: Actor = { userId: users.other.id, role: "TEACHER" };
  const jordan: Actor = { userId: users.jordan.id, role: "STUDENT" };

  let assertions = 0;
  const check = (condition: boolean, description: string) => {
    if (!condition) throw new Error(`FAIL: ${description}`);
    assertions += 1;
    console.info(`PASS ${description}`);
  };
  const code = (result: { ok: boolean; error?: { code: string } }) => (result.ok ? "OK" : result.error?.code);

  try {
    await seedFixtures(prisma, { reset: true });

    // ----- edit a course -----
    const created = await coreWrite.createCourse(teacher, { name: "Admin Check Course", subject: "Testing", type: "SMALL_CLASS", location: "Room 1", description: "First", pricePerSessionCents: 4000 });
    if (!created.ok) throw new Error("Could not create the check course.");
    const courseId = created.data.courseId;
    check((await admin.updateCourse(teacher, { courseId, name: "Admin Check Course 2", pricePerSessionCents: 5500, location: null })).ok, "a teacher edits their own course");
    const edited = await prisma.course.findUnique({ where: { id: courseId } });
    check(edited?.name === "Admin Check Course 2" && edited.pricePerSessionCents === 5500 && edited.location === null && edited.subject === "Testing", "only the changed fields change and null clears the location");
    check(code(await admin.updateCourse(teacher, { courseId })) === "VALIDATION", "an edit with no changes is refused");
    check(code(await admin.updateCourse(teacher, { courseId, name: "   " })) === "VALIDATION", "a blank name is refused");
    check(code(await admin.updateCourse(other, { courseId, name: "Hijacked" })) === "FORBIDDEN", "another teacher cannot edit the course");
    check(code(await admin.updateCourse(jordan, { courseId, name: "Hijacked" })) === "FORBIDDEN", "a student cannot edit a course");
    check(code(await admin.updateCourse(teacher, { courseId: "no-such-course", name: "x" })) === "NOT_FOUND", "editing an unknown course is NOT_FOUND");
    const form = await admin.getCourseForEdit(teacher, { courseId });
    check(form.ok && form.data.pricePerSessionCents === 5500 && form.data.location === "", "the edit form data includes the price and empty text as empty strings");
    check(code(await admin.getCourseForEdit(other, { courseId })) === "FORBIDDEN", "another teacher cannot load the edit form data");

    // ----- units and materials -----
    const unit = await coreWrite.createCourseUnit(teacher, { courseId, title: "Unit A" });
    if (!unit.ok) throw new Error("Could not create a unit.");
    const text = await coreWrite.addMaterial(teacher, { unitId: unit.data.unitId, title: "Notes", kind: "TEXT", content: "Original text." });
    const link = await coreWrite.addMaterial(teacher, { unitId: unit.data.unitId, title: "Site", kind: "LINK", url: "https://example.com/a" });
    if (!text.ok || !link.ok) throw new Error("Could not create materials.");
    check((await admin.renameUnit(teacher, { unitId: unit.data.unitId, title: "Unit A renamed" })).ok && (await prisma.courseUnit.findUnique({ where: { id: unit.data.unitId } }))?.title === "Unit A renamed", "a teacher renames a unit");
    check(code(await admin.renameUnit(other, { unitId: unit.data.unitId, title: "x" })) === "FORBIDDEN", "another teacher cannot rename the unit");
    check((await admin.updateMaterial(teacher, { materialId: text.data.materialId, title: "Notes v2", content: "Edited text." })).ok && (await prisma.material.findUnique({ where: { id: text.data.materialId } }))?.content === "Edited text.", "a teacher edits a text material");
    check((await admin.updateMaterial(teacher, { materialId: link.data.materialId, url: "https://example.com/b" })).ok && (await prisma.material.findUnique({ where: { id: link.data.materialId } }))?.url === "https://example.com/b", "a teacher edits a link material");
    check(code(await admin.updateMaterial(teacher, { materialId: text.data.materialId, url: "https://example.com/c" })) === "VALIDATION", "a text material cannot get a link");
    check(code(await admin.updateMaterial(teacher, { materialId: link.data.materialId, content: "text" })) === "VALIDATION", "a link material cannot get text");
    check(code(await admin.updateMaterial(teacher, { materialId: text.data.materialId, content: "   " })) === "VALIDATION", "a text material cannot be emptied");
    check(code(await admin.updateMaterial(other, { materialId: text.data.materialId, title: "x" })) === "FORBIDDEN", "another teacher cannot edit the material");
    const unitToDrop = await coreWrite.createCourseUnit(teacher, { courseId, title: "Unit B" });
    if (!unitToDrop.ok) throw new Error("Could not create the second unit.");
    await coreWrite.addMaterial(teacher, { unitId: unitToDrop.data.unitId, title: "Gone soon", kind: "TEXT", content: "Bye." });
    check(code(await admin.deleteUnit(other, { unitId: unitToDrop.data.unitId })) === "FORBIDDEN", "another teacher cannot delete the unit");
    const dropped = await admin.deleteUnit(teacher, { unitId: unitToDrop.data.unitId });
    check(dropped.ok && dropped.data.materialsRemoved === 1 && !(await prisma.courseUnit.findUnique({ where: { id: unitToDrop.data.unitId } })) && (await prisma.material.count({ where: { unitId: unitToDrop.data.unitId } })) === 0, "deleting a unit removes its materials");

    // ----- students and sessions -----
    check((await coreWrite.addExistingStudentToCourse(teacher, { courseId, email: "s+jordan@example.test" })).ok && (await coreWrite.addExistingStudentToCourse(teacher, { courseId, email: "s+sam@example.test" })).ok, "two students are enrolled");
    const day = (n: number) => new Date(Date.UTC(2031, 0, 6 + n, 17, 0)).toISOString();
    const made = await coreWrite.createSessions(teacher, { courseId, sessions: [0, 1, 2, 3].map((n) => ({ startAt: day(n), durationMin: 60 })) });
    if (!made.ok) throw new Error("Could not create sessions.");
    const [s0, s1, s2, s3] = made.data.sessionIds;
    check((await admin.updateSession(teacher, { sessionId: s0, durationMin: 90, location: "Room 2", linkUrl: "https://example.com/meet" })).ok, "a teacher edits a session's length, place and link");
    const s0row = await prisma.session.findUnique({ where: { id: s0 } });
    check(s0row?.durationMin === 90 && s0row.location === "Room 2" && s0row.linkUrl === "https://example.com/meet", "the session details are saved");
    check(code(await admin.updateSession(teacher, { sessionId: s0, durationMin: 5 })) === "VALIDATION", "a too-short session length is refused");
    check(code(await admin.updateSession(teacher, { sessionId: s0 })) === "VALIDATION", "a session edit with no changes is refused");
    check(code(await admin.updateSession(other, { sessionId: s0, location: "x" })) === "FORBIDDEN", "another teacher cannot edit the session");
    check((await admin.updateSession(teacher, { sessionId: s0, location: null, linkUrl: null })).ok && (await prisma.session.findUnique({ where: { id: s0 } }))?.location === null, "null clears the place and link");

    check(code(await admin.cancelSession(other, { sessionId: s1 })) === "FORBIDDEN", "another teacher cannot cancel the session");
    check((await admin.cancelSession(teacher, { sessionId: s1 })).ok && (await prisma.session.findUnique({ where: { id: s1 } }))?.status === "CANCELLED", "a teacher cancels an upcoming session");
    check((await prisma.sessionChange.count({ where: { sessionId: s1, toStatus: "CANCELLED" } })) === 1, "the cancellation is written to the session history");
    check(code(await admin.cancelSession(teacher, { sessionId: s1 })) === "CONFLICT", "a cancelled session cannot be cancelled again");
    check(code(await admin.updateSession(teacher, { sessionId: s1, location: "x" })) === "CONFLICT", "a cancelled session cannot be edited");
    const calendar = await coreRead.getTeacherSchedule(teacher, { from: "2031-01-01T00:00:00.000Z", to: "2031-02-01T00:00:00.000Z", courseId });
    check(calendar.ok && calendar.data.sessions.find((x) => x.id === s1)?.status === "CANCELLED", "the schedule shows the session as cancelled");

    // Something recorded for s2 makes it permanent.
    await prisma.attendance.create({ data: { sessionId: s2, studentId: jordan.userId, status: "PRESENT", markedById: teacher.userId } });
    check(code(await admin.deleteSession(teacher, { sessionId: s2 })) === "CONFLICT", "a session with attendance cannot be deleted");
    check(code(await admin.cancelSession(teacher, { sessionId: s2 })) === "CONFLICT", "a session with attendance cannot be cancelled");
    check(code(await admin.deleteSession(other, { sessionId: s3 })) === "FORBIDDEN", "another teacher cannot delete the session");
    await prisma.studentRequest.create({ data: { sessionId: s3, studentId: jordan.userId, kind: "LEAVE" } });
    check((await admin.deleteSession(teacher, { sessionId: s3 })).ok && !(await prisma.session.findUnique({ where: { id: s3 } })) && (await prisma.studentRequest.count({ where: { sessionId: s3 } })) === 0, "an empty session is deleted together with its open requests");

    // ----- removing a student keeps the records -----
    await prisma.agentMemory.create({ data: { courseId, studentId: users.sam.id, teacherId: teacher.userId, kind: "NOTE", content: "Prefers mornings." } });
    await prisma.studentRequest.create({ data: { sessionId: s0, studentId: users.sam.id, kind: "LEAVE" } });
    check(code(await admin.removeStudentFromCourse(other, { courseId, studentId: users.sam.id })) === "FORBIDDEN", "another teacher cannot remove a student");
    const removed = await admin.removeStudentFromCourse(teacher, { courseId, studentId: users.sam.id });
    check(removed.ok && !(await prisma.enrollment.findUnique({ where: { courseId_studentId: { courseId, studentId: users.sam.id } } })), "a teacher removes a student");
    check((await prisma.agentMemory.count({ where: { courseId, studentId: users.sam.id } })) === 0 && (await prisma.studentRequest.count({ where: { sessionId: s0, studentId: users.sam.id } })) === 0, "the removed student's open requests and private notes go with the enrollment");
    check(code(await admin.removeStudentFromCourse(teacher, { courseId, studentId: users.sam.id })) === "NOT_FOUND", "removing a student who is not enrolled is NOT_FOUND");
    const stillThere = await admin.removeStudentFromCourse(teacher, { courseId, studentId: jordan.userId });
    check(stillThere.ok && stillThere.data.keptAttendance === 1 && (await prisma.attendance.count({ where: { sessionId: s2, studentId: jordan.userId } })) === 1, "removing a student keeps their attendance record");
    check(!(await coreRead.getStudentWorkspace(jordan, { from: "2031-01-01T00:00:00.000Z", to: "2031-02-01T00:00:00.000Z" }).then((r) => r.ok && r.data.courses.some((c) => c.id === courseId))), "a removed student no longer sees the course");
    await coreWrite.addExistingStudentToCourse(teacher, { courseId, email: "s+jordan@example.test" });

    // ----- deleting the whole course -----
    await prisma.deduction.create({ data: { sessionId: s2, studentId: jordan.userId, courseId, amountCents: 5500, reason: "PRESENT" } });
    await prisma.progressRecord.create({ data: { sessionId: s2, studentId: jordan.userId, teacherId: teacher.userId, goal: "g", output: "o", nextAction: "PRACTICE" } });
    await prisma.quiz.create({ data: { courseId, title: "Check quiz" } });
    await prisma.knowledgeEntry.create({ data: { teacherId: teacher.userId, courseId, kind: "FAQ", title: "Check note", content: "Q: ? A: yes." } });
    const chat = await prisma.agentConversation.create({ data: { actorId: teacher.userId, courseId, title: "Course chat" } });
    await prisma.agentMessage.create({ data: { conversationId: chat.id, role: "user", content: "hello" } });
    await prisma.agentProposal.create({ data: { type: "ADD_CONTENT", actorId: teacher.userId, courseId, payload: {}, summary: "Check proposal" } });
    await prisma.agentMemory.create({ data: { courseId, studentId: jordan.userId, teacherId: teacher.userId, kind: "NOTE", content: "Check memory." } });

    const impact = await admin.getCourseImpact(teacher, { courseId });
    check(impact.ok && impact.data.students === 1 && impact.data.sessions === 3 && impact.data.attendanceRecords === 1 && impact.data.deductions === 1 && impact.data.progressRecords === 1 && impact.data.units === 1 && impact.data.materials === 2 && impact.data.quizzes === 1 && impact.data.knowledgeEntries === 1 && impact.data.conversations === 1, "the deletion preview counts everything that would go");
    check(code(await admin.getCourseImpact(other, { courseId })) === "FORBIDDEN", "another teacher cannot preview the deletion");
    check(code(await admin.deleteCourse(teacher, { courseId, confirmName: "wrong name" })) === "VALIDATION" && !!(await prisma.course.findUnique({ where: { id: courseId } })), "a wrong confirmation name deletes nothing");
    check(code(await admin.deleteCourse(other, { courseId, confirmName: "Admin Check Course 2" })) === "FORBIDDEN" && !!(await prisma.course.findUnique({ where: { id: courseId } })), "another teacher cannot delete the course even with the right name");
    check(code(await admin.deleteCourse(jordan, { courseId, confirmName: "Admin Check Course 2" })) === "FORBIDDEN", "a student cannot delete a course");
    const deleted = await admin.deleteCourse(teacher, { courseId, confirmName: "  admin check course 2 " });
    check(deleted.ok, "the right name (any case) deletes the course");
    const left = await Promise.all([
      prisma.course.count({ where: { id: courseId } }),
      prisma.session.count({ where: { courseId } }),
      prisma.enrollment.count({ where: { courseId } }),
      prisma.courseUnit.count({ where: { courseId } }),
      prisma.material.count({ where: { unit: { courseId } } }),
      prisma.attendance.count({ where: { session: { courseId } } }),
      prisma.deduction.count({ where: { courseId } }),
      prisma.progressRecord.count({ where: { session: { courseId } } }),
      prisma.quiz.count({ where: { courseId } }),
      prisma.knowledgeEntry.count({ where: { courseId } }),
      prisma.agentConversation.count({ where: { courseId } }),
      prisma.agentMessage.count({ where: { conversationId: chat.id } }),
      prisma.agentProposal.count({ where: { courseId } }),
      prisma.agentMemory.count({ where: { courseId } }),
    ]);
    check(left.every((n) => n === 0), "nothing about the deleted course is left behind");
    check(!!(await prisma.user.findUnique({ where: { id: jordan.userId } })) && !!(await prisma.course.findUnique({ where: { id: "kora-ai-course-math" } })), "deleting a course leaves students and other courses alone");
    check(code(await admin.deleteCourse(teacher, { courseId, confirmName: "Admin Check Course 2" })) === "NOT_FOUND", "deleting it again is NOT_FOUND");
  } finally {
    await seedFixtures(prisma, { reset: true });
    await prisma.$disconnect();
  }
  console.info(`All ${assertions} course admin checks passed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Course admin check failed.");
  process.exitCode = 1;
});
