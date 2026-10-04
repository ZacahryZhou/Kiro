import { err, ok, type Actor, type Result } from "@/contracts";
import { prisma } from "@/lib/db/prisma";

export type StudentMemoryView = {
  id: string;
  courseId: string;
  studentId: string;
  kind: "AVAILABILITY" | "NOTE";
  content: string;
  createdAt: string;
};

/** Teacher-only memory read. The query is scoped to the authenticated teacher's course. */
export async function getStudentMemory(
  actor: Actor,
  input: { courseId: string; studentId?: string },
): Promise<Result<{ memories: StudentMemoryView[] }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can view student memory.");
  try {
    const course = await prisma.course.findFirst({
      where: { id: input.courseId, teacherId: actor.userId },
      select: { id: true },
    });
    if (!course) return err("FORBIDDEN", "You do not have access to this course.");
    if (input.studentId) {
      const enrolled = await prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId: course.id, studentId: input.studentId } },
        select: { id: true },
      });
      if (!enrolled) return err("NOT_FOUND", "Student is not enrolled in this course.");
    }
    const rows = await prisma.agentMemory.findMany({
      where: { courseId: course.id, teacherId: actor.userId, studentId: input.studentId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    return ok({ memories: rows.map((row) => ({
      id: row.id, courseId: row.courseId, studentId: row.studentId,
      kind: row.kind, content: row.content, createdAt: row.createdAt.toISOString(),
    })) });
  } catch {
    return err("INTERNAL", "Could not load student memory. Please try again.");
  }
}

/** Teacher-only memory write used after the proposal state machine claims confirmation. */
export async function saveStudentMemory(
  actor: Actor,
  input: { courseId: string; studentId: string; kind: "AVAILABILITY" | "NOTE"; content: string },
): Promise<Result<{ memoryId: string }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can save student memory.");
  try {
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        courseId: input.courseId,
        studentId: input.studentId,
        course: { teacherId: actor.userId },
      },
      select: { id: true },
    });
    if (!enrollment) return err("FORBIDDEN", "You do not have access to this student in this course.");
    const memory = await prisma.agentMemory.create({
      data: { ...input, teacherId: actor.userId },
      select: { id: true },
    });
    return ok({ memoryId: memory.id });
  } catch {
    return err("INTERNAL", "Could not save student memory. Please try again.");
  }
}
