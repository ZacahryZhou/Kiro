"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/actor";
import { addExistingStudentToCourse, addMaterial, confirmAttendance, createCourse, createCourseUnit, createSessions } from "@/services/write";
import type { ConflictView } from "@/contracts";

type ActionState = { kind: "success" | "error" | null; message: string; details?: string[] };

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function formatConflicts(details: unknown, timeZone: string): string[] {
  if (!Array.isArray(details)) return [];
  return (details as ConflictView[]).flatMap((conflict) => {
    if (
      typeof conflict?.courseName !== "string" ||
      typeof conflict.startAt !== "string" ||
      !Number.isFinite(Date.parse(conflict.startAt))
    ) {
      return [];
    }
    const date = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(conflict.startAt));
    const source = conflict.withStudentId ? "An enrolled student also has" : "The teacher has";
    return [`${source} “${conflict.courseName}” on ${date}.`];
  });
}

function parseDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.toISOString().slice(0, 10) === date ? parsed : null;
}

function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function localDateTimeToUtc(date: string, time: string, timeZone: string): string | null {
  const dateValue = parseDate(date);
  if (!dateValue || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hour, minute] = time.split(":").map(Number);
  const targetWallClock = Date.UTC(
    dateValue.getUTCFullYear(),
    dateValue.getUTCMonth(),
    dateValue.getUTCDate(),
    hour,
    minute,
  );
  let candidate = targetWallClock;

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = Object.fromEntries(
        formatter
          .formatToParts(new Date(candidate))
          .filter(({ type }) => type !== "literal")
          .map(({ type, value: partValue }) => [type, Number(partValue)]),
      );
      const observedWallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
      const adjustment = targetWallClock - observedWallClock;
      if (adjustment === 0) return new Date(candidate).toISOString();
      candidate += adjustment;
    }
  } catch {
    return null;
  }
  return null;
}

export async function createCourseAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const price = value(formData, "price");
  const validPrice = price === "" || /^\d+(?:\.\d{1,2})?$/.test(price);
  const priceParts = price.split(".");
  const pricePerSessionCents = price === ""
    ? 0
    : validPrice
      ? Number(priceParts[0]) * 100 + Number((priceParts[1] ?? "").padEnd(2, "0"))
      : Number.NaN;
  const result = await createCourse(actor, {
    name: value(formData, "name"),
    subject: value(formData, "subject"),
    type: value(formData, "type") as "ONE_ON_ONE" | "SMALL_CLASS",
    location: value(formData, "location") || undefined,
    description: value(formData, "description") || undefined,
    pricePerSessionCents,
  });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidatePath("/teacher/courses");
  return { kind: "success", message: "Course created successfully." };
}

export async function addStudentAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const courseId = value(formData, "courseId");
  const result = await addExistingStudentToCourse(actor, {
    courseId,
    email: value(formData, "email"),
  });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidatePath("/teacher/courses");
  revalidatePath(`/teacher/courses/${courseId}`);
  return {
    kind: "success",
    message: result.data.alreadyJoined ? "This student is already enrolled." : "Student added to the course.",
  };
}

export async function createSessionsAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const courseId = value(formData, "courseId");
  const date = value(formData, "date");
  const time = value(formData, "time");
  const durationMin = Number(value(formData, "durationMin"));
  const weeks = Number(value(formData, "weeks"));
  const location = value(formData, "location") || undefined;
  const baseDate = parseDate(date);

  if (!baseDate || !Number.isInteger(weeks) || weeks < 1 || weeks > 30) {
    return { kind: "error", message: "Choose a valid start date and a number of weeks from 1 to 30." };
  }

  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const sessions = [];
  for (let week = 0; week < weeks; week += 1) {
    const localDate = addDays(baseDate, week * 7);
    const startAt = localDateTimeToUtc(localDate, time, timeZone);
    if (!startAt) {
      return {
        kind: "error",
        message: `The selected local time is invalid or does not exist in ${timeZone}.`,
      };
    }
    sessions.push({ startAt, durationMin, location });
  }

  const result = await createSessions(actor, { courseId, sessions });
  if (!result.ok) {
    return {
      kind: "error",
      message: result.error.message,
      details: result.error.code === "CONFLICT" ? formatConflicts(result.error.details, timeZone) : undefined,
    };
  }
  revalidatePath("/teacher");
  revalidatePath(`/teacher/courses/${courseId}`);
  return {
    kind: "success",
    message: `${result.data.sessionIds.length} ${result.data.sessionIds.length === 1 ? "session" : "sessions"} scheduled.`,
  };
}

export async function confirmAttendanceAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const sessionId = value(formData, "sessionId");
  const studentIds = formData.getAll("studentId").filter((entry): entry is string => typeof entry === "string");
  const records = studentIds.map((studentId) => ({
    studentId,
    status: value(formData, `status:${studentId}`) as "PRESENT" | "LEAVE" | "ABSENT",
  }));
  const result = await confirmAttendance(actor, { sessionId, records });
  if (!result.ok) return { kind: "error", message: result.error.message };
  const courseId = result.data.attendance[0]?.courseId;
  if (courseId) {
    revalidatePath(`/teacher/courses/${courseId}`);
    revalidatePath("/teacher");
    revalidatePath("/student");
  }
  return {
    kind: "success",
    message: `Attendance saved for ${result.data.attendance.length} ${result.data.attendance.length === 1 ? "student" : "students"}.`,
  };
}

export async function createCourseUnitAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const courseId = value(formData, "courseId");
  const result = await createCourseUnit(actor, { courseId, title: value(formData, "title") });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidatePath(`/teacher/courses/${courseId}`);
  return { kind: "success", message: "Unit created successfully." };
}

export async function addMaterialAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const courseId = value(formData, "courseId");
  const kind = value(formData, "kind");
  const result = await addMaterial(actor, {
    unitId: value(formData, "unitId"),
    title: value(formData, "title"),
    kind: kind as "TEXT" | "LINK",
    content: kind === "TEXT" ? value(formData, "content") : undefined,
    url: kind === "LINK" ? value(formData, "url") : undefined,
  });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidatePath(`/teacher/courses/${courseId}`);
  revalidatePath(`/student/courses/${courseId}`);
  return { kind: "success", message: "Material added successfully." };
}
