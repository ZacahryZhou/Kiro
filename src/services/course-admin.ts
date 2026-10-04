import {
  CancelSessionInput as CancelSessionInputSchema,
  CourseImpactInput as CourseImpactInputSchema,
  DeleteCourseInput as DeleteCourseInputSchema,
  DeleteSessionInput as DeleteSessionInputSchema,
  DeleteUnitInput as DeleteUnitInputSchema,
  RemoveStudentInput as RemoveStudentInputSchema,
  RenameUnitInput as RenameUnitInputSchema,
  UpdateCourseInput as UpdateCourseInputSchema,
  UpdateMaterialInput as UpdateMaterialInputSchema,
  UpdateSessionInput as UpdateSessionInputSchema,
  err,
  ok,
  type CancelSessionInput,
  type CourseImpactInput,
  type DeleteCourseInput,
  type DeleteSessionInput,
  type DeleteUnitInput,
  type RemoveStudentInput,
  type RenameUnitInput,
  type Result,
  type UpdateCourseInput,
  type UpdateMaterialInput,
  type UpdateSessionInput,
} from "@/contracts";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { checkConflicts } from "@/services/read";

// Changing and removing course content. Every function takes the signed-in actor first, returns a
// Result and never throws. A teacher can only touch their own courses; anything else is FORBIDDEN.

const onlyTeachers = (what: string) => err("FORBIDDEN", `Only teachers can ${what}.`);

/** The course, if it exists and the actor teaches it. */
async function ownCourse(actor: Actor, courseId: string): Promise<Result<{ id: string; name: string }>> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, teacherId: true } });
  if (!course) return err("NOT_FOUND", "Course not found.");
  if (course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this course.");
  return ok({ id: course.id, name: course.name });
}

export async function updateCourse(actor: Actor, input: UpdateCourseInput): Promise<Result<{ courseId: string }>> {
  if (actor.role !== "TEACHER") return onlyTeachers("edit courses");
  const parsed = UpdateCourseInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter valid course details.");
  const { courseId, ...changes } = parsed.data;
  if (Object.values(changes).every((value) => value === undefined)) return err("VALIDATION", "Change at least one field.");
  try {
    const course = await ownCourse(actor, courseId);
    if (!course.ok) return course;
    await prisma.course.update({
      where: { id: courseId },
      data: {
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.subject !== undefined ? { subject: changes.subject } : {}),
        ...(changes.type !== undefined ? { type: changes.type } : {}),
        ...(changes.location !== undefined ? { location: changes.location || null } : {}),
        ...(changes.description !== undefined ? { description: changes.description || null } : {}),
        ...(changes.pricePerSessionCents !== undefined ? { pricePerSessionCents: changes.pricePerSessionCents } : {}),
      },
    });
    return ok({ courseId });
  } catch {
    return err("INTERNAL", "Could not save the course. Please try again.");
  }
}

export type CourseImpact = {
  courseName: string;
  students: number;
  sessions: number;
  attendanceRecords: number;
  deductions: number;
  progressRecords: number;
  units: number;
  materials: number;
  quizzes: number;
  knowledgeEntries: number;
  conversations: number;
};

/** What deleting a course would remove, so the teacher can see it before confirming. */
export async function getCourseImpact(actor: Actor, input: CourseImpactInput): Promise<Result<CourseImpact>> {
  if (actor.role !== "TEACHER") return onlyTeachers("manage courses");
  const parsed = CourseImpactInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a course.");
  try {
    const course = await ownCourse(actor, parsed.data.courseId);
    if (!course.ok) return course;
    const courseId = course.data.id;
    const [students, sessions, attendanceRecords, deductions, progressRecords, units, materials, quizzes, knowledgeEntries, conversations] = await Promise.all([
      prisma.enrollment.count({ where: { courseId } }),
      prisma.session.count({ where: { courseId } }),
      prisma.attendance.count({ where: { session: { courseId } } }),
      prisma.deduction.count({ where: { courseId } }),
      prisma.progressRecord.count({ where: { session: { courseId } } }),
      prisma.courseUnit.count({ where: { courseId } }),
      prisma.material.count({ where: { unit: { courseId } } }),
      prisma.quiz.count({ where: { courseId } }),
      prisma.knowledgeEntry.count({ where: { courseId } }),
      prisma.agentConversation.count({ where: { courseId } }),
    ]);
    return ok({ courseName: course.data.name, students, sessions, attendanceRecords, deductions, progressRecords, units, materials, quizzes, knowledgeEntries, conversations });
  } catch {
    return err("INTERNAL", "Could not check the course. Please try again.");
  }
}

