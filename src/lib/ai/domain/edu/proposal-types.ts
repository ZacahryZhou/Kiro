import {
  ProposalPayloadSchemas,
  err,
  ok,
  type Actor,
  type ConflictView,
  type ProposalPayloads,
  type Result,
} from "@/contracts";
import { createMemoryProposalStore } from "../../core/proposal-store";
import { prismaProposalStore } from "../../core/prisma-proposal-store";
import { createProposalService, type ProposalRegistry } from "../../core/proposals";
import { describeInstant } from "../../core/time";
import { useRealBackend } from "../../runtime";
import * as services from "../../services";

// Maps each proposal type to its payload schema, the service function that runs on confirmation,
// and a code-generated preview. "Re-skinning" the agent for another domain replaces this file.

const STATUS_LABEL = { PRESENT: "Present", LEAVE: "Leave", ABSENT: "Absent" } as const;

/** Charges follow contract 6.1: present and absent cost one session, leave costs none. */
export function sessionsDeducted(status: "PRESENT" | "LEAVE" | "ABSENT"): number {
  return status === "LEAVE" ? 0 : 1;
}

async function describeAttendance(
  actor: Actor,
  payload: ProposalPayloads["MARK_ATTENDANCE"],
): Promise<string[]> {
  const now = Date.now();
  const schedule = await services.getTeacherSchedule(actor, {
    from: new Date(now - 90 * 86_400_000).toISOString(),
    to: new Date(now + 90 * 86_400_000).toISOString(),
  });
  const session = schedule.ok ? schedule.data.sessions.find((s) => s.id === payload.sessionId) : undefined;
  const roster = session ? await services.listMyStudents(actor, { courseId: session.courseId }) : undefined;
  const names = new Map(roster?.ok ? roster.data.students.map((s) => [s.id, s.name]) : []);
  const when = session ? describeInstant(session.startAt) : undefined;
  return [
    session && when ? `${session.courseName}, ${when.weekday} ${when.localDate} ${when.localTime}` : "Attendance",
    ...payload.records.map((r) => {
      const n = sessionsDeducted(r.status);
      return `${names.get(r.studentId) ?? r.studentId}: ${STATUS_LABEL[r.status]} (${n} ${n === 1 ? "session" : "sessions"} deducted)`;
    }),
  ];
}


// ---------- create course ----------

const COURSE_TYPE_LABEL = { ONE_ON_ONE: "One-on-one", SMALL_CLASS: "Small class" } as const;

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export type StudentOutcome = {
  email: string;
  status: "ADDED" | "ALREADY_JOINED" | "NOT_REGISTERED" | "FAILED";
  message?: string;
};

async function describeCourse(_actor: Actor, payload: ProposalPayloads["CREATE_COURSE"]): Promise<string[]> {
  const { course, studentEmails } = payload;
  return [
    `New course: ${course.name}`,
    `${COURSE_TYPE_LABEL[course.type]}, ${course.subject}`,
    `Price per session: ${money(course.pricePerSessionCents)}`,
    studentEmails.length > 0 ? `Students to add: ${studentEmails.join(", ")}` : "No students yet",
  ];
}

/** Creating the course is not rolled back if a student cannot be added: each email gets its own outcome. */
async function executeCourse(
  actor: Actor,
  payload: ProposalPayloads["CREATE_COURSE"],
): Promise<Result<{ courseId: string; students: StudentOutcome[] }>> {
  const created = await services.createCourse(actor, payload.course);
  if (!created.ok) return created;
  const students: StudentOutcome[] = [];
  for (const email of payload.studentEmails) {
    const added = await services.addExistingStudentToCourse(actor, { courseId: created.data.courseId, email });
    if (added.ok) {
      students.push({ email, status: added.data.alreadyJoined ? "ALREADY_JOINED" : "ADDED" });
    } else {
      students.push({
        email,
        status: added.error.code === "NOT_FOUND" ? "NOT_REGISTERED" : "FAILED",
        message: added.error.message,
      });
    }
  }
  return ok({ courseId: created.data.courseId, students });
}

