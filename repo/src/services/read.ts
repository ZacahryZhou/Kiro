import { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INTERNAL";
export type ServiceError = { code: ErrorCode; message: string; details?: unknown };
export type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError };
export type CourseView = {
  id: string;
  name: string;
  subject: string;
  type: "ONE_ON_ONE" | "SMALL_CLASS";
  location?: string;
  description?: string;
  teacherName: string;
  studentCount: number;
};
export type SessionView = {
  id: string;
  courseId: string;
  courseName: string;
  startAt: string;
  durationMin: number;
  location?: string;
  linkUrl?: string;
  status: "SCHEDULED" | "RESCHEDULED" | "CANCELLED" | "COMPLETED";
  originalStartAt?: string;
};
export type StudentView = { id: string; name: string; email: string };
export type AttendanceView = {
  id: string;
  sessionId: string;
  courseId: string;
  sessionStartAt: string;
  studentId: string;
  studentName: string;
  status: "PRESENT" | "LEAVE" | "ABSENT";
  markedAt: string;
};
export type MaterialView = {
  id: string;
  unitId: string;
  title: string;
  kind: "TEXT" | "LINK";
  content?: string;
  url?: string;
};
export type UnitView = {
  id: string;
  courseId: string;
  title: string;
  order: number;
  materials: MaterialView[];
};

const limit = 200;
const id = z.string().min(1);
const dateRange = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});
const scheduleInput = dateRange.extend({ courseId: id.optional() });
const courseInput = z.object({ courseId: id });

function success<T>(data: T): Result<T> {
  return { ok: true, data };
}

function failure<T>(code: ErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

function validRange(from: string, to: string): boolean {
  return Date.parse(from) < Date.parse(to);
}

function courseView(course: {
  id: string;
  name: string;
  subject: string;
  type: CourseView["type"];
  location: string | null;
  description: string | null;
  teacher: { name: string };
  _count: { enrollments: number };
}): CourseView {
  return {
    id: course.id,
    name: course.name,
    subject: course.subject,
    type: course.type,
    location: course.location ?? undefined,
    description: course.description ?? undefined,
    teacherName: course.teacher.name,
    studentCount: course._count.enrollments,
  };
}

function sessionView(session: {
  id: string;
  courseId: string;
  startAt: Date;
  durationMin: number;
  location: string | null;
  linkUrl: string | null;
  status: SessionView["status"];
  originalStartAt: Date | null;
  course: { name: string };
}): SessionView {
  return {
    id: session.id,
    courseId: session.courseId,
    courseName: session.course.name,
    startAt: session.startAt.toISOString(),
    durationMin: session.durationMin,
    location: session.location ?? undefined,
    linkUrl: session.linkUrl ?? undefined,
    status: session.status,
    originalStartAt: session.originalStartAt?.toISOString(),
  };
}

async function canReadCourse(actor: Actor, courseId: string): Promise<Result<null>> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      teacherId: true,
      enrollments: {
        where: { studentId: actor.userId },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!course) return failure("NOT_FOUND", "课程不存在。");
  if (actor.role === "TEACHER" && course.teacherId === actor.userId) return success(null);
  if (actor.role === "STUDENT" && course.enrollments.length > 0) return success(null);
  return failure("FORBIDDEN", "无权访问此课程。");
}

