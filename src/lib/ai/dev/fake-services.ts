import { z } from "zod";
import {
  AddMaterialInput,
  AddStudentInput,
  CheckConflictsInput,
  ConfirmAttendanceInput,
  CreateCourseInput,
  CreateQuizInput,
  CreateSessionsInput,
  CreateUnitInput,
  DashboardLayoutInput,
  KnowledgeBatchInput,
  MAX_LAYOUTS,
  RescheduleInput,
  ResolveStudentRequestInput,
  SaveProgressInput,
  StudentRequestInput,
  err,
  ok,
  type Actor,
  type AttendanceView,
  type ConflictView,
  type CourseView,
  type DashboardLayoutView,
  type KnowledgeView,
  type StudentKnowledgeView,
  type QuizView,
  type DeductionView,
  type ErrorCode,
  type Result,
  type SessionView,
  type ProgressRecordView,
  type StudentRequestView,
  type StudentView,
  type UnitView,
} from "@/contracts";
import {
  nextId,
  store,
  type FakeCourse,
  type FakeSession,
} from "./fake-store";

// In-memory services that follow docs/api-contract.md §5-§6 (names, signatures, rules, messages).
// Every function returns Result<T> and never throws.

const LIMIT = 200;
const id = z.string().min(1);
const range = z.object({ from: z.string().datetime(), to: z.string().datetime() });
const scheduleInput = range.extend({ courseId: id.optional() });
const courseInput = z.object({ courseId: id });
const attendanceFilter = z.object({
  courseId: id.optional(),
  sessionId: id.optional(),
  studentId: id.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.enum(["PRESENT", "LEAVE", "ABSENT"]).optional(),
});
const deductionFilter = z.object({
  courseId: id.optional(),
  sessionId: id.optional(),
  studentId: id.optional(),
});

// ---------- helpers ----------

function fail<T>(code: ErrorCode, message: string, details?: unknown): Result<T> {
  return err(code, message, details);
}

const validationMessage = "The request is not valid.";

function userName(userId: string): string {
  return store.users.find((u) => u.id === userId)?.name ?? "Unknown";
}

function courseView(course: FakeCourse): CourseView {
  return {
    id: course.id,
    name: course.name,
    subject: course.subject,
    type: course.type,
    location: course.location,
    description: course.description,
    teacherName: userName(course.teacherId),
    studentCount: store.enrollments.filter((e) => e.courseId === course.id).length,
  };
}

function sessionView(session: FakeSession): SessionView {
  const course = store.courses.find((c) => c.id === session.courseId)!;
  return {
    id: session.id,
    courseId: session.courseId,
    courseName: course.name,
    startAt: session.startAt,
    durationMin: session.durationMin,
    location: session.location,
    linkUrl: session.linkUrl,
    status: session.status,
    originalStartAt: session.originalStartAt,
  };
}

function bySessionStart(a: FakeSession, b: FakeSession): number {
  return Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id);
}

function enrolledStudentIds(courseId: string): string[] {
  return store.enrollments.filter((e) => e.courseId === courseId).map((e) => e.studentId);
}

/** Teacher owns the course -> ok; student enrolled -> ok; otherwise NOT_FOUND / FORBIDDEN. */
function canReadCourse(actor: Actor, courseId: string): Result<FakeCourse> {
  const course = store.courses.find((c) => c.id === courseId);
  if (!course) return fail("NOT_FOUND", "Course not found.");
  if (actor.role === "TEACHER" && course.teacherId === actor.userId) return ok(course);
  if (
    actor.role === "STUDENT" &&
    store.enrollments.some((e) => e.courseId === courseId && e.studentId === actor.userId)
  ) {
    return ok(course);
  }
  return fail("FORBIDDEN", "You do not have access to this course.");
}

/** Teacher must own the course (write access). */
function ownCourse(actor: Actor, courseId: string): Result<FakeCourse> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can change courses.");
  const course = store.courses.find((c) => c.id === courseId);
  if (!course) return fail("NOT_FOUND", "Course not found.");
  if (course.teacherId !== actor.userId) {
    return fail("FORBIDDEN", "You do not have access to this course.");
  }
  return ok(course);
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

const endMs = (startAt: string, durationMin: number) => Date.parse(startAt) + durationMin * 60_000;

/**
 * Existing sessions overlapping [startAt, startAt+durationMin) for the teacher of `course`
 * and for the students enrolled in it. Cancelled sessions do not occupy time.
 */
function conflictsFor(
  course: FakeCourse,
  startAt: string,
  durationMin: number,
  excludeSessionId?: string,
): ConflictView[] {
  const start = Date.parse(startAt);
  const end = endMs(startAt, durationMin);
  const teacherCourseIds = new Set(
    store.courses.filter((c) => c.teacherId === course.teacherId).map((c) => c.id),
  );
  const students = enrolledStudentIds(course.id);
  const result: ConflictView[] = [];
  for (const session of [...store.sessions].sort(bySessionStart)) {
    if (session.id === excludeSessionId || session.status === "CANCELLED") continue;
    if (!overlaps(start, end, Date.parse(session.startAt), endMs(session.startAt, session.durationMin))) {
      continue;
    }
    const sharedStudent = students.find((studentId) =>
      store.enrollments.some((e) => e.courseId === session.courseId && e.studentId === studentId),
    );
    if (!teacherCourseIds.has(session.courseId) && !sharedStudent) continue;
    result.push({
      sessionId: session.id,
      courseName: store.courses.find((c) => c.id === session.courseId)!.name,
      startAt: session.startAt,
      durationMin: session.durationMin,
      withStudentId: sharedStudent,
    });
  }
  return result;
}

