"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/actor";
import { addExistingStudentToCourse, addMaterial, confirmAttendance, createCourse, createCourseUnit, createSessions, rescheduleSession, saveProgressRecord } from "@/services/write";
import type { ConflictView } from "@/contracts";
import { addMaterialsFromFile, deleteMaterial } from "@/services/materials-upload";
import { cancelSession, deleteCourse, deleteSession, deleteUnit, removeStudentFromCourse, renameUnit, updateCourse, updateMaterial, updateSession } from "@/services/course-admin";

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

/** "45" or "45.50" in dollars to whole cents; empty is 0 and anything else is NaN (which validation rejects). */
function dollarsToCents(price: string): number {
  if (price === "") return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(price)) return Number.NaN;
  const [whole, fraction = ""] = price.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export async function createCourseAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const pricePerSessionCents = dollarsToCents(value(formData, "price"));
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
  revalidatePath("/teacher/schedule");
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
    revalidatePath("/teacher/schedule");
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

/** Adds the text of an uploaded .txt, .md, .pdf or .docx file to a unit. */
export async function uploadMaterialFileAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const courseId = value(formData, "courseId");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { kind: "error", message: "Choose a file to upload." };
  const result = await addMaterialsFromFile(actor, { unitId: value(formData, "unitId"), courseId, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), title: value(formData, "title") });
  if (!result.ok) return { kind: "error", message: result.error.message };
  for (const path of [`/teacher/courses/${result.data.courseId}`, `/student/courses/${result.data.courseId}`, "/teacher/knowledge"]) revalidatePath(path);
  const { parts, characters, fileName } = result.data;
  return { kind: "success", message: `Added ${fileName} (${characters.toLocaleString("en-US")} characters${parts > 1 ? `, split into ${parts} materials` : ""}). Students in this course can now ask the course tutor about it.` };
}

export async function deleteMaterialAction(courseId: string, materialId: string): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const result = await deleteMaterial(actor, { materialId });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidatePath(`/teacher/courses/${courseId}`);
  revalidatePath(`/student/courses/${courseId}`);
  return { kind: "success", message: "Material removed." };
}

export async function rescheduleSessionAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const courseId = value(formData, "courseId");
  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const newStartAt = localDateTimeToUtc(value(formData, "date"), value(formData, "time"), timeZone);
  if (!newStartAt) {
    return { kind: "error", message: `Choose a valid local date and time in ${timeZone}.` };
  }
  const result = await rescheduleSession(actor, {
    sessionId: value(formData, "sessionId"),
    newStartAt,
  });
  if (!result.ok) {
    return {
      kind: "error",
      message: result.error.message,
      details: result.error.code === "CONFLICT" ? formatConflicts(result.error.details, timeZone) : undefined,
    };
  }
  revalidatePath("/teacher");
  revalidatePath("/teacher/schedule");
  revalidatePath(`/teacher/courses/${courseId}`);
  revalidatePath("/student");
  revalidatePath(`/student/courses/${courseId}`);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(result.data.newStartAt));
  return { kind: "success", message: `Session moved to ${date}.` };
}

const NEXT_ACTIONS = ["PRACTICE", "REVIEW", "EXTRA_MATERIAL", "RECAP_NEXT"] as const;

export async function saveProgressAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const courseId = value(formData, "courseId");
  const nextAction = NEXT_ACTIONS.find((item) => item === value(formData, "nextAction"));
  if (!nextAction) return { kind: "error", message: "Choose a next step." };
  const issue = value(formData, "issue");
  const note = value(formData, "note");
  const result = await saveProgressRecord(actor, {
    sessionId: value(formData, "sessionId"),
    studentId: value(formData, "studentId"),
    goal: value(formData, "goal"),
    output: value(formData, "output"),
    nextAction,
    ...(issue ? { issue } : {}),
    ...(note ? { note } : {}),
  });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidatePath(`/teacher/courses/${courseId}`);
  return { kind: "success", message: `Progress saved for ${result.data.studentName}.` };
}