/** Case and surrounding spaces do not matter when typing a name to confirm. */
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Deletes a course and everything inside it, all or nothing. The teacher must type the course name,
 * and the database refuses to leave anything behind that points at the course.
 */
export async function deleteCourse(actor: Actor, input: DeleteCourseInput): Promise<Result<{ deleted: true; courseName: string }>> {
  if (actor.role !== "TEACHER") return onlyTeachers("delete courses");
  const parsed = DeleteCourseInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a course and type its name to confirm.");
  try {
    const course = await ownCourse(actor, parsed.data.courseId);
    if (!course.ok) return course;
    if (!sameName(parsed.data.confirmName, course.data.name)) {
      return err("VALIDATION", "The name you typed does not match this course, so nothing was deleted.");
    }
    const courseId = course.data.id;
    await prisma.$transaction(async (tx) => {
      await tx.agentProposal.deleteMany({ where: { courseId } });
      await tx.agentMemory.deleteMany({ where: { courseId } });
      await tx.studentRequest.deleteMany({ where: { session: { courseId } } });
      await tx.progressRecord.deleteMany({ where: { session: { courseId } } });
      await tx.deduction.deleteMany({ where: { courseId } });
      await tx.attendance.deleteMany({ where: { session: { courseId } } });
      await tx.sessionChange.deleteMany({ where: { session: { courseId } } });
      await tx.session.deleteMany({ where: { courseId } });
      await tx.material.deleteMany({ where: { unit: { courseId } } });
      await tx.courseUnit.deleteMany({ where: { courseId } });
      await tx.enrollment.deleteMany({ where: { courseId } });
      // Quizzes, teaching notes and chats about this course go with it (cascade).
      await tx.course.delete({ where: { id: courseId } });
    });
    return ok({ deleted: true, courseName: course.data.name });
  } catch {
    return err("INTERNAL", "Could not delete the course. Nothing was deleted. Please try again.");
  }
}

/** A unit the actor teaches (through its course). */
async function ownUnit(actor: Actor, unitId: string): Promise<Result<{ id: string; courseId: string }>> {
  const unit = await prisma.courseUnit.findUnique({ where: { id: unitId }, select: { id: true, courseId: true, course: { select: { teacherId: true } } } });
  if (!unit) return err("NOT_FOUND", "Course unit not found.");
  if (unit.course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this course unit.");
  return ok({ id: unit.id, courseId: unit.courseId });
}

export async function renameUnit(actor: Actor, input: RenameUnitInput): Promise<Result<{ unitId: string; courseId: string }>> {
  if (actor.role !== "TEACHER") return onlyTeachers("rename units");
  const parsed = RenameUnitInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter a unit title of 1 to 80 characters.");
  try {
    const unit = await ownUnit(actor, parsed.data.unitId);
    if (!unit.ok) return unit;
    await prisma.courseUnit.update({ where: { id: unit.data.id }, data: { title: parsed.data.title } });
    return ok({ unitId: unit.data.id, courseId: unit.data.courseId });
  } catch {
    return err("INTERNAL", "Could not rename the unit. Please try again.");
  }
}

/** Removes a unit and the materials in it. Students lose access to them immediately. */
export async function deleteUnit(actor: Actor, input: DeleteUnitInput): Promise<Result<{ deleted: true; courseId: string; materialsRemoved: number }>> {
  if (actor.role !== "TEACHER") return onlyTeachers("delete units");
  const parsed = DeleteUnitInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a unit.");
  try {
    const unit = await ownUnit(actor, parsed.data.unitId);
    if (!unit.ok) return unit;
    const materialsRemoved = await prisma.$transaction(async (tx) => {
      const removed = await tx.material.deleteMany({ where: { unitId: unit.data.id } });
      await tx.courseUnit.delete({ where: { id: unit.data.id } });
      return removed.count;
    });
    return ok({ deleted: true, courseId: unit.data.courseId, materialsRemoved });
  } catch {
    return err("INTERNAL", "Could not delete the unit. Please try again.");
  }
}

/** Edits a material's title and its text or link. The kind (text or link) cannot change. */
export async function updateMaterial(actor: Actor, input: UpdateMaterialInput): Promise<Result<{ materialId: string; courseId: string }>> {
  if (actor.role !== "TEACHER") return onlyTeachers("edit course materials");
  const parsed = UpdateMaterialInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter valid material details.");
  const { materialId, title, content, url } = parsed.data;
  if (title === undefined && content === undefined && url === undefined) return err("VALIDATION", "Change at least one field.");
  try {
    const material = await prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, kind: true, unit: { select: { courseId: true, course: { select: { teacherId: true } } } } },
    });
    if (!material) return err("NOT_FOUND", "That material was not found.");
    if (material.unit.course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this material.");
    if (material.kind === "TEXT" && url !== undefined) return err("VALIDATION", "A text material has no link.");
    if (material.kind === "LINK" && content !== undefined) return err("VALIDATION", "A link material has no text.");
    if (material.kind === "TEXT" && content !== undefined && !content.trim()) return err("VALIDATION", "The text cannot be empty.");
    await prisma.material.update({
      where: { id: material.id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(url !== undefined ? { url } : {}),
      },
    });
    return ok({ materialId: material.id, courseId: material.unit.courseId });
  } catch {
    return err("INTERNAL", "Could not save the material. Please try again.");
  }
}

