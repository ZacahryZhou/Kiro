import type { Role } from "@/contracts";
import { APP_TZ, utcToLocalParts, zonedTimeToUtc } from "../core/time";

// In-memory demo data for development (contract §11). Mirrors the Prisma tables closely enough
// that fake-services can behave exactly like the real services.

export type FakeUser = { id: string; name: string; email: string; role: Role };
export type FakeCourse = {
  id: string;
  teacherId: string;
  name: string;
  subject: string;
  type: "ONE_ON_ONE" | "SMALL_CLASS";
  location?: string;
  description?: string;
  pricePerSessionCents: number;
};
export type FakeEnrollment = { id: string; courseId: string; studentId: string };
export type SessionStatus = "SCHEDULED" | "RESCHEDULED" | "CANCELLED" | "COMPLETED";
export type FakeSession = {
  id: string;
  courseId: string;
  startAt: string;
  durationMin: number;
  location?: string;
  linkUrl?: string;
  status: SessionStatus;
  originalStartAt?: string;
};
export type FakeSessionChange = {
  id: string;
  sessionId: string;
  changedById: string;
  fromStatus: SessionStatus;
  toStatus: SessionStatus;
  oldStartAt?: string;
  newStartAt?: string;
  createdAt: string;
};
export type FakeAttendance = {
  id: string;
  sessionId: string;
  studentId: string;
  status: "PRESENT" | "LEAVE" | "ABSENT";
  markedById: string;
  markedAt: string;
};
export type FakeDeduction = {
  id: string;
  sessionId: string;
  studentId: string;
  courseId: string;
  amountCents: number;
  reason: "PRESENT" | "ABSENT";
  createdAt: string;
};
export type FakeUnit = { id: string; courseId: string; title: string; order: number };
export type FakeMaterial = {
  id: string;
  unitId: string;
  title: string;
  kind: "TEXT" | "LINK";
  content?: string;
  url?: string;
};
export type FakeMemory = {
  id: string;
  courseId: string;
  studentId: string;
  teacherId: string;
  kind: "AVAILABILITY" | "NOTE";
  content: string;
  createdAt: string;
};

export type FakeRequest = {
  id: string;
  sessionId: string;
  studentId: string;
  kind: "LEAVE" | "RESCHEDULE";
  note?: string;
  preferredStartAt?: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  createdAt: string;
  resolvedAt?: string;
};

export type FakeState = {
  users: FakeUser[];
  courses: FakeCourse[];
  enrollments: FakeEnrollment[];
  sessions: FakeSession[];
  sessionChanges: FakeSessionChange[];
  attendance: FakeAttendance[];
  deductions: FakeDeduction[];
  units: FakeUnit[];
  materials: FakeMaterial[];
  memories: FakeMemory[];
  requests: FakeRequest[];
};

export const ids = {
  alex: "u_alex",
  taylor: "u_taylor",
  jordan: "u_jordan",
  sam: "u_sam",
  casey: "u_casey",
  courseA: "c_math",
  courseB: "c_physics",
  courseC: "c_english",
} as const;

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

type Day = { year: number; month: number; day: number };

function localToday(now: Date): Day {
  const { year, month, day } = utcToLocalParts(now, APP_TZ);
  return { year, month, day };
}

