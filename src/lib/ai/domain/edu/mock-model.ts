import type { ChatMessage, Completion, ToolSpec } from "../../core/types";
import { parseJsonObject } from "../../core/citations";

// A scripted stand-in for the language model, used when AI_MOCK=1 (demos with no network or key).
// It reads the user's message with simple rules, then drives the SAME real tools a real model would
// (schedule lookups, proposals...), so proposals, confirmation, permissions and the database all behave
// exactly as in production. It never invents data: every fact in its replies comes from a tool result.

type Params = { messages: ChatMessage[]; tools?: ToolSpec[] };

const HELP_TEACHER =
  "Demo mode (AI_MOCK=1): the assistant is running without a language model, so it understands a few simple requests. " +
  'Try: "What classes do I have next week?", "Who is in my math class?", "Jordan came to math today and Sam is on leave", ' +
  '"Schedule math next week on Tuesday and Thursday at 10am", or "Create a course called Weekend Math, small class, math, $40 per session, add s+jordan@example.test".';
const HELP_STUDENT =
  "Demo mode (AI_MOCK=1): the assistant is running without a language model, so it understands a few simple requests. " +
  'Try: "What is on my schedule this week?" or a question about your course materials.';

const call = (name: string, args: unknown, n: number): Completion => {
  const id = `mock_${n}`;
  return {
    content: null,
    toolCalls: [{ id, name, args }],
    message: { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] },
  };
};
const say = (content: string): Completion => ({ content, toolCalls: [], message: { role: "assistant", content } });

const WEEKDAYS: [string, string][] = [
  ["monday", "MON"], ["tuesday", "TUE"], ["wednesday", "WED"], ["thursday", "THU"], ["friday", "FRI"], ["saturday", "SAT"], ["sunday", "SUN"],
  ["mon", "MON"], ["tue", "TUE"], ["tues", "TUE"], ["wed", "WED"], ["thu", "THU"], ["thur", "THU"], ["thurs", "THU"], ["fri", "FRI"], ["sat", "SAT"], ["sun", "SUN"],
];
const STOP = new Set(["what", "which", "that", "this", "with", "from", "have", "does", "about", "tell", "explain", "when", "where", "there", "their", "your", "the", "and", "for", "are", "how", "can", "you", "please", "give", "show"]);

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === "user") return m.content;
  }
  return "";
}

/** Tool results that came after the user's latest message, oldest first. */
function results(messages: ChatMessage[]): { name: string; data: Record<string, unknown> }[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") { start = i + 1; break; }
  }
  const names = new Map<string, string>();
  const out: { name: string; data: Record<string, unknown> }[] = [];
  for (const m of messages.slice(start)) {
    if (m.role === "assistant") for (const c of m.tool_calls ?? []) names.set(c.id, c.function.name);
    if (m.role === "tool") {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(m.content) as Record<string, unknown>; } catch { /* keep empty */ }
      out.push({ name: names.get(m.tool_call_id) ?? "", data });
    }
  }
  return out;
}

const errorLine = (data: Record<string, unknown>): string | undefined => {
  const error = data.error as { message?: string } | undefined;
  return error?.message;
};

const when = (text: string): "today" | "tomorrow" | "this_week" | "next_week" =>
  /next week/i.test(text) ? "next_week" : /tomorrow/i.test(text) ? "tomorrow" : /this week|week/i.test(text) ? "this_week" : "today";

function parseTime(text: string): string | null {
  const ampm = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === "pm") hour += 12;
    return `${String(hour).padStart(2, "0")}:${ampm[2] ?? "00"}`;
  }
  const clock = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  return clock ? `${clock[1].padStart(2, "0")}:${clock[2]}` : null;
}

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];

// ---------- the isolated course-materials question call ----------

