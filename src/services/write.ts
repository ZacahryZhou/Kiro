import { Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import {
  AddStudentInput as AddStudentInputSchema,
  AddMaterialInput as AddMaterialInputSchema,
  CreateUnitInput as CreateUnitInputSchema,
  CreateCourseInput as CreateCourseInputSchema,
  CreateSessionsInput as CreateSessionsInputSchema,
  RescheduleInput as RescheduleInputSchema,
  ConfirmAttendanceInput as ConfirmAttendanceInputSchema,
  ResolveStudentRequestInput as ResolveStudentRequestInputSchema,
  SaveProgressInput as SaveProgressInputSchema,
  UpdateProfileInput as UpdateProfileInputSchema,
  ChangePasswordInput as ChangePasswordInputSchema,
  StudentRequestInput as StudentRequestInputSchema,
  type AddStudentInput,
  type AddMaterialInput,
  type AttendanceView,
  type ConfirmAttendanceInput,
  type CreateCourseInput,
  type CreateSessionsInput,
  type CreateUnitInput,
  type DeductionView,
  err,
  ok,
  type Result,
  type ConflictView,
  type RescheduleInput,
  type ProgressRecordView,
  type ResolveStudentRequestInput,
  type SaveProgressInput,
  type UpdateProfileInput,
  type ChangePasswordInput,
  type StudentRequestInput,
  type StudentRequestView,
} from "@/contracts";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { checkConflicts } from "@/services/read";

const attendanceSessionInclude = {
  course: {
    select: {
      id: true,
      teacherId: true,
      pricePerSessionCents: true,
      enrollments: { select: { studentId: true } },
    },
  },
  attendance: { include: { student: { select: { name: true } } }, orderBy: [{ studentId: "asc" }] },
  deductions: { include: { student: { select: { name: true } } }, orderBy: [{ studentId: "asc" }] },
} satisfies Prisma.SessionInclude;

type AttendanceSessionSnapshot = Prisma.SessionGetPayload<{ include: typeof attendanceSessionInclude }>;

function attendanceViews(session: AttendanceSessionSnapshot): AttendanceView[] {
  return session.attendance.map((record) => ({
    id: record.id,
    sessionId: record.sessionId,
    courseId: session.courseId,
    sessionStartAt: session.startAt.toISOString(),
    studentId: record.studentId,
    studentName: record.student.name,
    status: record.status,
    markedAt: record.markedAt.toISOString(),
  }));
}

function deductionViews(session: AttendanceSessionSnapshot): DeductionView[] {
  return session.deductions.map((record) => ({
    id: record.id,
    sessionId: record.sessionId,
    courseId: record.courseId,
    studentId: record.studentId,
    studentName: record.student.name,
    amountCents: record.amountCents,
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
  }));
}

function sameAttendance(session: AttendanceSessionSnapshot, records: ConfirmAttendanceInput["records"]): boolean {
  if (session.attendance.length !== records.length) return false;
  const submitted = new Map(records.map((record) => [record.studentId, record.status]));
  return session.attendance.every((record) => submitted.get(record.studentId) === record.status);
}

export async function createCourse(
  actor: Actor,
  input: CreateCourseInput,
): Promise<Result<{ courseId: string }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can create courses.");
  const parsed = CreateCourseInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter valid course details.");

  try {
    const course = await prisma.course.create({
      data: {
        teacherId: actor.userId,
        name: parsed.data.name,
        subject: parsed.data.subject,
        type: parsed.data.type,
        location: parsed.data.location,
        description: parsed.data.description,
        pricePerSessionCents: parsed.data.pricePerSessionCents,
      },
      select: { id: true },
    });
    return ok({ courseId: course.id });
  } catch {
    return err("INTERNAL", "Could not create the course. Please try again.");
  }
}