/** Pages that show a course to its teacher and students; refreshed after any change to the course. */
function revalidateCourse(courseId: string) {
  for (const path of ["/teacher", "/teacher/courses", "/teacher/schedule", "/teacher/calendar", "/teacher/students", "/student", "/student/calendar"]) revalidatePath(path);
  revalidatePath(`/teacher/courses/${courseId}`);
  revalidatePath(`/student/courses/${courseId}`);
}

export async function updateCourseAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const courseId = value(formData, "courseId");
  const price = dollarsToCents(value(formData, "price"));
  const result = await updateCourse(actor, {
    courseId,
    name: value(formData, "name"),
    subject: value(formData, "subject"),
    type: value(formData, "type") as "ONE_ON_ONE" | "SMALL_CLASS",
    location: value(formData, "location"),
    description: value(formData, "description"),
    pricePerSessionCents: price,
  });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidateCourse(courseId);
  return { kind: "success", message: "Course saved." };
}

/** Deletes the course after the teacher typed its name, then goes back to the course list. */
export async function deleteCourseAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const courseId = value(formData, "courseId");
  const result = await deleteCourse(actor, { courseId, confirmName: value(formData, "confirmName") });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidateCourse(courseId);
  redirect("/teacher/courses");
}

export async function renameUnitAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const result = await renameUnit(actor, { unitId: value(formData, "unitId"), title: value(formData, "title") });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidateCourse(result.data.courseId);
  return { kind: "success", message: "Unit renamed." };
}

export async function deleteUnitAction(courseId: string, unitId: string): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const result = await deleteUnit(actor, { unitId });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidateCourse(result.data.courseId);
  const n = result.data.materialsRemoved;
  return { kind: "success", message: `Unit deleted${n > 0 ? ` with ${n} ${n === 1 ? "material" : "materials"}` : ""}.` };
}

export async function updateMaterialAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const kind = value(formData, "kind");
  // The raw text field is not trimmed: leading and trailing line breaks are the teacher's formatting.
  const rawContent = formData.get("content");
  const result = await updateMaterial(actor, {
    materialId: value(formData, "materialId"),
    title: value(formData, "title"),
    ...(kind === "TEXT" ? { content: typeof rawContent === "string" ? rawContent : "" } : { url: value(formData, "url") }),
  });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidateCourse(result.data.courseId);
  return { kind: "success", message: "Material saved." };
}

export async function cancelSessionAction(courseId: string, sessionId: string): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const result = await cancelSession(actor, { sessionId });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidateCourse(result.data.courseId);
  return { kind: "success", message: "Session cancelled." };
}

export async function deleteSessionAction(courseId: string, sessionId: string): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const result = await deleteSession(actor, { sessionId });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidateCourse(result.data.courseId);
  return { kind: "success", message: "Session deleted." };
}

export async function updateSessionAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const durationMin = Number(value(formData, "durationMin"));
  const result = await updateSession(actor, {
    sessionId: value(formData, "sessionId"),
    durationMin,
    location: value(formData, "location"),
    linkUrl: value(formData, "linkUrl") || null,
  });
  if (!result.ok) {
    return { kind: "error", message: result.error.message, details: result.error.code === "CONFLICT" ? formatConflicts(result.error.details, timeZone) : undefined };
  }
  revalidateCourse(result.data.courseId);
  return { kind: "success", message: "Session saved." };
}

export async function removeStudentAction(courseId: string, studentId: string): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const result = await removeStudentFromCourse(actor, { courseId, studentId });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidateCourse(courseId);
  const kept = result.data.keptAttendance + result.data.keptDeductions + result.data.keptProgress;
  return { kind: "success", message: kept > 0 ? "Student removed. Their past attendance, deductions and progress stay on your records." : "Student removed." };
}