function answerFromSources(system: string, user: string): Completion | undefined {
  if (!system.startsWith("You answer a student's question using ONLY the course materials")) return undefined;
  const data = parseJsonObject(user) as { question?: string; materials?: { materialId: string; content: string }[] } | null;
  const asked = new Set(words(data?.question ?? "").filter((w) => !STOP.has(w)));
  let best: { materialId: string; sentence: string; score: number } | undefined;
  for (const material of data?.materials ?? []) {
    for (const sentence of material.content.split(/(?<=[.!?])\s+/)) {
      const score = new Set(words(sentence).filter((w) => asked.has(w))).size;
      if (sentence.replace(/\s+/g, " ").trim().length >= 8 && (!best || score > best.score)) best = { materialId: material.materialId, sentence: sentence.trim(), score };
    }
  }
  const found = !!best && best.score >= 2;
  return say(JSON.stringify(found
    ? { found: true, answer: best!.sentence, citations: [{ materialId: best!.materialId, quote: best!.sentence }] }
    : { found: false, answer: "", citations: [] }));
}

// ---------- teacher flows ----------

type Student = { studentId: string; name: string };
type Status = "PRESENT" | "LEAVE" | "ABSENT";

function statusOf(clause: string): Status | undefined {
  if (/\b(leave|sick|excused)\b/i.test(clause)) return "LEAVE";
  if (/\b(absent|missed|skipped|no[- ]show)\b|(didn'?t|did not|wasn'?t|was not) (come|show|attend|here|there)/i.test(clause)) return "ABSENT";
  if (/\b(came|attended|present|here|showed up|arrived)\b/i.test(clause)) return "PRESENT";
  return undefined;
}

function readAttendance(text: string, roster: Student[]): { records: { studentId: string; status: Status }[]; missing: Student[] } {
  const assigned = new Map<string, Status>();
  let pending: Student[] = [];
  for (const clause of text.split(/,|;|\.|\bbut\b|\band\b/i)) {
    const mentioned = roster.filter((s) => new RegExp(`\\b${s.name.split(" ")[0]}\\b`, "i").test(clause) || clause.toLowerCase().includes(s.name.toLowerCase()));
    const status = statusOf(clause);
    const everyone = /\b(everyone|everybody|all|both)\b/i.test(clause);
    if (status && (mentioned.length > 0 || pending.length > 0)) {
      for (const s of [...pending, ...mentioned]) assigned.set(s.studentId, status);
      pending = [];
    } else if (status && everyone) {
      for (const s of roster) if (!assigned.has(s.studentId)) assigned.set(s.studentId, status);
    } else if (mentioned.length > 0) {
      pending = [...pending, ...mentioned];
    }
  }
  return {
    records: roster.filter((s) => assigned.has(s.studentId)).map((s) => ({ studentId: s.studentId, status: assigned.get(s.studentId)! })),
    missing: roster.filter((s) => !assigned.has(s.studentId)),
  };
}

function proposalReply(data: Record<string, unknown>): string {
  const problem = errorLine(data);
  if (problem) return `I couldn't do that: ${problem}`;
  const warnings = Array.isArray(data.warnings) ? ` Note: ${(data.warnings as string[]).join(" ")}` : "";
  return `I've prepared ${String(data.summary)}. Nothing changes until you confirm it below.${warnings}`;
}