// ---------- read functions (contract §5) ----------

export async function listMyCourses(actor: Actor): Promise<Result<{ courses: CourseView[] }>> {
  if (actor.role !== "TEACHER" && actor.role !== "STUDENT") {
    return fail("FORBIDDEN", "You do not have permission to view courses.");
  }
  const courses = store.courses
    .filter((c) =>
      actor.role === "TEACHER"
        ? c.teacherId === actor.userId
        : store.enrollments.some((e) => e.courseId === c.id && e.studentId === actor.userId),
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, LIMIT);
  return ok({ courses: courses.map(courseView) });
}

export async function getTeacherSchedule(
  actor: Actor,
  input: { from: string; to: string; courseId?: string },
): Promise<Result<{ sessions: SessionView[] }>> {
  if (actor.role !== "TEACHER") {
    return fail("FORBIDDEN", "Only teachers can view the teacher schedule.");
  }
  const parsed = scheduleInput.safeParse(input);
  if (!parsed.success || Date.parse(parsed.data.from) >= Date.parse(parsed.data.to)) {
    return fail("VALIDATION", "Enter a valid start and end time.");
  }
  if (parsed.data.courseId) {
    const access = canReadCourse(actor, parsed.data.courseId);
    if (!access.ok) return access as Result<never>;
  }
  const from = Date.parse(parsed.data.from);
  const to = Date.parse(parsed.data.to);
  const own = new Set(store.courses.filter((c) => c.teacherId === actor.userId).map((c) => c.id));
  const sessions = store.sessions
    .filter(
      (s) =>
        own.has(s.courseId) &&
        (!parsed.data.courseId || s.courseId === parsed.data.courseId) &&
        Date.parse(s.startAt) >= from &&
        Date.parse(s.startAt) < to,
    )
    .sort(bySessionStart)
    .slice(0, LIMIT);
  return ok({ sessions: sessions.map(sessionView) });
}

export async function listMyStudents(
  actor: Actor,
  input: { courseId: string },
): Promise<Result<{ students: StudentView[] }>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can view course rosters.");
  const parsed = courseInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Invalid course ID.");
  const access = canReadCourse(actor, parsed.data.courseId);
  if (!access.ok) return access as Result<never>;
  const students = enrolledStudentIds(parsed.data.courseId)
    .map((studentId) => store.users.find((u) => u.id === studentId)!)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, LIMIT)
    .map(({ id: studentId, name, email }) => ({ id: studentId, name, email }));
  return ok({ students });
}

function attendanceView(record: (typeof store.attendance)[number]): AttendanceView {
  const session = store.sessions.find((s) => s.id === record.sessionId)!;
  return {
    id: record.id,
    sessionId: record.sessionId,
    courseId: session.courseId,
    sessionStartAt: session.startAt,
    studentId: record.studentId,
    studentName: userName(record.studentId),
    status: record.status,
    markedAt: record.markedAt,
  };
}

function deductionView(record: (typeof store.deductions)[number]): DeductionView {
  return {
    id: record.id,
    sessionId: record.sessionId,
    courseId: record.courseId,
    studentId: record.studentId,
    studentName: userName(record.studentId),
    amountCents: record.amountCents,
    reason: record.reason,
    createdAt: record.createdAt,
  };
}

/** Course ids the actor may read records for. */
function readableCourseIds(actor: Actor): Set<string> {
  return new Set(
    store.courses
      .filter((c) =>
        actor.role === "TEACHER"
          ? c.teacherId === actor.userId
          : store.enrollments.some((e) => e.courseId === c.id && e.studentId === actor.userId),
      )
      .map((c) => c.id),
  );
}

export async function listAttendance(
  actor: Actor,
  input: {
    courseId?: string;
    sessionId?: string;
    studentId?: string;
    from?: string;
    to?: string;
    status?: "PRESENT" | "LEAVE" | "ABSENT";
  } = {},
): Promise<Result<{ records: AttendanceView[] }>> {
  const parsed = attendanceFilter.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage);
  const f = parsed.data;
  if (f.courseId) {
    const access = canReadCourse(actor, f.courseId);
    if (!access.ok) return access as Result<never>;
  }
  const courses = readableCourseIds(actor);
  const records = store.attendance
    .filter((r) => {
      const session = store.sessions.find((s) => s.id === r.sessionId)!;
      if (!courses.has(session.courseId)) return false;
      // Students only ever see their own records; a supplied studentId is ignored.
      if (actor.role === "STUDENT" && r.studentId !== actor.userId) return false;
      if (actor.role === "TEACHER" && f.studentId && r.studentId !== f.studentId) return false;
      if (f.courseId && session.courseId !== f.courseId) return false;
      if (f.sessionId && r.sessionId !== f.sessionId) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.from && Date.parse(session.startAt) < Date.parse(f.from)) return false;
      if (f.to && Date.parse(session.startAt) >= Date.parse(f.to)) return false;
      return true;
    })
    .sort(
      (a, b) =>
        Date.parse(store.sessions.find((s) => s.id === a.sessionId)!.startAt) -
          Date.parse(store.sessions.find((s) => s.id === b.sessionId)!.startAt) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, LIMIT);
  return ok({ records: records.map(attendanceView) });
}

