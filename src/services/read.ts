import { z } from "zod";
import { CheckConflictsInput, type AttendanceView, type ConflictView, type CourseView, type DeductionView, type SessionView, type StudentRequestView, type StudentView, type UnitView, type Result, err, ok } from "@/contracts";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";

export type {
  AttendanceView,
  ConflictView,
  CourseView,
  DeductionView,
  ErrorCode,
  Result,
  ServiceError,
  SessionView,
  StudentRequestView,
  StudentView,
  UnitView,
} from "@/contracts";

const limit = 200;
const id = z.string().min(1);
const dateRange = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});
const scheduleInput = dateRange.extend({ courseId: id.optional() });
const courseInput = z.object({ courseId: id });
const attendanceListInput = z.object({
  courseId: id.optional(),
  sessionId: id.optional(),
  studentId: id.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.enum(["PRESENT", "LEAVE", "ABSENT"]).optional(),
});
const deductionListInput = z.object({
  courseId: id.optional(),
  sessionId: id.optional(),
  studentId: id.optional(),
});

const success = ok;
const failure = err;

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
  if (!course) return failure("NOT_FOUND", "Course not found.");
  if (actor.role === "TEACHER" && course.teacherId === actor.userId) return success(null);
  if (actor.role === "STUDENT" && course.enrollments.length > 0) return success(null);
  return failure("FORBIDDEN", "You do not have access to this course.");
}

export async function listMyCourses(actor: Actor): Promise<Result<{ courses: CourseView[] }>> {
  try {
    if (actor.role !== "TEACHER" && actor.role !== "STUDENT") {
      return failure("FORBIDDEN", "You do not have permission to view courses.");
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
    return failure("INTERNAL", "Could not load courses. Please try again.");
  }
}

export async function getTeacherSchedule(
  actor: Actor,
  input: { from: string; to: string; courseId?: string },
): Promise<Result<{ sessions: SessionView[] }>> {
  if (actor.role !== "TEACHER") return failure("FORBIDDEN", "Only teachers can view the teacher schedule.");
  const parsed = scheduleInput.safeParse(input);
  if (!parsed.success || !validRange(parsed.data.from, parsed.data.to)) {
    return failure("VALIDATION", "Enter a valid start and end time.");
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
    return failure("INTERNAL", "Could not load the schedule. Please try again.");
  }
}

export async function listMyStudents(
  actor: Actor,
  input: { courseId: string },
): Promise<Result<{ students: StudentView[] }>> {
  if (actor.role !== "TEACHER") return failure("FORBIDDEN", "Only teachers can view course rosters.");
  const parsed = courseInput.safeParse(input);
  if (!parsed.success) return failure("VALIDATION", "Invalid course ID.");
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
    return failure("INTERNAL", "Could not load the student roster. Please try again.");
  }
}

export async function getCourseMaterials(
  actor: Actor,
  input: { courseId: string },
): Promise<Result<{ units: UnitView[] }>> {
  const parsed = courseInput.safeParse(input);
  if (!parsed.success) return failure("VALIDATION", "Invalid course ID.");
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
    return failure("INTERNAL", "Could not load course materials. Please try again.");
  }
}

export async function getStudentWorkspace(
  actor: Actor,
  input: { from: string; to: string },
): Promise<
  Result<{ courses: CourseView[]; sessions: SessionView[]; attendance: AttendanceView[] }>
> {
  if (actor.role !== "STUDENT") return failure("FORBIDDEN", "Only students can view the student workspace.");
  const parsed = dateRange.safeParse(input);
  if (!parsed.success || !validRange(parsed.data.from, parsed.data.to)) {
    return failure("VALIDATION", "Enter a valid start and end time.");
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
    return failure("INTERNAL", "Could not load the student workspace. Please try again.");
  }
}