function teacherFlow(text: string, messages: ChatMessage[]): Completion {
  const done = results(messages);
  const step = done.length;
  const first = done[0]?.data;

  // Attendance: schedule today -> roster -> proposal.
  if (statusOf(text) && /\b(came|attended|present|absent|leave|missed|skipped|showed|here)\b/i.test(text)) {
    if (step === 0) return call("getTeacherSchedule", { when: "today" }, 1);
    const sessions = ((first?.sessions as { sessionId: string; courseId: string; courseName: string; status: string; localTime: string }[]) ?? [])
      .filter((s) => s.status === "SCHEDULED" || s.status === "RESCHEDULED");
    const named = sessions.filter((s) => words(text).some((w) => w.length > 3 && s.courseName.toLowerCase().includes(w)));
    const candidates = named.length > 0 ? named : sessions;
    if (candidates.length === 0) return say("I don't see an open session today to take attendance for.");
    if (candidates.length > 1) return say(`Which class do you mean: ${candidates.map((s) => `${s.courseName} at ${s.localTime}`).join(" or ")}?`);
    const session = candidates[0];
    if (step === 1) return call("listMyStudents", { courseId: session.courseId }, 2);
    const roster = ((done[1].data.students as Student[]) ?? []);
    if (step === 2) {
      const { records, missing } = readAttendance(text, roster);
      if (missing.length > 0) return say(`You haven't told me about ${missing.map((s) => s.name).join(", ")}. Was ${missing.length === 1 ? "that student" : "each of them"} present, on leave or absent?`);
      return call("proposeMarkAttendance", { sessionId: session.sessionId, records }, 3);
    }
    return say(proposalReply(done[2].data));
  }

  // Create a course.
  if (/\b(create|new|add)\b.*\bcourse\b|\bcourse\b.*\b(create|called|named)\b/i.test(text)) {
    const name = /(?:called|named)\s+"?([^",.$]+?)"?(?=,|\.|\s+(?:for|small|group|one-on-one|one on one|1:1|private|price|priced)\b|\s+\$|$)/i.exec(text)?.[1]?.trim();
    const subject = /\b(math|mathematics|physics|english|chemistry|biology|history|art|music)\b/i.exec(text)?.[1];
    const type = /small|group/i.test(text) ? "SMALL_CLASS" : /1:1|one[- ]on[- ]one|private/i.test(text) ? "ONE_ON_ONE" : undefined;
    const price = /\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:dollars|usd|per session)/i.exec(text);
    const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
    const missing = [!name && "the course name", !subject && "the subject", !type && "whether it is one-on-one or a small class", !price && "the price per session in dollars"].filter(Boolean);
    if (step === 0) {
      if (missing.length > 0) return say(`To create the course I still need ${missing.join(", ")}. Student emails are optional.`);
      return call("proposeCreateCourse", { name, subject: subject![0].toUpperCase() + subject!.slice(1).toLowerCase(), type, pricePerSession: Number(price![1] ?? price![2]), studentEmails: emails }, 1);
    }
    return say(proposalReply(first ?? {}));
  }

  // Schedule sessions.
  if (/\bschedule\b|\bbook\b/i.test(text) && /\b(session|class|lesson|math|physics|english|chemistry|biology|history)\b/i.test(text)) {
    const codes = [...new Set(WEEKDAYS.filter(([n]) => new RegExp(`\\b${n}\\b`, "i").test(text)).map(([, c]) => c))];
    const time = parseTime(text);
    const duration = Number(/(\d{2,3})\s*(?:min|minutes)/i.exec(text)?.[1] ?? 60);
    if (codes.length === 0 || !time) return say("To schedule sessions I need the weekday(s) and the start time, for example: \"Schedule math next week on Tuesday and Thursday at 10am\".");
    if (step === 0) return call("listMyCourses", {}, 1);
    const courses = ((first?.courses as { courseId: string; name: string }[]) ?? []);
    const match = courses.filter((c) => words(text).some((w) => w.length > 3 && c.name.toLowerCase().includes(w)));
    if (match.length !== 1) return say(match.length === 0 ? "Which course do you want to schedule?" : `Which course do you mean: ${match.map((c) => c.name).join(" or ")}?`);
    if (step === 1) return call("proposeCreateSessions", { courseId: match[0].courseId, time, durationMin: duration, weekdays: codes, when: /this week/i.test(text) ? "this_week" : "next_week" }, 2);
    const data = done[1].data;
    if (errorLine(data)) return say(`I couldn't do that: ${errorLine(data)}`);
    if (data.status === "CONFLICTS_FOUND") {
      const rows = (data.sessions as { weekday: string; localDate: string; localTime: string; ok: boolean; conflictsWith: { courseName: string }[] }[]).filter((s) => !s.ok);
      return say(`I can't schedule that. ${rows.map((r) => `${r.weekday} ${r.localDate} ${r.localTime} conflicts with ${[...new Set(r.conflictsWith.map((c) => c.courseName))].join(", ")}`).join("; ")}. Would you like a different time?`);
    }
    if (data.status === "MEMORY_PREFERENCE_CONFLICTS") {
      const rows = data.preferences as { localDate: string; localTime: string; student: string }[];
      return say(`I haven't scheduled anything. ${rows.map((r) => `${r.localDate} ${r.localTime} clashes with a recorded note for ${r.student}`).join("; ")}. Would you like a different time?`);
    }
    return say(proposalReply(data));
  }

  // Who is in a course.
  if (/\b(who|which students|students)\b.*\b(in|enrolled|taking)\b/i.test(text) || /\bmy students\b|\broster\b/i.test(text)) {
    if (step === 0) return call("listMyCourses", {}, 1);
    const courses = ((first?.courses as { courseId: string; name: string }[]) ?? []);
    const match = courses.filter((c) => words(text).some((w) => w.length > 3 && c.name.toLowerCase().includes(w)));
    if (match.length !== 1) return say(match.length === 0 ? `Which course do you mean: ${courses.map((c) => c.name).join(" or ")}?` : `Which course do you mean: ${match.map((c) => c.name).join(" or ")}?`);
    if (step === 1) return call("listMyStudents", { courseId: match[0].courseId }, 2);
    const problem = errorLine(done[1].data);
    if (problem) return say(`I can't access that. ${problem}`);
    const students = (done[1].data.students as Student[]) ?? [];
    return say(students.length === 0 ? `${match[0].name} has no students yet.` : `${match[0].name} has ${students.length} ${students.length === 1 ? "student" : "students"}: ${students.map((s) => s.name).join(", ")}.`);
  }

  // Courses I teach.
  if (/\b(courses|classes) (do )?i (teach|have)\b|\bmy courses\b|\bwhat (courses|classes)\b.*\bteach/i.test(text) && !/today|tomorrow|week/i.test(text)) {
    if (step === 0) return call("listMyCourses", {}, 1);
    const courses = ((first?.courses as { name: string; studentCount: number }[]) ?? []);
    return say(courses.length === 0 ? "You don't have any courses yet." : `You teach ${courses.length} ${courses.length === 1 ? "course" : "courses"}: ${courses.map((c) => `${c.name} (${c.studentCount} ${c.studentCount === 1 ? "student" : "students"})`).join("; ")}.`);
  }

  // Schedule lookup.
  if (/\b(classes|schedule|sessions|lessons|calendar)\b/i.test(text)) {
    if (step === 0) return call("getTeacherSchedule", { when: when(text) }, 1);
    const sessions = ((first?.sessions as { weekday: string; localDate: string; localTime: string; courseName: string; durationMin: number; status: string }[]) ?? []);
    const problem = errorLine(first ?? {});
    if (problem) return say(`I couldn't load the schedule: ${problem}`);
    return say(sessions.length === 0 ? "You have no sessions in that period." : `You have ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}: ${sessions.map((s) => `${s.weekday} ${s.localDate} ${s.localTime} ${s.courseName} (${s.durationMin} min)`).join("; ")}.`);
  }

  return say(HELP_TEACHER);
}