export async function listDeductions(
  actor: Actor,
  input: { courseId?: string; sessionId?: string; studentId?: string } = {},
): Promise<Result<{ records: DeductionView[] }>> {
  const parsed = deductionFilter.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage);
  const f = parsed.data;
  if (f.courseId) {
    const access = canReadCourse(actor, f.courseId);
    if (!access.ok) return access as Result<never>;
  }
  const courses = readableCourseIds(actor);
  const records = store.deductions
    .filter((r) => {
      if (!courses.has(r.courseId)) return false;
      if (actor.role === "STUDENT" && r.studentId !== actor.userId) return false;
      if (actor.role === "TEACHER" && f.studentId && r.studentId !== f.studentId) return false;
      if (f.courseId && r.courseId !== f.courseId) return false;
      if (f.sessionId && r.sessionId !== f.sessionId) return false;
      return true;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .slice(0, LIMIT);
  return ok({ records: records.map(deductionView) });
}

export async function getCourseMaterials(
  actor: Actor,
  input: { courseId: string },
): Promise<Result<{ units: UnitView[] }>> {
  const parsed = courseInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Invalid course ID.");
  const access = canReadCourse(actor, parsed.data.courseId);
  if (!access.ok) return access as Result<never>;
  const units = store.units
    .filter((u) => u.courseId === parsed.data.courseId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .slice(0, LIMIT);
  return ok({
    units: units.map((unit) => ({
      id: unit.id,
      courseId: unit.courseId,
      title: unit.title,
      order: unit.order,
      materials: store.materials
        .filter((m) => m.unitId === unit.id)
        .map((m) => ({
          id: m.id,
          unitId: m.unitId,
          title: m.title,
          kind: m.kind,
          content: m.content,
          url: m.url,
        })),
    })),
  });
}

export async function getStudentMemory(
  actor: Actor,
  input: { courseId: string; studentId?: string },
): Promise<Result<{ memories: typeof store.memories }>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can view student memory.");
  const course = store.courses.find((item) => item.id === input.courseId && item.teacherId === actor.userId);
  if (!course) return fail("FORBIDDEN", "You do not have access to this course.");
  if (input.studentId && !store.enrollments.some((item) => item.courseId === course.id && item.studentId === input.studentId)) {
    return fail("NOT_FOUND", "Student is not enrolled in this course.");
  }
  return ok({ memories: store.memories.filter((memory) => memory.courseId === course.id && memory.teacherId === actor.userId && (!input.studentId || memory.studentId === input.studentId)) });
}

export async function saveStudentMemory(
  actor: Actor,
  input: { courseId: string; studentId: string; kind: "AVAILABILITY" | "NOTE"; content: string },
): Promise<Result<{ memoryId: string }>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can save student memory.");
  const course = store.courses.find((item) => item.id === input.courseId && item.teacherId === actor.userId);
  if (!course || !store.enrollments.some((item) => item.courseId === course.id && item.studentId === input.studentId)) {
    return fail("FORBIDDEN", "You do not have access to this student in this course.");
  }
  const memory = {
    id: nextId("mem"),
    courseId: course.id,
    studentId: input.studentId,
    teacherId: actor.userId,
    kind: input.kind,
    content: input.content,
    createdAt: new Date().toISOString(),
  };
  store.memories.push(memory);
  return ok({ memoryId: memory.id });
}

export async function checkConflicts(
  actor: Actor,
  input: { courseId: string; startAt: string; durationMin: number; excludeSessionId?: string },
): Promise<Result<{ conflicts: ConflictView[] }>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can check conflicts.");
  const parsed = CheckConflictsInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage);
  const course = ownCourse(actor, parsed.data.courseId);
  if (!course.ok) return course as Result<never>;
  return ok({
    conflicts: conflictsFor(
      course.data,
      parsed.data.startAt,
      parsed.data.durationMin,
      parsed.data.excludeSessionId,
    ),
  });
}

export async function getStudentWorkspace(
  actor: Actor,
  input: { from: string; to: string },
): Promise<
  Result<{ courses: CourseView[]; sessions: SessionView[]; attendance: AttendanceView[] }>
