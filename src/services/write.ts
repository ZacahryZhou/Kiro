import { Prisma } from "@prisma/client";
import {
  AddStudentInput as AddStudentInputSchema,
  CreateCourseInput as CreateCourseInputSchema,
  CreateSessionsInput as CreateSessionsInputSchema,
  type AddStudentInput,
  type CreateCourseInput,
  type CreateSessionsInput,
  err,
  ok,
  type Result,
  type ConflictView,
} from "@/contracts";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { checkConflicts } from "@/services/read";

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