async function canReadSession(actor: Actor, sessionId: string): Promise<Result<null>> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      course: {
        select: {
          teacherId: true,
          enrollments: { where: { studentId: actor.userId }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  if (!session) return failure("NOT_FOUND", "Session not found.");
  if (actor.role === "TEACHER" && session.course.teacherId === actor.userId) return success(null);
  if (actor.role === "STUDENT" && session.course.enrollments.length > 0) return success(null);
  return failure("FORBIDDEN", "You do not have access to this session.");
}

export async function listAttendance(
  actor: Actor,
  input: { courseId?: string; sessionId?: string; studentId?: string; from?: string; to?: string; status?: AttendanceView["status"] },
): Promise<Result<{ records: AttendanceView[] }>> {
  if (actor.role !== "TEACHER" && actor.role !== "STUDENT") return failure("FORBIDDEN", "You do not have permission to view attendance.");
  const parsed = attendanceListInput.safeParse(input);
  if (!parsed.success || (parsed.data.from && parsed.data.to && !validRange(parsed.data.from, parsed.data.to))) {
    return failure("VALIDATION", "Enter valid attendance filters.");
  }
  try {
    if (parsed.data.courseId) {
      const access = await canReadCourse(actor, parsed.data.courseId);
      if (!access.ok) return access;
    }
    if (parsed.data.sessionId) {
      const access = await canReadSession(actor, parsed.data.sessionId);
      if (!access.ok) return access;
    }
    const records = await prisma.attendance.findMany({
      where: {
        studentId: actor.role === "STUDENT" ? actor.userId : parsed.data.studentId,
        status: parsed.data.status,
        sessionId: parsed.data.sessionId,
        session: {
          courseId: parsed.data.courseId,
          startAt: parsed.data.from || parsed.data.to
            ? { gte: parsed.data.from ? new Date(parsed.data.from) : undefined, lt: parsed.data.to ? new Date(parsed.data.to) : undefined }
            : undefined,
          course: actor.role === "TEACHER"
            ? { teacherId: actor.userId }
            : { enrollments: { some: { studentId: actor.userId } } },
        },
      },
      include: { student: { select: { name: true } }, session: { select: { courseId: true, startAt: true } } },
      orderBy: [{ session: { startAt: "asc" } }, { id: "asc" }],
      take: limit,
    });
    return success({ records: records.map((record) => ({
      id: record.id,
      sessionId: record.sessionId,
      courseId: record.session.courseId,
      sessionStartAt: record.session.startAt.toISOString(),
      studentId: record.studentId,
      studentName: record.student.name,
      status: record.status,
      markedAt: record.markedAt.toISOString(),
    })) });
  } catch {
    return failure("INTERNAL", "Could not load attendance. Please try again.");
  }
}

export async function listDeductions(
  actor: Actor,
  input: { courseId?: string; sessionId?: string; studentId?: string },
): Promise<Result<{ records: DeductionView[] }>> {
  if (actor.role !== "TEACHER" && actor.role !== "STUDENT") return failure("FORBIDDEN", "You do not have permission to view deductions.");
  const parsed = deductionListInput.safeParse(input);
  if (!parsed.success) return failure("VALIDATION", "Enter valid deduction filters.");
  try {
    if (parsed.data.courseId) {
      const access = await canReadCourse(actor, parsed.data.courseId);
      if (!access.ok) return access;
    }
    if (parsed.data.sessionId) {
      const access = await canReadSession(actor, parsed.data.sessionId);
      if (!access.ok) return access;
    }
    const records = await prisma.deduction.findMany({
      where: {
        courseId: parsed.data.courseId,
        sessionId: parsed.data.sessionId,
        studentId: actor.role === "STUDENT" ? actor.userId : parsed.data.studentId,
        course: actor.role === "TEACHER"
          ? { teacherId: actor.userId }
          : { enrollments: { some: { studentId: actor.userId } } },
      },
      include: { student: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    return success({ records: records.map((record) => ({
      id: record.id,
      sessionId: record.sessionId,
      courseId: record.courseId,
      studentId: record.studentId,
      studentName: record.student.name,
      amountCents: record.amountCents,
      reason: record.reason,
      createdAt: record.createdAt.toISOString(),
    })) });
  } catch {
    return failure("INTERNAL", "Could not load deductions. Please try again.");
  }
}

function overlaps(startA: Date, durationAMin: number, startB: Date, durationBMin: number): boolean {
  const endA = startA.getTime() + durationAMin * 60_000;
  const endB = startB.getTime() + durationBMin * 60_000;
  return startA.getTime() < endB && endA > startB.getTime();
}

export async function checkConflicts(
  actor: Actor,
  input: z.input<typeof CheckConflictsInput>,
): Promise<Result<{ conflicts: ConflictView[] }>> {
  if (actor.role !== "TEACHER") return failure("FORBIDDEN", "Only teachers can check schedule conflicts.");
  const parsed = CheckConflictsInput.safeParse(input);
  if (!parsed.success) return failure("VALIDATION", "Enter a valid course, start time, and duration.");

  try {
    const course = await prisma.course.findUnique({
      where: { id: parsed.data.courseId },
      select: { id: true, teacherId: true, name: true },
    });
    if (!course) return failure("NOT_FOUND", "Course not found.");
    if (course.teacherId !== actor.userId) return failure("FORBIDDEN", "You do not have access to this course.");

    const startAt = new Date(parsed.data.startAt);
    const [teacherSessions, enrollments] = await Promise.all([
      prisma.session.findMany({
        where: {
          status: { not: "CANCELLED" },
          id: parsed.data.excludeSessionId ? { not: parsed.data.excludeSessionId } : undefined,
          course: { teacherId: actor.userId },
        },
        include: { course: { select: { name: true } } },
      }),
      prisma.enrollment.findMany({
        where: { courseId: course.id },
        select: { studentId: true },
        orderBy: { studentId: "asc" },
      }),
    ]);

    const studentIds = enrollments.map(({ studentId }) => studentId);
    const studentSessions = studentIds.length
      ? await prisma.session.findMany({
          where: {
            status: { not: "CANCELLED" },
            id: parsed.data.excludeSessionId ? { not: parsed.data.excludeSessionId } : undefined,
            courseId: { not: course.id },
            course: { enrollments: { some: { studentId: { in: studentIds } } } },
          },
          include: {
            course: {
              select: {
                name: true,
                enrollments: { where: { studentId: { in: studentIds } }, select: { studentId: true } },
              },
            },
          },
        })
      : [];

    const conflicts = new Map<string, ConflictView>();
    for (const session of teacherSessions) {
      if (!overlaps(startAt, parsed.data.durationMin, session.startAt, session.durationMin)) continue;
      conflicts.set(session.id, {
        sessionId: session.id,
        courseName: session.course.name,
        startAt: session.startAt.toISOString(),
        durationMin: session.durationMin,
      });
    }
    for (const session of studentSessions) {
      if (!overlaps(startAt, parsed.data.durationMin, session.startAt, session.durationMin)) continue;
      const sharedStudentId = session.course.enrollments[0]?.studentId;
      conflicts.set(session.id, {
        sessionId: session.id,
        courseName: session.course.name,
        startAt: session.startAt.toISOString(),
        durationMin: session.durationMin,
        withStudentId: sharedStudentId,
      });
    }
    return success({ conflicts: [...conflicts.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)) });
  } catch {
    return failure("INTERNAL", "Could not check schedule conflicts. Please try again.");
  }
}

const requestListInput = z.object({ status: z.enum(["PENDING", "APPROVED", "DECLINED"]).optional() });

/** Students see their own requests; teachers see the requests for sessions of their own courses. */
export async function listStudentRequests(
  actor: Actor,
  input: { status?: StudentRequestView["status"] } = {},
): Promise<Result<{ requests: StudentRequestView[] }>> {
  if (actor.role !== "TEACHER" && actor.role !== "STUDENT") return failure("FORBIDDEN", "You do not have permission to view requests.");
  const parsed = requestListInput.safeParse(input);
  if (!parsed.success) return failure("VALIDATION", "Enter a valid request status.");
  try {
    const rows = await prisma.studentRequest.findMany({
      where: {
        status: parsed.data.status,
        ...(actor.role === "STUDENT" ? { studentId: actor.userId } : { session: { course: { teacherId: actor.userId } } }),
      },
      include: {
        student: { select: { name: true } },
        session: { select: { startAt: true, courseId: true, course: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit,
    });
    return success({
      requests: rows.map((row) => ({
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
      })),
    });
  } catch {
    return failure("INTERNAL", "Could not load requests. Please try again.");
  }
}