> {
  if (actor.role !== "STUDENT") {
    return fail("FORBIDDEN", "Only students can view the student workspace.");
  }
  const parsed = range.safeParse(input);
  if (!parsed.success || Date.parse(parsed.data.from) >= Date.parse(parsed.data.to)) {
    return fail("VALIDATION", "Enter a valid start and end time.");
  }
  const from = Date.parse(parsed.data.from);
  const to = Date.parse(parsed.data.to);
  const mine = readableCourseIds(actor);
  return ok({
    courses: store.courses
      .filter((c) => mine.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .slice(0, LIMIT)
      .map(courseView),
    sessions: store.sessions
      .filter(
        (s) => mine.has(s.courseId) && Date.parse(s.startAt) >= from && Date.parse(s.startAt) < to,
      )
      .sort(bySessionStart)
      .slice(0, LIMIT)
      .map(sessionView),
    attendance: store.attendance
      .filter((r) => {
        if (r.studentId !== actor.userId) return false;
        const session = store.sessions.find((s) => s.id === r.sessionId)!;
        return (
          mine.has(session.courseId) &&
          Date.parse(session.startAt) >= from &&
          Date.parse(session.startAt) < to
        );
      })
      .slice(0, LIMIT)
      .map(attendanceView),
  });
}

// ---------- write functions (contract §6) ----------

export async function createCourse(
  actor: Actor,
  input: z.input<typeof CreateCourseInput>,
): Promise<Result<{ courseId: string }>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can create courses.");
  const parsed = CreateCourseInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage, parsed.error.issues);
  const course: FakeCourse = { id: nextId("c"), teacherId: actor.userId, ...parsed.data };
  store.courses.push(course);
  return ok({ courseId: course.id });
}

export async function addExistingStudentToCourse(
  actor: Actor,
  input: { courseId: string; email: string },
): Promise<Result<{ enrollmentId: string; alreadyJoined: boolean }>> {
  const parsed = AddStudentInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage);
  const course = ownCourse(actor, parsed.data.courseId);
  if (!course.ok) return course as Result<never>;
  const student = store.users.find(
    (u) => u.role === "STUDENT" && u.email.toLowerCase() === parsed.data.email.toLowerCase(),
  );
  if (!student) return fail("NOT_FOUND", "No student account is registered with this email.");
  const existing = store.enrollments.find(
    (e) => e.courseId === course.data.id && e.studentId === student.id,
  );
  if (existing) return ok({ enrollmentId: existing.id, alreadyJoined: true });
  const enrollment = { id: nextId("e"), courseId: course.data.id, studentId: student.id };
  store.enrollments.push(enrollment);
  return ok({ enrollmentId: enrollment.id, alreadyJoined: false });
}

export async function createSessions(
  actor: Actor,
  input: z.input<typeof CreateSessionsInput>,
): Promise<Result<{ sessionIds: string[] }>> {
  const parsed = CreateSessionsInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage, parsed.error.issues);
  const course = ownCourse(actor, parsed.data.courseId);
  if (!course.ok) return course as Result<never>;

  // Check every session first (against existing sessions and within the batch); write nothing on conflict.
  const conflicts: ConflictView[] = [];
  const batch = parsed.data.sessions;
  batch.forEach((item, index) => {
    conflicts.push(...conflictsFor(course.data, item.startAt, item.durationMin));
    batch.forEach((other, otherIndex) => {
      if (
        otherIndex > index &&
        overlaps(
          Date.parse(item.startAt),
          endMs(item.startAt, item.durationMin),
          Date.parse(other.startAt),
          endMs(other.startAt, other.durationMin),
        )
      ) {
        conflicts.push({
          sessionId: `batch-${otherIndex}`,
          courseName: course.data.name,
          startAt: other.startAt,
          durationMin: other.durationMin,
        });
      }
    });
  });
  if (conflicts.length > 0) {
    return fail(
      "CONFLICT",
      `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} found. The schedule was not changed.`,
      conflicts,
    );
  }
  const created = batch.map((item) => ({
    id: nextId("s"),
    courseId: course.data.id,
    startAt: item.startAt,
    durationMin: item.durationMin,
    location: item.location,
    linkUrl: item.linkUrl,
    status: "SCHEDULED" as const,
  }));
  store.sessions.push(...created);
  return ok({ sessionIds: created.map((s) => s.id) });
}

export async function createCourseUnit(
  actor: Actor,
  input: { courseId: string; title: string; order?: number },
): Promise<Result<{ unitId: string }>> {
  const parsed = CreateUnitInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage);
  const course = ownCourse(actor, parsed.data.courseId);
  if (!course.ok) return course as Result<never>;
  const maxOrder = Math.max(
    0,
    ...store.units.filter((u) => u.courseId === course.data.id).map((u) => u.order),
  );
  const unit = {
    id: nextId("unit"),
    courseId: course.data.id,
    title: parsed.data.title,
    order: parsed.data.order ?? maxOrder + 1,
  };
  store.units.push(unit);
  return ok({ unitId: unit.id });
}

export async function addMaterial(
  actor: Actor,
  input: z.input<typeof AddMaterialInput>,
): Promise<Result<{ materialId: string }>> {
  const parsed = AddMaterialInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage, parsed.error.issues);
  const unit = store.units.find((u) => u.id === parsed.data.unitId);
  if (!unit) return fail("NOT_FOUND", "Unit not found.");
  const course = ownCourse(actor, unit.courseId);
  if (!course.ok) return course as Result<never>;
  const material = {
    id: nextId("mat"),
    unitId: unit.id,
    title: parsed.data.title,
    kind: parsed.data.kind,
    content: parsed.data.content,
    url: parsed.data.url,
  };
  store.materials.push(material);
  return ok({ materialId: material.id });
}

type AttendanceResult = {
  attendance: AttendanceView[];
  deductions: DeductionView[];
  sessionStatus: "COMPLETED";
};