// ---------- create sessions ----------

async function courseName(actor: Actor, courseId: string): Promise<string | undefined> {
  const courses = await services.listMyCourses(actor);
  return courses.ok ? courses.data.courses.find((c) => c.id === courseId)?.name : undefined;
}

async function describeSessions(actor: Actor, payload: ProposalPayloads["CREATE_SESSIONS"]): Promise<string[]> {
  return [
    `${(await courseName(actor, payload.courseId)) ?? "Course"}: ${payload.sessions.length} ${payload.sessions.length === 1 ? "session" : "sessions"}`,
    ...payload.sessions.map((s) => {
      const when = describeInstant(s.startAt);
      return `\u2705 ${when.weekday} ${when.localDate} ${when.localTime} (${s.durationMin} min, no conflicts)`;
    }),
  ];
}

/** Turns a conflict from the service into a message the teacher can read (contract section 6.3, stage 2). */
async function executeSessions(
  actor: Actor,
  payload: ProposalPayloads["CREATE_SESSIONS"],
): Promise<Result<{ sessionIds: string[] }>> {
  const result = await services.createSessions(actor, payload);
  if (result.ok || result.error.code !== "CONFLICT" || !Array.isArray(result.error.details)) return result;
  const lines = (result.error.details as ConflictView[]).map((c) => {
    const when = describeInstant(c.startAt);
    return `"${c.courseName}" on ${when.weekday} ${when.localDate} ${when.localTime}`;
  });
  return err(
    "CONFLICT",
    `The new sessions conflict with ${lines.join("; ")}. The schedule was not changed.`,
    result.error.details,
  );
}

// ---------- add course content ----------

async function describeContent(_actor: Actor, payload: ProposalPayloads["ADD_CONTENT"]): Promise<string[]> {
  return [
    `Add unit: ${payload.unit.title}`,
    `${payload.materials.length} ${payload.materials.length === 1 ? "material" : "materials"}`,
    ...payload.materials.map((material) => {
      const body = material.kind === "TEXT" ? material.content : material.url;
      const excerpt = body?.slice(0, 1200) ?? "";
      const clipped = (body?.length ?? 0) > 1200;
      return `${material.kind}: ${material.title}${excerpt ? ` — ${excerpt}${clipped ? " … (preview shortened)" : ""}` : ""}`;
    }),
  ];
}

async function executeContent(
  actor: Actor,
  payload: ProposalPayloads["ADD_CONTENT"],
): Promise<Result<{ unitId: string; materialIds: string[] }>> {
  const unit = await services.createCourseUnit(actor, {
    courseId: payload.courseId,
    title: payload.unit.title,
    order: payload.unit.order,
  });
  if (!unit.ok) return unit;
  const materialIds: string[] = [];
  for (const material of payload.materials) {
    const created = await services.addMaterial(actor, { unitId: unit.data.unitId, ...material });
    if (!created.ok) return created;
    materialIds.push(created.data.materialId);
  }
  return ok({ unitId: unit.data.unitId, materialIds });
}

async function executeStudentNote(
  actor: Actor,
  payload: ProposalPayloads["ADD_STUDENT_NOTE"],
): Promise<Result<{ memoryId: string }>> {
  return services.saveStudentMemory(actor, payload);
}

async function executeAddStudent(
  actor: Actor,
  payload: ProposalPayloads["ADD_STUDENT"],
): Promise<Result<{ enrollmentId: string; alreadyJoined: boolean }>> {
  return services.addExistingStudentToCourse(actor, payload);
}

async function findSession(actor: Actor, sessionId: string) {
  const now = Date.now();
  const schedule = await services.getTeacherSchedule(actor, {
    from: new Date(now - 365 * 86_400_000).toISOString(),
    to: new Date(now + 1095 * 86_400_000).toISOString(),
  });
  return schedule.ok ? schedule.data.sessions.find((x) => x.id === sessionId) : undefined;
}

