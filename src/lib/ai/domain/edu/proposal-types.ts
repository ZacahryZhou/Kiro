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
import { createProposalService, type ProposalRegistry } from "../../core/proposals";
import { describeInstant } from "../../core/time";
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

export const eduProposalHandlers: ProposalRegistry = {
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
};

// A global singleton in development, so every route handler sees the same pending proposals.
const globalForProposals = globalThis as unknown as {
  __koraProposalStore?: ReturnType<typeof createMemoryProposalStore>;
};
export const proposalStore = (globalForProposals.__koraProposalStore ??= createMemoryProposalStore());
export const eduProposals = createProposalService(eduProposalHandlers, proposalStore);