function addDays({ year, month, day }: Day, days: number): Day {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** The given weekday (1 = Monday ... 7 = Sunday) of the week that is `weekOffset` weeks from today's. */
function weekday(now: Date, weekOffset: number, isoWeekday: number): Day {
  const today = localToday(now);
  const dow = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay() || 7;
  return addDays(today, -(dow - 1) + weekOffset * 7 + (isoWeekday - 1));
}

function at(day: Day, hour: number, minute = 0): string {
  return zonedTimeToUtc({ ...day, hour, minute }).toISOString();
}

export function createState(now = new Date()): FakeState {
  const state: FakeState = {
    users: [
      { id: ids.alex, name: "Alex Morgan", email: "teacher1@example.test", role: "TEACHER" },
      { id: ids.taylor, name: "Taylor Chen", email: "teacher2@example.test", role: "TEACHER" },
      { id: ids.jordan, name: "Jordan Lee", email: "student1@example.test", role: "STUDENT" },
      { id: ids.sam, name: "Sam Patel", email: "student2@example.test", role: "STUDENT" },
      { id: ids.casey, name: "Casey Kim", email: "student3@example.test", role: "STUDENT" },
    ],
    courses: [
      {
        id: ids.courseA,
        teacherId: ids.alex,
        name: "Grade 8 Math Small Group",
        subject: "Math",
        type: "SMALL_CLASS",
        location: "Room 101",
        pricePerSessionCents: 4000,
      },
      {
        id: ids.courseB,
        teacherId: ids.alex,
        name: "Grade 8 Physics 1:1",
        subject: "Physics",
        type: "ONE_ON_ONE",
        location: "Room 102",
        pricePerSessionCents: 8000,
      },
      {
        id: ids.courseC,
        teacherId: ids.taylor,
        name: "Grade 10 English 1:1",
        subject: "English",
        type: "ONE_ON_ONE",
        location: "Room 201",
        pricePerSessionCents: 8000,
      },
    ],
    enrollments: [
      { id: "e_1", courseId: ids.courseA, studentId: ids.jordan },
      { id: "e_2", courseId: ids.courseA, studentId: ids.sam },
      { id: "e_3", courseId: ids.courseB, studentId: ids.jordan },
      { id: "e_4", courseId: ids.courseC, studentId: ids.casey },
    ],
    sessions: [],
    sessionChanges: [],
    attendance: [],
    deductions: [],
    units: [],
    materials: [],
    memories: [],
    requests: [],
  };

  const session = (
    id: string,
    courseId: string,
    startAt: string,
    status: SessionStatus,
    durationMin = 60,
  ) => state.sessions.push({ id, courseId, startAt, durationMin, status });

  // Completed sessions with attendance and deductions.
  session("s_a_past2", ids.courseA, at(weekday(now, -2, 2), 16), "COMPLETED");
  session("s_a_past1", ids.courseA, at(weekday(now, -1, 2), 16), "COMPLETED");
  session("s_b_past1", ids.courseB, at(weekday(now, -1, 3), 17), "COMPLETED");
  session("s_c_past1", ids.courseC, at(weekday(now, -1, 1), 18), "COMPLETED");
  const markAttendance = (
    sessionId: string,
    courseId: string,
    studentId: string,
    status: "PRESENT" | "LEAVE" | "ABSENT",
    when: string,
  ) => {
    const teacherId = state.courses.find((c) => c.id === courseId)!.teacherId;
    state.attendance.push({
      id: nextId("att"),
      sessionId,
      studentId,
      status,
      markedById: teacherId,
      markedAt: when,
    });
    if (status !== "LEAVE") {
      state.deductions.push({
        id: nextId("ded"),
        sessionId,
        studentId,
        courseId,
        amountCents: state.courses.find((c) => c.id === courseId)!.pricePerSessionCents,
        reason: status,
        createdAt: when,
      });
    }
  };
  for (const s of state.sessions.filter((x) => x.status === "COMPLETED")) {
    const when = s.startAt;
    if (s.id === "s_a_past2") {
      markAttendance(s.id, s.courseId, ids.jordan, "PRESENT", when);
      markAttendance(s.id, s.courseId, ids.sam, "PRESENT", when);
    } else if (s.id === "s_a_past1") {
      markAttendance(s.id, s.courseId, ids.jordan, "PRESENT", when);
      markAttendance(s.id, s.courseId, ids.sam, "LEAVE", when);
    } else if (s.id === "s_b_past1") {
      markAttendance(s.id, s.courseId, ids.jordan, "PRESENT", when);
    } else {
      markAttendance(s.id, s.courseId, ids.casey, "ABSENT", when);
    }
  }

  // Upcoming sessions: today (for the attendance demo), this week and next week.
  session("s_a_today", ids.courseA, at(localToday(now), 15), "SCHEDULED");
  session("s_a_thu", ids.courseA, at(weekday(now, 0, 4), 16), "SCHEDULED");
  session("s_a_next_tue", ids.courseA, at(weekday(now, 1, 2), 16), "SCHEDULED");
  session("s_a_next_thu", ids.courseA, at(weekday(now, 1, 4), 16), "SCHEDULED");
  session("s_b_wed", ids.courseB, at(weekday(now, 0, 3), 17), "SCHEDULED");
  // Overlaps Course A next Tuesday 16:00-17:00 (same teacher, and Jordan is in both courses).
  session("s_b_next_tue", ids.courseB, at(weekday(now, 1, 2), 16, 30), "SCHEDULED");
  session("s_c_mon", ids.courseC, at(weekday(now, 0, 1), 18), "SCHEDULED");
  session("s_c_next_mon", ids.courseC, at(weekday(now, 1, 1), 18), "SCHEDULED");

  // Materials: facts to cite; the quadratic vertex formula is deliberately absent.
  state.units.push(
    { id: "unit_a1", courseId: ids.courseA, title: "Unit 1: Linear Functions", order: 1 },
    { id: "unit_a2", courseId: ids.courseA, title: "Unit 2: Quadratic Basics", order: 2 },
    { id: "unit_b1", courseId: ids.courseB, title: "Unit 1: Motion", order: 1 },
    { id: "unit_c1", courseId: ids.courseC, title: "Unit 1: Essay Writing", order: 1 },
  );
  state.materials.push(
    {
      id: "mat_a1_def",
      unitId: "unit_a1",
      title: "Chapter 2: Definition of a linear function",
      kind: "TEXT",
      content:
        "A linear function is a function whose graph is a straight line. It is written y = kx + b, where k is the slope and b is the y-intercept. If k is positive the line rises from left to right.",
    },
    {
      id: "mat_a1_hw",
      unitId: "unit_a1",
      title: "Homework 2 practice sheet",
      kind: "LINK",
      url: "https://example.test/materials/linear-homework",
    },
    {
      id: "mat_a2_intro",
      unitId: "unit_a2",
      title: "Chapter 3: Quadratic functions overview",
      kind: "TEXT",
      content:
        "A quadratic function is written y = ax^2 + bx + c with a not equal to 0. Its graph is a parabola. If a is positive the parabola opens upward; if a is negative it opens downward.",
    },
    {
      id: "mat_b1_speed",
      unitId: "unit_b1",
      title: "Speed and velocity",
      kind: "TEXT",
      content: "Speed is distance divided by time. Velocity is speed in a given direction.",
    },
    {
      id: "mat_c1_thesis",
      unitId: "unit_c1",
      title: "Writing a thesis statement",
      kind: "TEXT",
      content: "A thesis statement is one sentence that states the main argument of an essay.",
    },
  );

  // Teacher-only memory examples (AgentMemory), used from S7.2.
  state.memories.push(
    {
      id: "mem_1",
      courseId: ids.courseA,
      studentId: ids.jordan,
      teacherId: ids.alex,
      kind: "AVAILABILITY",
      content: "Unavailable Tuesday and Thursday afternoons.",
      createdAt: now.toISOString(),
    },
    {
      id: "mem_2",
      courseId: ids.courseA,
      studentId: ids.sam,
      teacherId: ids.alex,
      kind: "NOTE",
      content: "Struggles with functions.",
      createdAt: now.toISOString(),
    },
  );

  return state;
}

// A global singleton, so every route handler in a dev server sees the same demo data.
const globalForStore = globalThis as unknown as { __koraFakeStore?: FakeState };
export const store: FakeState = (globalForStore.__koraFakeStore ??= createState());

/** Restores the demo data (used by the check script between scenarios). */
export function resetStore(now = new Date()): void {
  Object.assign(store, createState(now));
}

export function findUserByEmail(email: string): FakeUser | undefined {
  return store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function actorFor(email: string): { userId: string; role: Role } | undefined {
  const user = findUserByEmail(email);
  return user ? { userId: user.id, role: user.role } : undefined;
}