export async function listMyCourses(actor: Actor): Promise<Result<{ courses: CourseView[] }>> {
  try {
    if (actor.role !== "TEACHER" && actor.role !== "STUDENT") {
      return failure("FORBIDDEN", "无权查看课程。");
    }
    const courses = await prisma.course.findMany({
      where:
        actor.role === "TEACHER"
          ? { teacherId: actor.userId }
          : { enrollments: { some: { studentId: actor.userId } } },
      include: { teacher: { select: { name: true } }, _count: { select: { enrollments: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit,
    });
    return success({ courses: courses.map(courseView) });
  } catch {
    return failure("INTERNAL", "读取课程失败，请稍后重试。");
  }
}

export async function getTeacherSchedule(
  actor: Actor,
  input: { from: string; to: string; courseId?: string },
): Promise<Result<{ sessions: SessionView[] }>> {
  if (actor.role !== "TEACHER") return failure("FORBIDDEN", "只有老师可以查看教师课表。");
  const parsed = scheduleInput.safeParse(input);
  if (!parsed.success || !validRange(parsed.data.from, parsed.data.to)) {
    return failure("VALIDATION", "请输入有效的开始和结束时间。");
  }
  try {
    if (parsed.data.courseId) {
      const access = await canReadCourse(actor, parsed.data.courseId);
      if (!access.ok) return access;
    }
    const sessions = await prisma.session.findMany({
      where: {
        course: { teacherId: actor.userId },
        courseId: parsed.data.courseId,
        startAt: { gte: new Date(parsed.data.from), lt: new Date(parsed.data.to) },
      },
      include: { course: { select: { name: true } } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    return success({ sessions: sessions.map(sessionView) });
  } catch {
    return failure("INTERNAL", "读取课表失败，请稍后重试。");
  }
}

export async function listMyStudents(
  actor: Actor,
  input: { courseId: string },
): Promise<Result<{ students: StudentView[] }>> {
  if (actor.role !== "TEACHER") return failure("FORBIDDEN", "只有老师可以查看学生名单。");
  const parsed = courseInput.safeParse(input);
  if (!parsed.success) return failure("VALIDATION", "课程编号无效。");
  try {
    const access = await canReadCourse(actor, parsed.data.courseId);
    if (!access.ok) return access;
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId: parsed.data.courseId, course: { teacherId: actor.userId } },
      include: { student: { select: { id: true, name: true, email: true } } },
      orderBy: [{ student: { name: "asc" } }, { studentId: "asc" }],
      take: limit,
    });
    return success({ students: enrollments.map(({ student }) => student) });
  } catch {
    return failure("INTERNAL", "读取学生名单失败，请稍后重试。");
  }
}

export async function getCourseMaterials(
  actor: Actor,
  input: { courseId: string },
): Promise<Result<{ units: UnitView[] }>> {
  const parsed = courseInput.safeParse(input);
  if (!parsed.success) return failure("VALIDATION", "课程编号无效。");
  try {
    const access = await canReadCourse(actor, parsed.data.courseId);
    if (!access.ok) return access;
    const units = await prisma.courseUnit.findMany({
      where: { courseId: parsed.data.courseId },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      take: limit,
    });
    const materials = await prisma.material.findMany({
      where: { unitId: { in: units.map((unit) => unit.id) } },
      orderBy: [{ unit: { order: "asc" } }, { id: "asc" }],
      take: limit,
    });
    return success({
      units: units.map((unit) => ({
        id: unit.id,
        courseId: unit.courseId,
        title: unit.title,
        order: unit.order,
        materials: materials
          .filter((material) => material.unitId === unit.id)
          .map((material) => ({
            id: material.id,
            unitId: material.unitId,
            title: material.title,
            kind: material.kind,
            content: material.content ?? undefined,
            url: material.url ?? undefined,
          })),
      })),
    });
  } catch {
    return failure("INTERNAL", "读取课程资料失败，请稍后重试。");
  }
}

export async function getStudentWorkspace(
  actor: Actor,
  input: { from: string; to: string },
): Promise<
  Result<{ courses: CourseView[]; sessions: SessionView[]; attendance: AttendanceView[] }>
> {
  if (actor.role !== "STUDENT") return failure("FORBIDDEN", "只有学生可以查看学生空间。");
  const parsed = dateRange.safeParse(input);
  if (!parsed.success || !validRange(parsed.data.from, parsed.data.to)) {
    return failure("VALIDATION", "请输入有效的开始和结束时间。");
  }
  try {
    const enrollment = { some: { studentId: actor.userId } };
    const range = { gte: new Date(parsed.data.from), lt: new Date(parsed.data.to) };
    const [courses, sessions, attendance] = await Promise.all([
      prisma.course.findMany({
        where: { enrollments: enrollment },
        include: { teacher: { select: { name: true } }, _count: { select: { enrollments: true } } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: limit,
      }),
      prisma.session.findMany({
        where: { course: { enrollments: enrollment }, startAt: range },
        include: { course: { select: { name: true } } },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        take: limit,
      }),
      prisma.attendance.findMany({
        where: {
          studentId: actor.userId,
          session: { startAt: range, course: { enrollments: enrollment } },
        },
        include: {
          student: { select: { name: true } },
          session: { select: { courseId: true, startAt: true } },
        },
        orderBy: [{ session: { startAt: "asc" } }, { id: "asc" }],
        take: limit,
      }),
    ]);
    return success({
      courses: courses.map(courseView),
      sessions: sessions.map(sessionView),
      attendance: attendance.map((record) => ({
        id: record.id,
        sessionId: record.sessionId,
        courseId: record.session.courseId,
        sessionStartAt: record.session.startAt.toISOString(),
        studentId: record.studentId,
        studentName: record.student.name,
        status: record.status,
        markedAt: record.markedAt.toISOString(),
      })),
    });
  } catch {
    return failure("INTERNAL", "读取学生空间失败，请稍后重试。");
  }
}