function existingAttendanceResult(sessionId: string): AttendanceResult {
  return {
    attendance: store.attendance.filter((r) => r.sessionId === sessionId).map(attendanceView),
    deductions: store.deductions.filter((r) => r.sessionId === sessionId).map(deductionView),
    sessionStatus: "COMPLETED",
  };
}

export async function confirmAttendance(
  actor: Actor,
  input: z.input<typeof ConfirmAttendanceInput>,
): Promise<Result<AttendanceResult>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can take attendance.");
  const parsed = ConfirmAttendanceInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage, parsed.error.issues);
  const session = store.sessions.find((s) => s.id === parsed.data.sessionId);
  if (!session) return fail("NOT_FOUND", "Session not found.");
  const course = ownCourse(actor, session.courseId);
  if (!course.ok) return course as Result<never>;

  // Repeated call on a completed session: same statuses return the stored result (no new writes).
  const stored = store.attendance.filter((r) => r.sessionId === session.id);
  if (session.status === "COMPLETED" && stored.length > 0) {
    const same =
      stored.length === parsed.data.records.length &&
      parsed.data.records.every((r) =>
        stored.some((s) => s.studentId === r.studentId && s.status === r.status),
      );
    return same
      ? ok(existingAttendanceResult(session.id))
      : fail("CONFLICT", "Attendance has been submitted and cannot be changed yet.");
  }
  if (session.status !== "SCHEDULED" && session.status !== "RESCHEDULED") {
    return fail("CONFLICT", "This session is already completed or cancelled.");
  }

  const enrolled = enrolledStudentIds(course.data.id);
  const submitted = parsed.data.records.map((r) => r.studentId);
  if (new Set(submitted).size !== submitted.length) {
    return fail("VALIDATION", "Each student can only appear once in the attendance records.");
  }
  if (submitted.some((studentId) => !enrolled.includes(studentId))) {
    return fail("VALIDATION", "Attendance can only be recorded for students enrolled in this course.");
  }
  const missing = enrolled.filter((studentId) => !submitted.includes(studentId));
  if (missing.length > 0) {
    return fail(
      "VALIDATION",
      `Attendance is still missing for ${missing.length} ${missing.length === 1 ? "student" : "students"}.`,
    );
  }

  // All checks passed: write everything (the in-memory equivalent of one transaction).
  const now = new Date().toISOString();
  for (const record of parsed.data.records) {
    store.attendance.push({
      id: nextId("att"),
      sessionId: session.id,
      studentId: record.studentId,
      status: record.status,
      markedById: actor.userId,
      markedAt: now,
    });
    if (record.status !== "LEAVE") {
      store.deductions.push({
        id: nextId("ded"),
        sessionId: session.id,
        studentId: record.studentId,
        courseId: course.data.id,
        amountCents: course.data.pricePerSessionCents,
        reason: record.status,
        createdAt: now,
      });
    }
  }
  store.sessionChanges.push({
    id: nextId("chg"),
    sessionId: session.id,
    changedById: actor.userId,
    fromStatus: session.status,
    toStatus: "COMPLETED",
    createdAt: now,
  });
  session.status = "COMPLETED";
  return ok(existingAttendanceResult(session.id));
}

export async function rescheduleSession(
  actor: Actor,
  input: z.input<typeof RescheduleInput>,
): Promise<Result<{ sessionId: string; oldStartAt: string; newStartAt: string }>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can reschedule sessions.");
  const parsed = RescheduleInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage);
  const session = store.sessions.find((s) => s.id === parsed.data.sessionId);
  if (!session) return fail("NOT_FOUND", "Session not found.");
  const course = ownCourse(actor, session.courseId);
  if (!course.ok) return course as Result<never>;
  if (session.status !== "SCHEDULED" && session.status !== "RESCHEDULED") {
    return fail("CONFLICT", "This session is already completed or cancelled.");
  }
  const conflicts = conflictsFor(course.data, parsed.data.newStartAt, session.durationMin, session.id);
  if (conflicts.length > 0) {
    return fail("CONFLICT", "The new time conflicts with another session. The schedule was not changed.", conflicts);
  }
  const oldStartAt = session.startAt;
  store.sessionChanges.push({
    id: nextId("chg"),
    sessionId: session.id,
    changedById: actor.userId,
    fromStatus: session.status,
    toStatus: "RESCHEDULED",
    oldStartAt,
    newStartAt: parsed.data.newStartAt,
    createdAt: new Date().toISOString(),
  });
  session.originalStartAt ??= oldStartAt;
  session.startAt = parsed.data.newStartAt;
  session.status = "RESCHEDULED";
  return ok({ sessionId: session.id, oldStartAt, newStartAt: parsed.data.newStartAt });
}

export async function getMyProfile(
  actor: Actor,
): Promise<Result<{ profile: { name: string; email: string; role: Actor["role"] } }>> {
  const user = store.users.find((u) => u.id === actor.userId);
  if (!user) return fail("NOT_FOUND", "Account not found.");
  return ok({ profile: { name: user.name, email: user.email, role: user.role } });
}

// ---------- student requests ----------