export async function createCourseUnit(
  actor: Actor,
  input: CreateUnitInput,
): Promise<Result<{ unitId: string }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can create course units.");
  const parsed = CreateUnitInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter a valid course and unit title.");
  try {
    const course = await prisma.course.findUnique({
      where: { id: parsed.data.courseId },
      select: { id: true, teacherId: true },
    });
    if (!course) return err("NOT_FOUND", "Course not found.");
    if (course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this course.");

    const order = parsed.data.order ?? ((await prisma.courseUnit.aggregate({
      where: { courseId: course.id },
      _max: { order: true },
    }))._max.order ?? 0) + 1;
    const unit = await prisma.courseUnit.create({
      data: { courseId: course.id, title: parsed.data.title, order },
      select: { id: true },
    });
    return ok({ unitId: unit.id });
  } catch {
    return err("INTERNAL", "Could not create the course unit. Please try again.");
  }
}

export async function addMaterial(
  actor: Actor,
  input: AddMaterialInput,
): Promise<Result<{ materialId: string }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can add course materials.");
  const parsed = AddMaterialInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter valid material details. TEXT requires content; LINK requires a URL.");
  try {
    const unit = await prisma.courseUnit.findUnique({
      where: { id: parsed.data.unitId },
      select: { id: true, course: { select: { teacherId: true } } },
    });
    if (!unit) return err("NOT_FOUND", "Course unit not found.");
    if (unit.course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this course unit.");

    const material = await prisma.material.create({
      data: {
        unitId: unit.id,
        title: parsed.data.title,
        kind: parsed.data.kind,
        content: parsed.data.content,
        url: parsed.data.url,
      },
      select: { id: true },
    });
    return ok({ materialId: material.id });
  } catch {
    return err("INTERNAL", "Could not add the course material. Please try again.");
  }
}

export async function rescheduleSession(
  actor: Actor,
  input: RescheduleInput,
): Promise<Result<{ sessionId: string; oldStartAt: string; newStartAt: string }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can reschedule sessions.");
  const parsed = RescheduleInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter a valid session and new start time.");
  try {
    const session = await prisma.session.findUnique({
      where: { id: parsed.data.sessionId },
      select: {
        id: true,
        courseId: true,
        startAt: true,
        durationMin: true,
        status: true,
        originalStartAt: true,
        course: { select: { teacherId: true } },
      },
    });
    if (!session) return err("NOT_FOUND", "Session not found.");
    if (session.course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this session.");
    if (session.status !== "SCHEDULED" && session.status !== "RESCHEDULED") {
      return err("CONFLICT", "Only scheduled sessions can be rescheduled.");
    }

    const newStartAt = new Date(parsed.data.newStartAt);
    const conflictResult = await checkConflicts(actor, {
      courseId: session.courseId,
      startAt: newStartAt.toISOString(),
      durationMin: session.durationMin,
      excludeSessionId: session.id,
    });
    if (!conflictResult.ok) return conflictResult;
    if (conflictResult.data.conflicts.length > 0) {
      return err("CONFLICT", "This session conflicts with another scheduled session.", conflictResult.data.conflicts);
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.session.updateMany({
        where: { id: session.id, status: session.status, startAt: session.startAt },
        data: {
          startAt: newStartAt,
          originalStartAt: session.originalStartAt ?? session.startAt,
          status: "RESCHEDULED",
        },
      });
      if (updated.count === 0) return err("CONFLICT", "This session changed while it was being rescheduled. Please try again.");
      await tx.sessionChange.create({
        data: {
          sessionId: session.id,
          changedById: actor.userId,
          fromStatus: session.status,
          toStatus: "RESCHEDULED",
          oldStartAt: session.startAt,
          newStartAt,
        },
      });
      return ok({
        sessionId: session.id,
        oldStartAt: session.startAt.toISOString(),
        newStartAt: newStartAt.toISOString(),
      });
    });
  } catch {
    return err("INTERNAL", "Could not reschedule the session. Please try again.");
  }
}