// ---------- student flows ----------

function studentFlow(text: string, messages: ChatMessage[]): Completion {
  const done = results(messages);
  const first = done[0]?.data;
  if (/\b(schedule|classes|sessions|lessons|attendance|calendar|courses)\b/i.test(text) && !/\b(define|explain|how do|formula)\b/i.test(text)) {
    if (done.length === 0) return call("getStudentWorkspace", { when: when(text) }, 1);
    const sessions = ((first?.sessions as { weekday: string; localDate: string; localTime: string; courseName: string }[]) ?? []);
    return say(sessions.length === 0 ? "You have no sessions in that period." : `You have ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}: ${sessions.map((s) => `${s.weekday} ${s.localDate} ${s.localTime} ${s.courseName}`).join("; ")}.`);
  }
  if (words(text).filter((w) => !STOP.has(w)).length >= 1 && /\?|\b(what|how|why|explain|define|formula|help)\b/i.test(text)) {
    if (done.length === 0) return call("answerFromCourseMaterials", { question: text.slice(0, 500) }, 1);
  }
  return say(HELP_STUDENT);
}

/** The scripted model used when AI_MOCK=1. */
export function eduMockModel(params: Params): Completion {
  const system = params.messages[0]?.role === "system" ? params.messages[0].content : "";
  const user = lastUserText(params.messages);
  const qa = answerFromSources(system, user);
  if (qa) return qa;

  const names = new Set((params.tools ?? []).map((t) => t.name));
  if (names.has("proposeMarkAttendance")) return teacherFlow(user, params.messages);
  if (names.has("answerFromCourseMaterials")) return studentFlow(user, params.messages);
  return say(HELP_TEACHER);
}