function requestView(request: (typeof store.requests)[number]): StudentRequestView | undefined {
  const session = store.sessions.find((s) => s.id === request.sessionId);
  const course = session && store.courses.find((c) => c.id === session.courseId);
  const student = store.users.find((u) => u.id === request.studentId);
  if (!session || !course || !student) return undefined;
  return {
    id: request.id,
    sessionId: request.sessionId,
    courseId: course.id,
    courseName: course.name,
    sessionStartAt: session.startAt,
    studentId: student.id,
    studentName: student.name,
    kind: request.kind,
    ...(request.note ? { note: request.note } : {}),
    ...(request.preferredStartAt ? { preferredStartAt: request.preferredStartAt } : {}),
    status: request.status,
    createdAt: request.createdAt,
    ...(request.resolvedAt ? { resolvedAt: request.resolvedAt } : {}),
  };
}

export async function submitStudentRequest(
  actor: Actor,
  input: z.input<typeof StudentRequestInput>,
): Promise<Result<StudentRequestView>> {
  if (actor.role !== "STUDENT") return fail("FORBIDDEN", "Only students can submit requests.");
  const parsed = StudentRequestInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage);
  const { sessionId, kind, note, preferredStartAt } = parsed.data;
  if (kind === "LEAVE" && preferredStartAt) return fail("VALIDATION", "A leave request does not take a preferred time.");
  if (preferredStartAt && Date.parse(preferredStartAt) <= Date.now()) return fail("VALIDATION", "The preferred time must be in the future.");
  const session = store.sessions.find((s) => s.id === sessionId);
  const enrolled = session && store.enrollments.some((e) => e.courseId === session.courseId && e.studentId === actor.userId);
  if (!session || !enrolled) return fail("FORBIDDEN", "You do not have access to this session.");
  if (session.status !== "SCHEDULED" && session.status !== "RESCHEDULED") return fail("CONFLICT", "Only upcoming sessions can be requested.");
  if (Date.parse(session.startAt) <= Date.now()) return fail("CONFLICT", "This session has already started.");
  if (store.requests.some((r) => r.sessionId === sessionId && r.studentId === actor.userId && r.status === "PENDING")) {
    return fail("CONFLICT", "You already have a pending request for this session.");
  }
  const created = {
    id: nextId("req"),
    sessionId,
    studentId: actor.userId,
    kind,
    ...(note?.trim() ? { note: note.trim() } : {}),
    ...(preferredStartAt ? { preferredStartAt } : {}),
    status: "PENDING" as const,
    createdAt: new Date().toISOString(),
  };
  store.requests.push(created);
  return ok(requestView(created)!);
}

export async function listStudentRequests(
  actor: Actor,
  input: { status?: "PENDING" | "APPROVED" | "DECLINED" } = {},
): Promise<Result<{ requests: StudentRequestView[] }>> {
  const rows = store.requests.filter((request) => {
    if (input.status && request.status !== input.status) return false;
    if (actor.role === "STUDENT") return request.studentId === actor.userId;
    const session = store.sessions.find((s) => s.id === request.sessionId);
    const course = session && store.courses.find((c) => c.id === session.courseId);
    return course?.teacherId === actor.userId;
  });
  return ok({ requests: rows.map(requestView).filter((v): v is StudentRequestView => v !== undefined).reverse() });
}

export async function resolveStudentRequest(
  actor: Actor,
  input: z.input<typeof ResolveStudentRequestInput>,
): Promise<Result<StudentRequestView>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can respond to requests.");
  const parsed = ResolveStudentRequestInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage);
  const request = store.requests.find((r) => r.id === parsed.data.requestId);
  if (!request) return fail("NOT_FOUND", "Request not found.");
  const session = store.sessions.find((s) => s.id === request.sessionId);
  const course = session && store.courses.find((c) => c.id === session.courseId);
  if (!course || course.teacherId !== actor.userId) return fail("FORBIDDEN", "You do not have access to this request.");
  if (request.status !== "PENDING") return fail("CONFLICT", "This request has already been answered.");
  request.status = parsed.data.decision;
  request.resolvedAt = new Date().toISOString();
  return ok(requestView(request)!);
}

// ---------- progress records ----------

function progressView(record: (typeof store.progress)[number], includeNote: boolean): ProgressRecordView | undefined {
  const session = store.sessions.find((s) => s.id === record.sessionId);
  const course = session && store.courses.find((c) => c.id === session.courseId);
  const student = store.users.find((u) => u.id === record.studentId);
  if (!session || !course || !student) return undefined;
  return {
    id: record.id,
    sessionId: session.id,
    courseId: course.id,
    courseName: course.name,
    sessionStartAt: session.startAt,
    studentId: student.id,
    studentName: student.name,
    goal: record.goal,
    output: record.output,
    ...(record.issue ? { issue: record.issue } : {}),
    nextAction: record.nextAction,
    ...(includeNote && record.note ? { note: record.note } : {}),
    updatedAt: record.updatedAt,
  };
}