export async function addExistingStudentToCourse(
  actor: Actor,
  input: AddStudentInput,
): Promise<Result<{ enrollmentId: string; alreadyJoined: boolean }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can add students to courses.");
  const parsed = AddStudentInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter a valid course ID and student email.");

  try {
    const course = await prisma.course.findUnique({
      where: { id: parsed.data.courseId },
      select: { id: true, teacherId: true },
    });
    if (!course) return err("NOT_FOUND", "Course not found.");
    if (course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this course.");

    const student = await prisma.user.findFirst({
      where: { email: parsed.data.email, role: "STUDENT" },
      select: { id: true },
    });
    if (!student) {
      return err("NOT_FOUND", "No student account is registered with this email.");
    }

    const existing = await prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId: course.id, studentId: student.id } },
      select: { id: true },
    });
    if (existing) return ok({ enrollmentId: existing.id, alreadyJoined: true });

    try {
      const enrollment = await prisma.enrollment.create({
        data: { courseId: course.id, studentId: student.id },
        select: { id: true },
      });
      return ok({ enrollmentId: enrollment.id, alreadyJoined: false });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const racedEnrollment = await prisma.enrollment.findUnique({
          where: { courseId_studentId: { courseId: course.id, studentId: student.id } },
          select: { id: true },
        });
        if (racedEnrollment) return ok({ enrollmentId: racedEnrollment.id, alreadyJoined: true });
      }
      throw error;
    }
  } catch {
    return err("INTERNAL", "Could not add the student to the course. Please try again.");
  }
}

function hasOverlap(startA: Date, durationAMin: number, startB: Date, durationBMin: number): boolean {
  const endA = startA.getTime() + durationAMin * 60_000;
  const endB = startB.getTime() + durationBMin * 60_000;
  return startA.getTime() < endB && endA > startB.getTime();
}

export async function createSessions(
  actor: Actor,
  input: CreateSessionsInput,
): Promise<Result<{ sessionIds: string[] }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can schedule sessions.");
  const parsed = CreateSessionsInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter valid session details.");

  try {
    const course = await prisma.course.findUnique({
      where: { id: parsed.data.courseId },
      select: { id: true, name: true, teacherId: true },
    });
    if (!course) return err("NOT_FOUND", "Course not found.");
    if (course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this course.");

    const conflicts: ConflictView[] = [];
    for (let index = 0; index < parsed.data.sessions.length; index += 1) {
      const candidate = parsed.data.sessions[index];
      const result = await checkConflicts(actor, {
        courseId: course.id,
        startAt: candidate.startAt,
        durationMin: candidate.durationMin,
      });
      if (!result.ok) return result;
      conflicts.push(...result.data.conflicts);

      for (let earlierIndex = 0; earlierIndex < index; earlierIndex += 1) {
        const earlier = parsed.data.sessions[earlierIndex];
        if (
          hasOverlap(
            new Date(candidate.startAt),
            candidate.durationMin,
            new Date(earlier.startAt),
            earlier.durationMin,
          )
        ) {
          conflicts.push({
            sessionId: `batch-${earlierIndex + 1}`,
            courseName: course.name,
            startAt: new Date(earlier.startAt).toISOString(),
            durationMin: earlier.durationMin,
          });
        }
      }
    }

    const uniqueConflicts = [...new Map(
      conflicts.map((conflict) => [`${conflict.sessionId}:${conflict.withStudentId ?? ""}`, conflict]),
    ).values()];
    if (uniqueConflicts.length) {
      return err("CONFLICT", "One or more sessions conflict with an existing schedule.", uniqueConflicts);
    }

    const sessions = await prisma.$transaction(
      parsed.data.sessions.map((session) =>
        prisma.session.create({
          data: {
            courseId: course.id,
            startAt: new Date(session.startAt),
            durationMin: session.durationMin,
            location: session.location,
            linkUrl: session.linkUrl,
            status: "SCHEDULED",
          },
          select: { id: true },
        }),
      ),
    );
    return ok({ sessionIds: sessions.map(({ id }) => id) });
  } catch {
    return err("INTERNAL", "Could not schedule sessions. Please try again.");
  }
}