const sessionSelect = {
  id: true,
  courseId: true,
  startAt: true,
  durationMin: true,
  status: true,
  course: { select: { teacherId: true } },
  _count: { select: { attendance: true, deductions: true, progressRecords: true } },
} as const;

async function ownSession(actor: Actor, sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: sessionSelect });
  if (!session) return err("NOT_FOUND", "Session not found.");
  if (session.course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this session.");
  return ok(session);
}

/** Marks an upcoming session as cancelled. It stays on the record, and students see it as cancelled. */
export async function cancelSession(actor: Actor, input: CancelSessionInput): Promise<Result<{ sessionId: string; courseId: string }>> {
  if (actor.role !== "TEACHER") return onlyTeachers("cancel sessions");
  const parsed = CancelSessionInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a session.");
  try {
    const loaded = await ownSession(actor, parsed.data.sessionId);
    if (!loaded.ok) return loaded;
    const session = loaded.data;
    if (session.status !== "SCHEDULED" && session.status !== "RESCHEDULED") return err("CONFLICT", "Only scheduled sessions can be cancelled.");
    if (session._count.attendance > 0) return err("CONFLICT", "Attendance was already saved for this session, so it cannot be cancelled.");
    return await prisma.$transaction(async (tx) => {
      const changed = await tx.session.updateMany({ where: { id: session.id, status: session.status }, data: { status: "CANCELLED" } });
      if (changed.count === 0) return err("CONFLICT", "This session changed while it was being cancelled. Please try again.");
      await tx.sessionChange.create({
        data: { sessionId: session.id, changedById: actor.userId, fromStatus: session.status, toStatus: "CANCELLED", oldStartAt: session.startAt },
      });
      return ok({ sessionId: session.id, courseId: session.courseId });
    });
  } catch {
    return err("INTERNAL", "Could not cancel the session. Please try again.");
  }
}

/**
 * Removes a session from the calendar for good. Only possible while nothing has been recorded for it
 * (no attendance, deductions or progress); otherwise the teacher should cancel it instead.
 */
export async function deleteSession(actor: Actor, input: DeleteSessionInput): Promise<Result<{ deleted: true; courseId: string }>> {
  if (actor.role !== "TEACHER") return onlyTeachers("delete sessions");
  const parsed = DeleteSessionInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a session.");
  try {
    const loaded = await ownSession(actor, parsed.data.sessionId);
    if (!loaded.ok) return loaded;
    const session = loaded.data;
    const { attendance, deductions, progressRecords } = session._count;
    if (attendance + deductions + progressRecords > 0) {
      return err("CONFLICT", "This session already has attendance or progress records, so it cannot be deleted. Cancel it instead to keep the records.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.studentRequest.deleteMany({ where: { sessionId: session.id } });
      await tx.sessionChange.deleteMany({ where: { sessionId: session.id } });
      await tx.session.delete({ where: { id: session.id } });
    });
    return ok({ deleted: true, courseId: session.courseId });
  } catch {
    return err("INTERNAL", "Could not delete the session. Please try again.");
  }
}