export async function saveProgressRecord(
  actor: Actor,
  input: z.input<typeof SaveProgressInput>,
): Promise<Result<ProgressRecordView>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can save progress records.");
  const parsed = SaveProgressInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", validationMessage);
  const data = parsed.data;
  const session = store.sessions.find((s) => s.id === data.sessionId);
  const course = session && store.courses.find((c) => c.id === session.courseId);
  if (!session || !course || course.teacherId !== actor.userId) return fail("FORBIDDEN", "You do not have access to this session.");
  if (!store.enrollments.some((e) => e.courseId === course.id && e.studentId === data.studentId)) {
    return fail("NOT_FOUND", "That student is not enrolled in this course.");
  }
  if (session.status === "CANCELLED") return fail("CONFLICT", "This session was cancelled.");
  if (Date.parse(session.startAt) > Date.now() && session.status !== "COMPLETED") {
    return fail("CONFLICT", "Progress can be saved once the session has started.");
  }
  const values = {
    goal: data.goal.trim(),
    output: data.output.trim(),
    ...(data.issue?.trim() ? { issue: data.issue.trim() } : {}),
    nextAction: data.nextAction,
    ...(data.note?.trim() ? { note: data.note.trim() } : {}),
    updatedAt: new Date().toISOString(),
  };
  const existing = store.progress.find((p) => p.sessionId === data.sessionId && p.studentId === data.studentId);
  let record = existing;
  if (existing) {
    delete existing.issue;
    delete existing.note;
    Object.assign(existing, values);
  } else {
    record = { id: nextId("prog"), sessionId: data.sessionId, studentId: data.studentId, teacherId: actor.userId, ...values };
    store.progress.push(record);
  }
  return ok(progressView(record!, true)!);
}

export async function listProgressRecords(
  actor: Actor,
  input: { courseId?: string; studentId?: string; sessionId?: string } = {},
): Promise<Result<{ records: ProgressRecordView[] }>> {
  const rows = store.progress.filter((record) => {
    if (input.studentId && actor.role === "TEACHER" && record.studentId !== input.studentId) return false;
    if (input.sessionId && record.sessionId !== input.sessionId) return false;
    const session = store.sessions.find((s) => s.id === record.sessionId);
    const course = session && store.courses.find((c) => c.id === session.courseId);
    if (!course) return false;
    if (input.courseId && course.id !== input.courseId) return false;
    return actor.role === "STUDENT" ? record.studentId === actor.userId : course.teacherId === actor.userId;
  });
  return ok({
    records: rows
      .map((record) => progressView(record, actor.role === "TEACHER"))
      .filter((v): v is ProgressRecordView => v !== undefined)
      .sort((a, b) => Date.parse(b.sessionStartAt) - Date.parse(a.sessionStartAt)),
  });
}

// ---------- dashboard layouts (contract v0.7) ----------

function layoutView(row: (typeof store.layouts)[number], activeId: string | null): DashboardLayoutView {
  return { id: row.id, name: row.name, theme: row.theme as DashboardLayoutView["theme"], motion: row.motion as DashboardLayoutView["motion"], items: row.items as DashboardLayoutView["items"], isActive: row.id === activeId, updatedAt: row.updatedAt };
}

export async function listMyLayouts(actor: Actor): Promise<Result<{ layouts: DashboardLayoutView[] }>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers have a customisable home page.");
  const rows = store.layouts.filter((row) => row.teacherId === actor.userId).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  const activeId = rows.find((row) => row.lastUsedAt > 0)?.id ?? null;
  return ok({ layouts: rows.map((row) => layoutView(row, activeId)) });
}

export async function getActiveLayout(actor: Actor): Promise<Result<{ layout: DashboardLayoutView | null }>> {
  const all = await listMyLayouts(actor);
  if (!all.ok) return all as Result<never>;
  return ok({ layout: all.data.layouts.find((layout) => layout.isActive) ?? null });
}

export async function saveDashboardLayout(actor: Actor, input: z.input<typeof DashboardLayoutInput>): Promise<Result<DashboardLayoutView>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers have a customisable home page.");
  const parsed = DashboardLayoutInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "That layout is not valid.");
  const layout = parsed.data;
  const courseIds = new Set(layout.items.flatMap((item) => (item.courseId ? [item.courseId] : [])));
  for (const courseId of courseIds) {
    if (!store.courses.some((c) => c.id === courseId && c.teacherId === actor.userId)) return fail("FORBIDDEN", "A widget points at a course you do not teach.");
  }
  const studentIds = new Set(layout.items.flatMap((item) => (item.studentId ? [item.studentId] : [])));
  for (const studentId of studentIds) {
    const mine = store.enrollments.some((e) => e.studentId === studentId && store.courses.some((c) => c.id === e.courseId && c.teacherId === actor.userId));
    if (!mine) return fail("FORBIDDEN", "A widget points at a student who is not in your courses.");
  }
  const now = Date.now();
  const existing = store.layouts.find((row) => row.teacherId === actor.userId && row.name === layout.name);
  if (!existing && store.layouts.filter((row) => row.teacherId === actor.userId).length >= MAX_LAYOUTS) return fail("CONFLICT", `You can keep up to ${MAX_LAYOUTS} layouts. Delete one first.`);
  const row = existing ?? { id: nextId("l"), teacherId: actor.userId, name: layout.name, theme: layout.theme, motion: layout.motion, items: layout.items as unknown[], lastUsedAt: now, updatedAt: new Date(now).toISOString() };
  if (existing) Object.assign(existing, { theme: layout.theme, motion: layout.motion, items: layout.items, lastUsedAt: now, updatedAt: new Date(now).toISOString() });
  else store.layouts.push(row);
  return ok(layoutView(row, row.id));
}