/** Turns a conflict from the service into a message the teacher can read (contract section 6.3, stage 2). */
async function executeReschedule(
  actor: Actor,
  payload: ProposalPayloads["RESCHEDULE"],
): Promise<Result<{ sessionId: string; oldStartAt: string; newStartAt: string }>> {
  const result = await services.rescheduleSession(actor, payload);
  if (result.ok || result.error.code !== "CONFLICT" || !Array.isArray(result.error.details)) return result;
  const lines = (result.error.details as ConflictView[]).map((c) => {
    const when = describeInstant(c.startAt);
    return `"${c.courseName}" on ${when.weekday} ${when.localDate} ${when.localTime}`;
  });
  return err("CONFLICT", `The new time conflicts with ${lines.join("; ")}. The session was not moved.`, result.error.details);
}

export const eduProposalHandlers: ProposalRegistry = {
  RESCHEDULE: {
    schema: ProposalPayloadSchemas.RESCHEDULE,
    execute: executeReschedule,
    describe: async (actor, payload) => {
      const session = await findSession(actor, payload.sessionId);
      const to = describeInstant(payload.newStartAt);
      if (!session) return [`Move a session to ${to.weekday} ${to.localDate} ${to.localTime}`];
      const from = describeInstant(session.startAt);
      return [
        session.courseName,
        `From: ${from.weekday} ${from.localDate} ${from.localTime}`,
        `To: ${to.weekday} ${to.localDate} ${to.localTime} (${session.durationMin} min, no conflicts)`,
        "Rescheduling does not change lesson deductions.",
      ];
    },
  },
  ADD_STUDENT: {
    schema: ProposalPayloadSchemas.ADD_STUDENT,
    execute: executeAddStudent,
    describe: async (actor, payload) => [
      `Add a student to ${(await courseName(actor, payload.courseId)) ?? "the course"}`,
      `Student email: ${payload.email}`,
      "The student is added only if they already have a student account.",
    ],
  },
  MARK_ATTENDANCE: {
    schema: ProposalPayloadSchemas.MARK_ATTENDANCE,
    execute: (actor, payload) => services.confirmAttendance(actor, payload),
    describe: describeAttendance,
  },
  CREATE_COURSE: {
    schema: ProposalPayloadSchemas.CREATE_COURSE,
    execute: executeCourse,
    describe: describeCourse,
  },
  CREATE_SESSIONS: {
    schema: ProposalPayloadSchemas.CREATE_SESSIONS,
    execute: executeSessions,
    describe: describeSessions,
  },
  ADD_CONTENT: {
    schema: ProposalPayloadSchemas.ADD_CONTENT,
    execute: executeContent,
    describe: describeContent,
  },
  ADD_STUDENT_NOTE: {
    schema: ProposalPayloadSchemas.ADD_STUDENT_NOTE,
    execute: executeStudentNote,
    describe: async (actor, payload) => {
      const roster = await services.listMyStudents(actor, { courseId: payload.courseId });
      const student = roster.ok ? roster.data.students.find((s) => s.id === payload.studentId) : undefined;
      return [
        `${payload.kind === "AVAILABILITY" ? "Availability" : "Private note"} for ${student?.name ?? "the student"}`,
        payload.content,
        "This note is visible to the teacher only.",
      ];
    },
  },
};

// A global singleton in development, so every route handler sees the same pending proposals.
const globalForProposals = globalThis as unknown as {
  __koraProposalStore?: ReturnType<typeof createMemoryProposalStore>;
};
const memoryProposalStore = (globalForProposals.__koraProposalStore ??= createMemoryProposalStore());
export const proposalStore = memoryProposalStore;
const activeProposalStore = useRealBackend ? prismaProposalStore : memoryProposalStore;
export const eduProposals = createProposalService(eduProposalHandlers, activeProposalStore);