export async function confirmAttendance(
  actor: Actor,
  input: ConfirmAttendanceInput,
): Promise<Result<{ attendance: AttendanceView[]; deductions: DeductionView[]; sessionStatus: "COMPLETED" }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can confirm attendance.");
  const parsed = ConfirmAttendanceInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter valid attendance details.");
  const submitted = parsed.data.records;
  if (new Set(submitted.map((record) => record.studentId)).size !== submitted.length) {
    return err("VALIDATION", "Each student can appear only once in attendance.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      let session = await tx.session.findUnique({ where: { id: parsed.data.sessionId }, include: attendanceSessionInclude });
      if (!session) return err("NOT_FOUND", "Session not found.");
      if (session.course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this session.");

      if (session.status === "COMPLETED" && session.attendance.length > 0) {
        if (!sameAttendance(session, submitted)) {
          return err("CONFLICT", "Attendance has been submitted and cannot be changed yet.");
        }
        return ok({ attendance: attendanceViews(session), deductions: deductionViews(session), sessionStatus: "COMPLETED" as const });
      }
      if (session.status !== "SCHEDULED" && session.status !== "RESCHEDULED") {
        return err("CONFLICT", "This session is already completed or cancelled.");
      }

      const enrolledIds = new Set(session.course.enrollments.map(({ studentId }) => studentId));
      if (submitted.some(({ studentId }) => !enrolledIds.has(studentId))) {
        return err("VALIDATION", "Attendance contains students who are not enrolled in this course.");
      }
      const submittedIds = new Set(submitted.map(({ studentId }) => studentId));
      const missingCount = [...enrolledIds].filter((studentId) => !submittedIds.has(studentId)).length;
      if (missingCount > 0) {
        return err("VALIDATION", `Attendance is still missing for ${missingCount} students.`);
      }

      // Claim the state transition before inserting unique attendance rows. The status update
      // and all following writes share this transaction, so a failed insert rolls everything back.
      const claimed = await tx.session.updateMany({
        where: { id: session.id, status: session.status },
        data: { status: "COMPLETED" },
      });
      if (claimed.count === 0) {
        session = await tx.session.findUnique({ where: { id: session.id }, include: attendanceSessionInclude });
        if (session?.status === "COMPLETED" && session.attendance.length > 0 && sameAttendance(session, submitted)) {
          return ok({ attendance: attendanceViews(session), deductions: deductionViews(session), sessionStatus: "COMPLETED" as const });
        }
        return err("CONFLICT", "Attendance has been submitted and cannot be changed yet.");
      }

      await tx.attendance.createMany({
        data: submitted.map(({ studentId, status }) => ({
          sessionId: session!.id,
          studentId,
          status,
          markedById: actor.userId,
        })),
      });
      const deductionRecords = submitted.flatMap(({ studentId, status }) =>
        status === "PRESENT" || status === "ABSENT"
          ? [{
            sessionId: session!.id,
            studentId,
            courseId: session!.courseId,
            amountCents: session!.course.pricePerSessionCents,
            reason: status,
          }]
          : [],
      );
      await tx.deduction.createMany({ data: deductionRecords });
      await tx.sessionChange.create({
        data: {
          sessionId: session.id,
          changedById: actor.userId,
          fromStatus: session.status,
          toStatus: "COMPLETED",
        },
      });

      const completed = await tx.session.findUnique({ where: { id: session.id }, include: attendanceSessionInclude });
      if (!completed) return err("INTERNAL", "Could not load the saved attendance. Please try again.");
      return ok({ attendance: attendanceViews(completed), deductions: deductionViews(completed), sessionStatus: "COMPLETED" as const });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // A concurrent identical submission may win the unique (sessionId, studentId) constraint.
      try {
        const existing = await prisma.session.findUnique({ where: { id: parsed.data.sessionId }, include: attendanceSessionInclude });
        if (existing?.course.teacherId === actor.userId && existing.status === "COMPLETED" && sameAttendance(existing, submitted)) {
          return ok({ attendance: attendanceViews(existing), deductions: deductionViews(existing), sessionStatus: "COMPLETED" });
        }
      } catch {
        // Fall through to the normal service error below.
      }
      return err("CONFLICT", "Attendance has been submitted and cannot be changed yet.");
    }
    return err("INTERNAL", "Could not confirm attendance. Please try again.");
  }
}