// ---------- quizzes (contract v0.7) ----------

export async function createQuiz(actor: Actor, input: z.input<typeof CreateQuizInput>): Promise<Result<{ quizId: string; questionCount: number }>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can create quizzes.");
  const parsed = CreateQuizInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "That quiz is not valid.");
  const course = ownCourse(actor, parsed.data.courseId);
  if (!course.ok) return course as Result<never>;
  const own = new Set(store.materials.filter((m) => store.units.some((u) => u.id === m.unitId && u.courseId === course.data.id)).map((m) => m.id));
  if (parsed.data.questions.some((q) => q.sourceMaterialId && !own.has(q.sourceMaterialId))) return fail("VALIDATION", "A question cites a material that is not in this course.");
  const quiz = { id: nextId("q"), courseId: course.data.id, title: parsed.data.title, published: false, createdAt: new Date().toISOString(), questions: parsed.data.questions.map((q, index) => ({ id: nextId("qq"), order: index + 1, ...q })) };
  store.quizzes.push(quiz);
  return ok({ quizId: quiz.id, questionCount: quiz.questions.length });
}

export async function listMyQuizzes(actor: Actor, input: { courseId?: string } = {}): Promise<Result<{ quizzes: QuizView[] }>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can view quiz answer keys.");
  const mine = store.quizzes.filter((q) => store.courses.some((c) => c.id === q.courseId && c.teacherId === actor.userId) && (!input.courseId || q.courseId === input.courseId));
  return ok({ quizzes: mine.map((q) => ({ id: q.id, courseId: q.courseId, courseName: store.courses.find((c) => c.id === q.courseId)?.name ?? "", title: q.title, published: q.published, createdAt: q.createdAt, questions: q.questions as unknown as QuizView["questions"] })) });
}

// ---------- teaching knowledge (contract v0.7) ----------

function knowledgeView(row: (typeof store.knowledge)[number]): KnowledgeView {
  const course = row.courseId ? store.courses.find((c) => c.id === row.courseId) : undefined;
  return { id: row.id, ...(row.courseId ? { courseId: row.courseId, courseName: course?.name } : {}), kind: row.kind as KnowledgeView["kind"], title: row.title, content: row.content, updatedAt: row.updatedAt };
}

export async function saveKnowledgeEntries(actor: Actor, input: z.input<typeof KnowledgeBatchInput>): Promise<Result<{ saved: number; entryIds: string[] }>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can write teaching notes.");
  const parsed = KnowledgeBatchInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those notes are not valid.");
  for (const entry of parsed.data.entries) {
    if (entry.courseId && !store.courses.some((c) => c.id === entry.courseId && c.teacherId === actor.userId)) return fail("FORBIDDEN", "A note points at a course you do not teach.");
    if (entry.id && !store.knowledge.some((k) => k.id === entry.id && k.teacherId === actor.userId)) return fail("NOT_FOUND", "A note you are editing was not found.");
  }
  const now = new Date().toISOString();
  const ids = parsed.data.entries.map((entry) => {
    const existing = entry.id ? store.knowledge.find((k) => k.id === entry.id) : undefined;
    if (existing) {
      Object.assign(existing, { courseId: entry.courseId, kind: entry.kind, title: entry.title, content: entry.content, updatedAt: now });
      return existing.id;
    }
    const row = { id: nextId("k"), teacherId: actor.userId, courseId: entry.courseId, kind: entry.kind, title: entry.title, content: entry.content, updatedAt: now };
    store.knowledge.push(row);
    return row.id;
  });
  return ok({ saved: ids.length, entryIds: ids });
}

export async function listMyKnowledge(actor: Actor, input: { courseId?: string } = {}): Promise<Result<{ entries: KnowledgeView[] }>> {
  if (actor.role !== "TEACHER") return fail("FORBIDDEN", "Only teachers can view their teaching notes.");
  return ok({ entries: store.knowledge.filter((k) => k.teacherId === actor.userId && (!input.courseId || !k.courseId || k.courseId === input.courseId)).map(knowledgeView) });
}

export async function listKnowledgeForStudent(actor: Actor, input: { courseId?: string; includeStyle?: boolean } = {}): Promise<Result<{ entries: StudentKnowledgeView[] }>> {
  if (actor.role !== "STUDENT") return fail("FORBIDDEN", "Only students can read their teachers' notes this way.");
  const courseIds = new Set(store.enrollments.filter((e) => e.studentId === actor.userId && (!input.courseId || e.courseId === input.courseId)).map((e) => e.courseId));
  const teacherIds = new Set(store.courses.filter((c) => courseIds.has(c.id)).map((c) => c.teacherId));
  const rows = store.knowledge.filter((k) => (k.courseId ? courseIds.has(k.courseId) : teacherIds.has(k.teacherId)) && (input.includeStyle || k.kind !== "TEACHING_STYLE"));
  return ok({ entries: rows.map((row) => ({ ...knowledgeView(row), teacherName: store.users.find((u) => u.id === row.teacherId)?.name ?? "Your teacher" })) });
}