/** Changes how long a session is, where it is, or its meeting link. The time itself changes by rescheduling. */
export async function updateSession(actor: Actor, input: UpdateSessionInput): Promise<Result<{ sessionId: string; courseId: string }>> {
  if (actor.role !== "TEACHER") return onlyTeachers("edit sessions");
  const parsed = UpdateSessionInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter a valid length (15 to 480 minutes), place or link.");
  const { sessionId, durationMin, location, linkUrl } = parsed.data;
  if (durationMin === undefined && location === undefined && linkUrl === undefined) return err("VALIDATION", "Change at least one field.");
  try {
    const loaded = await ownSession(actor, sessionId);
    if (!loaded.ok) return loaded;
    const session = loaded.data;
    if (session.status !== "SCHEDULED" && session.status !== "RESCHEDULED") return err("CONFLICT", "Only upcoming sessions can be edited.");
    if (durationMin !== undefined && durationMin !== session.durationMin) {
      const conflicts = await checkConflicts(actor, { courseId: session.courseId, startAt: session.startAt.toISOString(), durationMin, excludeSessionId: session.id });
      if (!conflicts.ok) return conflicts;
      if (conflicts.data.conflicts.length > 0) return err("CONFLICT", "That length would overlap another scheduled session.", conflicts.data.conflicts);
    }
    await prisma.session.update({
      where: { id: session.id },
      data: {
        ...(durationMin !== undefined ? { durationMin } : {}),
        ...(location !== undefined ? { location: location || null } : {}),
        ...(linkUrl !== undefined ? { linkUrl } : {}),
      },
    });
    return ok({ sessionId: session.id, courseId: session.courseId });
  } catch {
    return err("INTERNAL", "Could not save the session. Please try again.");
  }
}

export type RemovedStudent = { removed: true; keptAttendance: number; keptDeductions: number; keptProgress: number };

/**
 * Takes a student out of a course. Their attendance, deductions and progress stay on the teacher's
 * record; their open requests and the teacher's private notes about them in this course are removed.
 */
export async function removeStudentFromCourse(actor: Actor, input: RemoveStudentInput): Promise<Result<RemovedStudent>> {
  if (actor.role !== "TEACHER") return onlyTeachers("remove students from courses");
  const parsed = RemoveStudentInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a course and a student.");
  const { courseId, studentId } = parsed.data;
  try {
    const course = await ownCourse(actor, courseId);
    if (!course.ok) return course;
    const enrollment = await prisma.enrollment.findUnique({ where: { courseId_studentId: { courseId, studentId } }, select: { id: true } });
    if (!enrollment) return err("NOT_FOUND", "That student is not enrolled in this course.");
    const [keptAttendance, keptDeductions, keptProgress] = await Promise.all([
      prisma.attendance.count({ where: { studentId, session: { courseId } } }),
      prisma.deduction.count({ where: { studentId, courseId } }),
      prisma.progressRecord.count({ where: { studentId, session: { courseId } } }),
    ]);
    await prisma.$transaction([
      prisma.studentRequest.deleteMany({ where: { studentId, status: "PENDING", session: { courseId } } }),
      prisma.agentMemory.deleteMany({ where: { studentId, courseId } }),
      prisma.enrollment.delete({ where: { id: enrollment.id } }),
    ]);
    return ok({ removed: true, keptAttendance, keptDeductions, keptProgress });
  } catch {
    return err("INTERNAL", "Could not remove the student. Please try again.");
  }
}

export type EditableCourse = {
  courseId: string;
  name: string;
  subject: string;
  type: "ONE_ON_ONE" | "SMALL_CLASS";
  location: string;
  description: string;
  pricePerSessionCents: number;
};

/** The fields of one of the teacher's courses as the edit form needs them (including the price). */
export async function getCourseForEdit(actor: Actor, input: CourseImpactInput): Promise<Result<EditableCourse>> {
  if (actor.role !== "TEACHER") return onlyTeachers("edit courses");
  const parsed = CourseImpactInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a course.");
  try {
    const course = await prisma.course.findUnique({ where: { id: parsed.data.courseId } });
    if (!course) return err("NOT_FOUND", "Course not found.");
    if (course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this course.");
    return ok({
      courseId: course.id,
      name: course.name,
      subject: course.subject,
      type: course.type,
      location: course.location ?? "",
      description: course.description ?? "",
      pricePerSessionCents: course.pricePerSessionCents,
    });
  } catch {
    return err("INTERNAL", "Could not load the course. Please try again.");
  }
}