// ---------- student requests (leave or reschedule) ----------

const requestInclude = {
  student: { select: { name: true } },
  session: { select: { startAt: true, courseId: true, course: { select: { name: true } } } },
} satisfies Prisma.StudentRequestInclude;

function requestView(row: Prisma.StudentRequestGetPayload<{ include: typeof requestInclude }>): StudentRequestView {
  return {
    id: row.id,
    sessionId: row.sessionId,
    courseId: row.session.courseId,
    courseName: row.session.course.name,
    sessionStartAt: row.session.startAt.toISOString(),
    studentId: row.studentId,
    studentName: row.student.name,
    kind: row.kind,
    ...(row.note ? { note: row.note } : {}),
    ...(row.preferredStartAt ? { preferredStartAt: row.preferredStartAt.toISOString() } : {}),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    ...(row.resolvedAt ? { resolvedAt: row.resolvedAt.toISOString() } : {}),
  };
}

/**
 * A student asks for leave or a new time for one upcoming session of a course they are enrolled in.
 * This only stores a pending record: the schedule and attendance are never changed here.
 */
export async function submitStudentRequest(actor: Actor, input: StudentRequestInput): Promise<Result<StudentRequestView>> {
  if (actor.role !== "STUDENT") return err("FORBIDDEN", "Only students can submit requests.");
  const parsed = StudentRequestInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter a valid request.");
  const { sessionId, kind, note, preferredStartAt } = parsed.data;
  if (kind === "LEAVE" && preferredStartAt) return err("VALIDATION", "A leave request does not take a preferred time.");
  if (preferredStartAt && Date.parse(preferredStartAt) <= Date.now()) return err("VALIDATION", "The preferred time must be in the future.");

  try {
    return await prisma.$transaction(
      async (tx) => {
        const session = await tx.session.findFirst({
          where: { id: sessionId, course: { enrollments: { some: { studentId: actor.userId } } } },
          select: { id: true, startAt: true, status: true },
        });
        if (!session) return err("FORBIDDEN", "You do not have access to this session.");
        if (session.status !== "SCHEDULED" && session.status !== "RESCHEDULED") {
          return err("CONFLICT", "Only upcoming sessions can be requested.");
        }
        if (session.startAt.getTime() <= Date.now()) return err("CONFLICT", "This session has already started.");
        const pending = await tx.studentRequest.findFirst({
          where: { sessionId, studentId: actor.userId, status: "PENDING" },
          select: { id: true },
        });
        if (pending) return err("CONFLICT", "You already have a pending request for this session.");
        const created = await tx.studentRequest.create({
          data: {
            sessionId,
            studentId: actor.userId,
            kind,
            note: note?.trim() || null,
            preferredStartAt: preferredStartAt ? new Date(preferredStartAt) : null,
          },
          include: requestInclude,
        });
        return ok(requestView(created));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return err("CONFLICT", "You already have a pending request for this session.");
    }
    return err("INTERNAL", "Could not submit the request. Please try again.");
  }
}

/** The teacher of the course approves or declines a pending request. Nothing else changes. */
export async function resolveStudentRequest(actor: Actor, input: ResolveStudentRequestInput): Promise<Result<StudentRequestView>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can respond to requests.");
  const parsed = ResolveStudentRequestInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter a valid decision.");
  try {
    const existing = await prisma.studentRequest.findUnique({
      where: { id: parsed.data.requestId },
      select: { session: { select: { course: { select: { teacherId: true } } } } },
    });
    if (!existing) return err("NOT_FOUND", "Request not found.");
    if (existing.session.course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this request.");

    const claimed = await prisma.studentRequest.updateMany({
      where: { id: parsed.data.requestId, status: "PENDING" },
      data: { status: parsed.data.decision, resolvedAt: new Date(), resolvedById: actor.userId },
    });
    if (claimed.count === 0) return err("CONFLICT", "This request has already been answered.");
    const row = await prisma.studentRequest.findUniqueOrThrow({ where: { id: parsed.data.requestId }, include: requestInclude });
    return ok(requestView(row));
  } catch {
    return err("INTERNAL", "Could not save the decision. Please try again.");
  }
}

// ---------- progress records ----------

/**
 * A teacher records what one enrolled student worked on in a session that has started.
 * There is one record per session and student: saving again replaces it. Nothing else changes.
 */
export async function saveProgressRecord(actor: Actor, input: SaveProgressInput): Promise<Result<ProgressRecordView>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can save progress records.");
  const parsed = SaveProgressInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter a goal, an outcome and a next step.");
  const data = parsed.data;
  try {
    const session = await prisma.session.findFirst({
      where: { id: data.sessionId, course: { teacherId: actor.userId } },
      select: { id: true, startAt: true, status: true, course: { select: { id: true, name: true, enrollments: { where: { studentId: data.studentId }, select: { id: true }, take: 1 } } } },
    });
    if (!session) return err("FORBIDDEN", "You do not have access to this session.");
    if (session.course.enrollments.length === 0) return err("NOT_FOUND", "That student is not enrolled in this course.");
    if (session.status === "CANCELLED") return err("CONFLICT", "This session was cancelled.");
    if (session.startAt.getTime() > Date.now() && session.status !== "COMPLETED") {
      return err("CONFLICT", "Progress can be saved once the session has started.");
    }
    const values = {
      teacherId: actor.userId,
      goal: data.goal.trim(),
      output: data.output.trim(),
      issue: data.issue?.trim() || null,
      nextAction: data.nextAction,
      note: data.note?.trim() || null,
    };
    const row = await prisma.progressRecord.upsert({
      where: { sessionId_studentId: { sessionId: data.sessionId, studentId: data.studentId } },
      create: { sessionId: data.sessionId, studentId: data.studentId, ...values },
      update: values,
      include: { student: { select: { name: true } } },
    });
    return ok({
      id: row.id,
      sessionId: row.sessionId,
      courseId: session.course.id,
      courseName: session.course.name,
      sessionStartAt: session.startAt.toISOString(),
      studentId: row.studentId,
      studentName: row.student.name,
      goal: row.goal,
      output: row.output,
      ...(row.issue ? { issue: row.issue } : {}),
      nextAction: row.nextAction,
      ...(row.note ? { note: row.note } : {}),
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch {
    return err("INTERNAL", "Could not save the progress record. Please try again.");
  }
}

// ---------- account settings ----------

/** Changes the signed-in user's own display name. */
export async function updateMyProfile(actor: Actor, input: UpdateProfileInput): Promise<Result<{ name: string }>> {
  const parsed = UpdateProfileInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Enter a name between 1 and 80 characters.");
  try {
    const updated = await prisma.user.update({ where: { id: actor.userId }, data: { name: parsed.data.name }, select: { name: true } });
    return ok({ name: updated.name });
  } catch {
    return err("INTERNAL", "Could not save your name. Please try again.");
  }
}

/** Changes the signed-in user's own password after checking the current one. */
export async function changeMyPassword(actor: Actor, input: ChangePasswordInput): Promise<Result<{ changed: true }>> {
  const parsed = ChangePasswordInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "The new password must be 8 to 128 characters.");
  if (parsed.data.currentPassword === parsed.data.newPassword) return err("VALIDATION", "Choose a new password that is different from the current one.");
  try {
    const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { passwordHash: true } });
    if (!user) return err("NOT_FOUND", "Account not found.");
    if (!(await compare(parsed.data.currentPassword, user.passwordHash))) return err("VALIDATION", "The current password is not correct.");
    await prisma.user.update({ where: { id: actor.userId }, data: { passwordHash: await hash(parsed.data.newPassword, 12) } });
    return ok({ changed: true });
  } catch {
    return err("INTERNAL", "Could not change your password. Please try again.");
  }
}
