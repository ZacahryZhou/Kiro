import type { ChatMessage, Completion, ToolSpec } from "../../core/types";
import { parseJsonObject } from "../../core/citations";

// A scripted stand-in for the language model, used when AI_MOCK=1 (demos with no network or key).
// It reads the user's message with simple rules, then drives the SAME real tools a real model would
// (schedule lookups, proposals...), so proposals, confirmation, permissions and the database all behave
// exactly as in production. It never invents data: every fact in its replies comes from a tool result.

type Params = { messages: ChatMessage[]; tools?: ToolSpec[] };

const HELP_TEACHER =
  "Demo mode (AI_MOCK=1): the assistant is running without a language model, so it understands a few simple requests. " +
  'Try: "What classes do I have next week?", "What courses do I teach?", ' +
  '"Schedule math next week on Tuesday and Thursday at 10am", or "Create a course called Weekend Math, small class, math, $40 per session". ' +
  "To take attendance, name each enrolled student and their status.";
const HELP_STUDENT =
  "Demo mode (AI_MOCK=1): the assistant is running without a language model, so it understands a few simple requests. " +
  'Try: "Who am I?", "What is on my schedule this week?" or a question about your course materials.';

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


// ---------- the isolated quiz-writing call ----------

const FALLBACK_TERMS = ["variable", "constant", "equation", "fraction", "ratio", "formula"];

function writeQuiz(system: string, user: string): Completion | undefined {
  if (!system.startsWith("You write quiz questions from course materials.")) return undefined;
  const data = parseJsonObject(user) as { slots?: { index: number; type: string; difficulty: string; topic?: string }[]; materials?: { materialId: string; title: string; content: string }[] } | null;
  const sentences: { materialId: string; title: string; text: string; term: string }[] = [];
  for (const material of data?.materials ?? []) {
    for (const raw of material.content.split(/(?<=[.!?])\s+|\n+/)) {
      const text = raw.replace(/\s+/g, " ").trim();
      if (text.length < 25 || text.length > 220) continue;
      const term = text.split(/[^A-Za-z0-9+=-]+/).filter((w) => w.length >= 5 && !STOP.has(w.toLowerCase())).sort((a, b) => b.length - a.length)[0];
      if (term) sentences.push({ materialId: material.materialId, title: material.title, text, term });
    }
  }
  const questions = (data?.slots ?? []).flatMap((slot, position) => {
    if (sentences.length === 0) return [];
    const base = sentences[(slot.index * 2 + position) % sentences.length];
    const others = [...new Set([...sentences.map((x) => x.term), ...FALLBACK_TERMS])].filter((t) => t.toLowerCase() !== base.term.toLowerCase());
    const blanked = base.text.replace(base.term, "____");
    const common = { slot: slot.index, type: slot.type, difficulty: slot.difficulty, topic: slot.topic ?? base.title, sourceMaterialId: base.materialId, sourceQuote: base.text, explanation: `The materials say: "${base.text}"` };
    if (slot.type === "MULTIPLE_CHOICE") {
      const options = [base.term, ...others.slice(slot.index % Math.max(1, others.length - 3), (slot.index % Math.max(1, others.length - 3)) + 3)];
      const rotated = options.slice(slot.index % 4).concat(options.slice(0, slot.index % 4));
      return [{ ...common, prompt: `Complete the statement from the materials: "${blanked}"`, options: rotated, answer: base.term }];
    }
    if (slot.type === "TRUE_FALSE") {
      const isTrue = slot.index % 2 === 0;
      return [{ ...common, prompt: `True or false: ${isTrue ? base.text : base.text.replace(base.term, others[0] ?? "nothing")}`, answer: isTrue ? "True" : "False" }];
    }
    return [{ ...common, prompt: `Complete the statement from the materials: "${blanked}"`, answer: base.term }];
  });
  return say(JSON.stringify({ questions }));
}


// ---------- the isolated note-writing and tutor calls ----------

function sentencesOf(materials: { materialId: string; title: string; content: string }[]): { materialId: string; title: string; text: string }[] {
  const out: { materialId: string; title: string; text: string }[] = [];
  for (const material of materials) {
    for (const raw of material.content.split(/(?<=[.!?])\s+|\n+/)) {
      const text = raw.replace(/\s+/g, " ").trim();
      if (text.length >= 25 && text.length <= 300) out.push({ materialId: material.materialId, title: material.title, text });
    }
  }
  return out;
}

function writeNotes(system: string, user: string): Completion | undefined {
  if (!system.startsWith("You write teaching notes from course materials.")) return undefined;
  const data = parseJsonObject(user) as { wanted?: string[]; maxNotes?: number; materials?: { materialId: string; title: string; content: string }[] } | null;
  const sentences = sentencesOf(data?.materials ?? []);
  const wanted = data?.wanted?.length ? data.wanted : ["KNOWLEDGE_POINT"];
  const notes = sentences.slice(0, data?.maxNotes ?? 6).map((sentence, index) => {
    const kind = wanted[index % wanted.length];
    const title = sentence.text.split(/\s+/).slice(0, 6).join(" ").replace(/[.,;:]+$/, "");
    const content = kind === "LESSON_SUMMARY" ? `This lesson covers: ${sentence.text}` : kind === "COMMON_MISTAKE" ? `Watch out: ${sentence.text}` : kind === "FAQ" ? `Q: What should I remember? A: ${sentence.text}` : sentence.text;
    return { kind, title: `${title} (${index + 1})`, content, sourceMaterialId: sentence.materialId, sourceQuote: sentence.text };
  });
  return say(JSON.stringify({ notes }));
}

function tutorFromSources(system: string, user: string): Completion | undefined {
  if (!system.startsWith("You are a student's tutor who teaches ONLY from the teacher's notes")) return undefined;
  const data = parseJsonObject(user) as { question?: string; materials?: { materialId: string; title: string; content: string }[] } | null;
  const asked = new Set(words(data?.question ?? "").filter((w) => !STOP.has(w)));
  const scored = sentencesOf(data?.materials ?? [])
    // A note whose title matches the question counts for more than a stray shared word.
    .map((sentence) => ({ ...sentence, score: new Set(words(sentence.text).filter((w) => asked.has(w))).size + 3 * new Set(words(sentence.title).filter((w) => asked.has(w))).size }))
    .filter((sentence) => sentence.score >= 1)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0 || scored[0].score < 1 || asked.size === 0) return say(JSON.stringify({ found: false, answer: "", citations: [] }));
  const used: typeof scored = [];
  for (const sentence of scored) if (used.length < 3 && !used.some((u) => u.text === sentence.text)) used.push(sentence);
  const answer = `Let's go step by step. ${used.map((u, i) => `${i === 0 ? u.text : `${i === 1 ? "Next, " : "Finally, "}${u.text.charAt(0).toLowerCase()}${u.text.slice(1)}`}`).join(" ")}`;
  return say(JSON.stringify({ found: true, answer, citations: used.map((u) => ({ materialId: u.materialId, quote: u.text })) }));
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

  // Pending leave or different-time requests.
  // Teaching notes for the students' tutor: dictated, or built from the course materials.
  const dictated = /^\s*(?:please\s+)?(?:add|save|write)\s+(?:an?\s+)?(lesson summary|key point|knowledge point|common mistake|example|faq|teaching style)\s+(?:for|to|in)\s+(?:my\s+|the\s+)?(.+?)\s*(?:course|class)?\s*:\s*([^]+)$/i.exec(text);
  const fromMaterials = /\b(build|create|write|generate|make|draft)\b/i.test(text) && /\b(teaching notes?|notes|knowledge)\b/i.test(text) && /\bfrom\b.*\bmaterials?\b/i.test(text);
  if (dictated || fromMaterials) {
    if (step === 0) return call("listMyCourses", {}, 1);
    const courses = ((first?.courses as { courseId: string; name: string }[]) ?? []);
    const label = dictated ? dictated[2] : text;
    const named = courses.filter((c) => words(label).some((w) => w.length > 3 && c.name.toLowerCase().includes(w)));
    const pick = courses.length === 1 ? courses[0] : named.length === 1 ? named[0] : undefined;
    if (!pick && !(dictated && /\b(all|every)\b/i.test(dictated[2]))) return say(courses.length === 0 ? "You have no courses yet." : `Which course are the notes for: ${(named.length > 1 ? named : courses).map((c) => c.name).join(" or ")}?`);
    if (step === 1) {
      if (dictated) {
        const kind = dictated[1].toUpperCase().replace(/\s+/g, "_").replace("KNOWLEDGE_POINT", "KNOWLEDGE_POINT");
        const content = dictated[3].trim().slice(0, 4000);
        const title = content.split(/\s+/).slice(0, 7).join(" ").replace(/[.,;:!?]+$/, "");
        return call("proposeKnowledge", { entries: [{ kind: kind === "KEY_POINT" ? "KNOWLEDGE_POINT" : kind, title, content, ...(pick ? { courseId: pick.courseId } : {}) }] }, 2);
      }
      const unit = /\bfrom\s+(?:the\s+)?([A-Za-z][\w ]+?)\s+unit\b/i.exec(text)?.[1];
      return call("proposeKnowledgeFromMaterials", { courseId: pick!.courseId, ...(unit ? { unit } : {}) }, 2);
    }
    const data = done[1].data;
    if (errorLine(data)) return say(`I couldn't prepare the notes: ${errorLine(data)}`);
    return say(`${proposalReply(data)}${typeof data.warning === "string" ? ` ${data.warning}` : ""}`);
  }

  // Write a quiz from the course materials: counts, mix and topics come from the sentence; code and a separate writing step do the rest.
  if ((/\b(quiz|exam)\b/i.test(text) || /\b(?:a|the|my)\s+test\b/i.test(text)) && /\b(make|create|write|generate|build|draft|prepare)\b/i.test(text) && !/\bhome\s?page\b/i.test(text)) {
    const num = (re: RegExp) => { const m = re.exec(text); return m ? Number(m[1]) : undefined; };
    const count = num(/(\d+)\s*(?:quiz\s+|exam\s+|test\s+)?questions?\b/i) ?? num(/\b(?:quiz|exam|test)\s+(?:of|with)\s+(\d+)\b/i);
    if (step === 0) {
      if (!count) return say("How many questions do you want in the quiz?");
      return call("listMyCourses", {}, 1);
    }
    const courses = ((first?.courses as { courseId: string; name: string }[]) ?? []);
    const named = courses.filter((c) => words(text).some((w) => w.length > 3 && c.name.toLowerCase().includes(w)));
    const pick = courses.length === 1 ? courses[0] : named.length === 1 ? named[0] : undefined;
    if (!pick) return say(courses.length === 0 ? "You have no courses to write a quiz for yet." : `Which course is the quiz for: ${(named.length > 1 ? named : courses).map((c) => c.name).join(" or ")}?`);
    if (step === 1) {
      const topicText = /(?:covering|cover|about|topics?:?|on)\s+([^.;]+?)(?:\.|;|$)/i.exec(text.replace(/\b\d+\s*(?:multiple[- ]choice|mc|true\/false|true or false|short[- ]answer|easy|medium|hard)\b/gi, ""))?.[1];
      const topics = topicText ? topicText.split(/,|\band\b/i).map((t) => t.replace(/\b(the|my|from|unit)\b/gi, "").trim()).filter((t) => t.length > 2 && !/\b(questions?|quiz|course|class)\b/i.test(t)).slice(0, 8) : [];
      const unit = /\bfrom\s+(?:the\s+)?([A-Za-z][\w ]+?)\s+unit\b/i.exec(text)?.[1];
      const args: Record<string, unknown> = { courseId: pick.courseId, count };
      const set = (key: string, re: RegExp) => { const v = num(re); if (v !== undefined) args[key] = v; };
      set("multipleChoice", /(\d+)\s*(?:multiple[- ]choice|mc)\b/i);
      set("trueFalse", /(\d+)\s*(?:true\/false|true or false|true-false|tf)\b/i);
      set("shortAnswer", /(\d+)\s*short[- ]answer\b/i);
      set("easy", /(\d+)\s*easy\b/i);
      set("medium", /(\d+)\s*medium\b/i);
      set("hard", /(\d+)\s*hard\b/i);
      if (topics.length) args.topics = topics;
      if (unit) args.unit = unit;
      return call("proposeQuiz", args, 2);
    }
    const data = done[1].data;
    if (errorLine(data)) return say(`I couldn't write that quiz: ${errorLine(data)}`);
    return say(`${proposalReply(data)}${typeof data.warning === "string" ? ` ${data.warning}` : ""}`);
  }

  // Design the home page: pick widgets, colours and motion from the sentence; code places them.
  if (/\b(home\s?page|home\s?screen|dashboard)\b/i.test(text) && /\b(design|set\s?up|arrange|build|make|show|layout|only|want|create)\b/i.test(text)) {
    const picks: { type: string; studentName?: string; courseName?: string }[] = [];
    const add = (re: RegExp, type: string) => { if (re.test(text) && !picks.some((p) => p.type === type)) picks.push({ type }); };
    add(/\b(glance|overview|stats|numbers)\b/i, "STATS");
    add(/\btoday\b/i, "TODAY_SESSIONS");
    add(/\b(this week|week|schedule)\b/i, "WEEK_SCHEDULE");
    add(/\b(month|calendar)\b/i, "MONTH_CALENDAR");
    add(/\b(requests?|leave)\b/i, "PENDING_REQUESTS");
    add(/\bprogress\b/i, "RECENT_PROGRESS");
    add(/\bcourses?\b/i, "COURSE_LIST");
    add(/\b(trend|attendance)\b/i, "ATTENDANCE_TREND");
    for (const m of text.matchAll(/\b([A-Z][a-z]{2,})(?:'s|\u2019s)\b/g)) picks.push({ type: "STUDENT_FOCUS", studentName: m[1] });
    if (picks.length === 0) return say("Which widgets do you want on your home page? I can show: week at a glance, today, this week, month calendar, requests, a student's focus card, attendance trend, recent progress and your courses.");
    const theme = /\bocean\b/i.test(text) ? "ocean" : /\bsunset\b/i.test(text) ? "sunset" : /\bforest\b/i.test(text) ? "forest" : /\bviolet\b/i.test(text) ? "violet" : /\b(midnight|dark)\b/i.test(text) ? "midnight" : "kora";
    const motion = /\b(no (?:motion|animation)|static|still)\b/i.test(text) ? "off" : /\b(lively|playful|animated|bouncy)\b/i.test(text) ? "lively" : "calm";
    const name = /(?:called|named)\s+"?([^",.:]+?)"?(?=[:,.]|$|\s+(?:in|with|and)\b)/i.exec(text)?.[1]?.trim() ?? "My home page";
    if (step === 0) return call("proposeDashboardLayout", { name, theme, motion, widgets: picks }, 1);
    const data = first ?? {};
    if (errorLine(data)) return say(`I couldn't design that: ${errorLine(data)}`);
    if (data.status === "AMBIGUOUS") {
      const rows = (data.candidates as { name: string; email: string }[]) ?? [];
      return say(`More than one student matches: ${rows.map((r) => `${r.name} (${r.email})`).join("; ")}. Which one do you mean?`);
    }
    return say(proposalReply(data));
  }

  if (/\b(leave|time|student)\s+requests?\b|\bany requests\b|\bpending requests\b/i.test(text)) {
    if (step === 0) return call("listStudentRequests", { status: "PENDING" }, 1);
    const rows = ((first?.requests as { student: string; course: string; kind: string; session: { localDate: string; localTime: string }; note?: string }[]) ?? []);
    if (rows.length === 0) return say("You have no pending student requests.");
    return say(`You have ${rows.length} pending ${rows.length === 1 ? "request" : "requests"}: ${rows.map((r) => `${r.student} asked for ${r.kind === "LEAVE" ? "leave" : "a different time"} for ${r.course} on ${r.session.localDate} at ${r.session.localTime}${r.note ? ` ("${r.note}")` : ""}`).join("; ")}. Answer them on the Requests page.`);
  }

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

  // Record what a student worked on in the most recent session of a course.
  const progress = /^\s*(?:[Rr]ecord|[Ss]ave|[Aa]dd)\s+progress\s+for\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b([^]*)$/.exec(text);
  if (progress) {
    const field = (name: RegExp) => name.exec(progress[2])?.[1]?.trim();
    const goal = field(/goal:\s*([^;]+)/i);
    const output = field(/(?:output|produced|result):\s*([^;]+)/i);
    const issue = field(/(?:issue|difficulty):\s*([^;]+)/i);
    const nextWord = field(/next(?: step)?:\s*(practice|review|extra|recap)/i)?.toLowerCase();
    const nextAction = nextWord ? ({ practice: "PRACTICE", review: "REVIEW", extra: "EXTRA_MATERIAL", recap: "RECAP_NEXT" } as const)[nextWord as "practice"] : undefined;
    const missing = [!goal && "the goal", !output && "what the student produced", !nextAction && "the next step (practice, review, extra material or recap)"].filter(Boolean);
    if (missing.length > 0) return say(`To record progress I still need ${missing.join(", ")}. For example: "Record progress for Jordan: goal: fractions; output: solved 8 of 10; next: practice".`);
    if (step === 0) return call("findMyStudent", { query: progress[1].trim() }, 1);
    const matches = ((first?.matches as { studentId: string; name: string; courses: { courseId: string; name: string }[] }[]) ?? []);
    if (matches.length === 0) return say(`I couldn't find a student called "${progress[1].trim()}" in your courses.`);
    if (matches.length > 1) return say(`More than one student matches "${progress[1].trim()}": ${matches.map((m) => m.name).join(", ")}. Which one do you mean?`);
    const student = matches[0];
    const named = student.courses.filter((c) => words(text).some((w) => w.length > 3 && c.name.toLowerCase().includes(w)));
    const course = student.courses.length === 1 ? student.courses[0] : named.length === 1 ? named[0] : undefined;
    if (!course) return say(`${student.name} is in ${student.courses.map((c) => c.name).join(" and ")}. Which course is this for?`);
    const today = new Date();
    if (step === 1) return call("getTeacherSchedule", { courseId: course.courseId, startDate: new Date(today.getTime() - 60 * 86_400_000).toISOString().slice(0, 10), endDate: today.toISOString().slice(0, 10) }, 2);
    const started = ((done[1].data.sessions as { sessionId: string; startAt: string; status: string }[]) ?? [])
      .filter((x) => x.status !== "CANCELLED" && Date.parse(x.startAt) <= today.getTime())
      .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
    if (started.length === 0) return say(`I don't see a session of ${course.name} that has already started.`);
    if (step === 2) return call("proposeProgressRecord", { sessionId: started[0].sessionId, studentId: student.studentId, goal, output, ...(issue ? { issue } : {}), nextAction }, 3);
    return say(proposalReply(done[2].data));
  }

  // Move one session to a new date and time (dates as YYYY-MM-DD).
  const move = /\b(?:move|reschedule)\b[^]*?(\d{4}-\d{2}-\d{2})[^]*?\bto\b\s*(\d{4}-\d{2}-\d{2})([^]*)$/i.exec(text);
  if (move) {
    const newTime = parseTime(move[3]) ?? parseTime(text.slice(0, text.indexOf(move[1])));
    if (!newTime) return say("What time should the session move to? For example: \"Move Math on 2028-03-07 to 2028-03-08 at 10am\".");
    if (step === 0) return call("getTeacherSchedule", { startDate: move[1], endDate: move[1] }, 1);
    const open = ((first?.sessions as { sessionId: string; courseName: string; localTime: string; status: string }[]) ?? []).filter((x) => x.status === "SCHEDULED" || x.status === "RESCHEDULED");
    const named = open.filter((x) => words(text).some((w) => w.length > 3 && x.courseName.toLowerCase().includes(w)));
    const picks = named.length > 0 ? named : open;
    if (picks.length === 0) return say(`I don't see an open session on ${move[1]}.`);
    if (picks.length > 1) return say(`Which session do you mean: ${picks.map((x) => `${x.courseName} at ${x.localTime}`).join(" or ")}?`);
    if (step === 1) return call("proposeReschedule", { sessionId: picks[0].sessionId, newDate: move[2], newTime }, 2);
    const data = done[1].data;
    if (errorLine(data)) return say(`I couldn't do that: ${errorLine(data)}`);
    if (data.status === "CONFLICTS_FOUND") {
      const rows = (data.conflictsWith as { courseName: string; localDate: string; localTime: string }[]) ?? [];
      return say(`I can't move it there. It would clash with ${rows.map((r) => `${r.courseName} on ${r.localDate} at ${r.localTime}`).join(", ")}. Would you like a different time?`);
    }
    return say(proposalReply(data));
  }

  // Add course content (a unit with one text material).
  const content = /\badd\s+(?:a\s+)?unit\s+(?:called|titled|named)\s+"?([^":]+?)"?\s+to\s+(?:my\s+|the\s+)?([A-Za-z0-9 ]+?)\s*(?:course|class)?\s*[:\-]\s*([\s\S]+)$/i.exec(text);
  if (content) {
    if (step === 0) return call("listMyCourses", {}, 1);
    const courses = ((first?.courses as { courseId: string; name: string }[]) ?? []);
    const match = courses.filter((c) => words(content[2]).some((w) => w.length > 3 && c.name.toLowerCase().includes(w)));
    if (match.length !== 1) return say(match.length === 0 ? `Which course is this for: ${courses.map((c) => c.name).join(" or ")}?` : `Which course do you mean: ${match.map((c) => c.name).join(" or ")}?`);
    const title = content[1].trim();
    if (step === 1) return call("proposeAddContent", { courseId: match[0].courseId, unitTitle: title, materials: [{ title, kind: "TEXT", content: content[3].trim() }] }, 2);
    return say(proposalReply(done[1].data));
  }

  // Remember a private note or availability for a student.
  const note = /^\s*(?:[Pp]lease\s+)?(?:[Rr]emember|[Mm]ake a note|[Ss]ave a note)\s+(?:that\s+)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(.+)$/.exec(text);
  if (note) {
    const kind = /\b(unavailable|available|can't|cannot|busy|not free|free on)\b/i.test(note[2]) ? "AVAILABILITY" : "NOTE";
    if (step === 0) return call("findMyStudent", { query: note[1] }, 1);
    const matches = ((first?.matches as { studentId: string; name: string; courses: { courseId: string; name: string }[] }[]) ?? []);
    if (matches.length === 0) return say(`I couldn't find a student called "${note[1]}" in your courses.`);
    if (matches.length > 1) return say(`More than one student matches "${note[1]}": ${matches.map((m) => m.name).join(", ")}. Which one do you mean?`);
    const student = matches[0];
    const named = student.courses.filter((c) => words(text).some((w) => w.length > 3 && c.name.toLowerCase().includes(w)));
    const course = student.courses.length === 1 ? student.courses[0] : named.length === 1 ? named[0] : undefined;
    if (!course) return say(`${student.name} is in ${student.courses.map((c) => c.name).join(" and ")}. Which course is this note for?`);
    if (step === 1) return call("proposeAddStudentNote", { courseId: course.courseId, studentId: student.studentId, kind, content: `${note[1]} ${note[2]}`.trim().slice(0, 500) }, 2);
    return say(proposalReply(done[1].data));
  }

  // Attendance trend for one student.
  const trend = /\b(?:[Hh]ow is|[Hh]ow's|[Hh]ow has)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b.*\b(doing|attending|attendance)|\battendance (?:trend|pattern)s? (?:for|of)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/.exec(text);
  if (trend) {
    const who = (trend[1] ?? trend[3]).trim();
    if (step === 0) return call("findMyStudent", { query: who }, 1);
    const matches = ((first?.matches as { studentId: string; name: string; courses: { courseId: string; name: string }[] }[]) ?? []);
    if (matches.length === 0) return say(`I couldn't find a student called "${who}" in your courses.`);
    if (matches.length > 1) return say(`More than one student matches "${who}": ${matches.map((m) => m.name).join(", ")}. Which one do you mean?`);
    const student = matches[0];
    const named = student.courses.filter((c) => words(text).some((w) => w.length > 3 && c.name.toLowerCase().includes(w)));
    const course = student.courses.length === 1 ? student.courses[0] : named.length === 1 ? named[0] : undefined;
    if (!course) return say(`${student.name} is in ${student.courses.map((c) => c.name).join(" and ")}. Which course do you mean?`);
    if (step === 1) return call("getAttendanceTrends", { courseId: course.courseId, studentId: student.studentId }, 2);
    const rows = ((done[1].data.trends as { studentName: string; sessions: number; present: number; absent: number; leave: number; attendanceRate: number | null; consecutiveAbsences: number; enoughData: boolean }[]) ?? []);
    const row = rows[0];
    if (!row) return say(errorLine(done[1].data) ?? "I couldn't load the attendance records.");
    if (!row.enoughData) return say("Insufficient data to identify a trend.");
    return say(`${row.studentName} attended ${row.present} of ${row.sessions} recorded sessions (${row.attendanceRate}%), with ${row.absent} absent and ${row.leave} on leave${row.consecutiveAbsences >= 2 ? `, and ${row.consecutiveAbsences} absences in a row` : ""}.`);
  }

  // Add an existing student to an existing course.
  const addStudent = /\badd\s+(?:the\s+)?(?:student\s+)?([\w.+-]+@[\w-]+\.[\w.]+|[A-Za-z]{2,}(?:\s[A-Za-z]{2,})?)\s+(?:to|into)\s+(?:the\s+|my\s+)?(.+?)\s*(?:course|class)?\s*$/i.exec(text);
  if (addStudent && !/\bnew\s+course\b|\bcreate\b/i.test(text)) {
    const who = addStudent[1].trim();
    const isEmail = who.includes("@");
    if (step === 0) return call("listMyCourses", {}, 1);
    const courses = ((first?.courses as { courseId: string; name: string }[]) ?? []);
    const match = courses.filter((c) => words(addStudent[2]).some((w) => w.length > 3 && c.name.toLowerCase().includes(w)));
    if (match.length !== 1) return say(match.length === 0 ? `Which course should ${who} join: ${courses.map((c) => c.name).join(" or ")}?` : `Which course do you mean: ${match.map((c) => c.name).join(" or ")}?`);
    if (step === 1) return call("proposeAddStudent", { courseId: match[0].courseId, ...(isEmail ? { studentEmail: who } : { studentName: who }) }, 2);
    const data = done[1].data;
    if (errorLine(data)) return say(`I couldn't do that: ${errorLine(data)}`);
    if (data.status === "AMBIGUOUS") {
      const rows = (data.candidates as { name: string; email: string }[]) ?? [];
      return say(`More than one student matches "${who}": ${rows.map((r) => `${r.name} (${r.email})`).join("; ")}. Which one do you mean?`);
    }
    if (data.status === "ALREADY_ENROLLED") return say(String(data.note));
    return say(proposalReply(data));
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

  // Who am I.
  if (/\bwho am i\b|\bmy (name|profile|account|role)\b|\bwhat('s| is) my name\b|\babout me\b/i.test(text)) {
    if (step === 0) return call("getMyProfile", {}, 1);
    const p = first as { name?: string; courseCount?: number; totalStudents?: number; courses?: { name: string; students: string[] }[] } | undefined;
    if (!p?.name) return say("I couldn't load your account details.");
    const lines = (p.courses ?? []).map((c) => `${c.name} (${c.students.length > 0 ? c.students.join(", ") : "no students yet"})`);
    return say(`You're signed in as ${p.name}, a teacher. You teach ${p.courseCount ?? 0} ${p.courseCount === 1 ? "course" : "courses"} with ${p.totalStudents ?? 0} ${p.totalStudents === 1 ? "student" : "students"}${lines.length > 0 ? `: ${lines.join("; ")}` : ""}.`);
  }

  // Find one student by name.
  const lookup = /(?:find|search for|look up|who is|tell me about|is)\s+(?:the\s+)?(?:student\s+)?([A-Za-z]{2,}(?:\s[A-Za-z]{2,})?)\b/i.exec(text);
  if (lookup && !/^(in|my|the|a|an|there|it|this|that|enrolled|taking)\b/i.test(lookup[1]) && /\b(find|search|look up|who is|tell me about|is .+ (my|a) student)\b/i.test(text)) {
    if (step === 0) return call("findMyStudent", { query: lookup[1].trim() }, 1);
    const matches = ((first?.matches as { name: string; email: string; courses: { name: string }[] }[]) ?? []);
    if (matches.length === 0) return say(`I couldn't find a student called "${lookup[1].trim()}" in your courses.`);
    return say(matches.map((m) => `${m.name} (${m.email}) is in ${m.courses.map((c) => c.name).join(" and ")}.`).join(" "));
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
  if (/\bwho am i\b|\bmy (name|profile|account|role)\b|\bwhat('s| is) my name\b|\babout me\b/i.test(text)) {
    if (done.length === 0) return call("getMyProfile", {}, 1);
    const p = first as { name?: string; courses?: { name: string; teacher: string }[] } | undefined;
    if (!p?.name) return say("I couldn't load your account details.");
    const lines = (p.courses ?? []).map((c) => `${c.name} with ${c.teacher}`);
    return say(`You're signed in as ${p.name}, a student${lines.length > 0 ? `, in ${lines.join("; ")}` : ""}.`);
  }

  // Leave request for one upcoming session.
  if (/\b(need|want|request|ask for|get|take)\b[^.]*\bleave\b|\b(can't|cannot|won't be able to) (make|attend|come)\b|\bday off\b/i.test(text)) {
    const today = new Date();
    const range = /\btomorrow\b/i.test(text)
      ? { when: "tomorrow" }
      : /\bnext\b/i.test(text)
        ? { when: "next_week" }
        : /\bthis\b/i.test(text)
          ? { when: "this_week" }
          : { startDate: today.toISOString().slice(0, 10), endDate: new Date(today.getTime() + 14 * 86_400_000).toISOString().slice(0, 10) };
    const weekday = WEEKDAYS.find(([name]) => new RegExp(`\\b${name}\\b`, "i").test(text))?.[0];
    if (done.length === 0) return call("getStudentWorkspace", range, 1);
    const open = ((first?.sessions as { sessionId: string; weekday: string; localDate: string; localTime: string; courseName: string; status: string }[]) ?? [])
      .filter((x) => x.status === "SCHEDULED" || x.status === "RESCHEDULED");
    const byDay = weekday ? open.filter((x) => x.weekday.slice(0, 3).toLowerCase() === weekday.slice(0, 3)) : open;
    const byName = byDay.filter((x) => words(text).some((w) => w.length > 3 && x.courseName.toLowerCase().includes(w)));
    const picks = byName.length > 0 ? byName : byDay;
    if (picks.length === 0) return say("I don't see an upcoming session on that day. Which session do you mean?");
    if (picks.length > 1) return say(`Which session do you mean: ${picks.map((x) => `${x.courseName} on ${x.weekday} ${x.localDate} at ${x.localTime}`).join(" or ")}?`);
    if (done.length === 1) return call("proposeStudentRequest", { sessionId: picks[0].sessionId, kind: "LEAVE", note: text.slice(0, 300) }, 2);
    const data = done[1].data;
    if (errorLine(data)) return say(`I couldn't do that: ${errorLine(data)}`);
    if (data.status === "ALREADY_REQUESTED") return say(String(data.note));
    return say(`I've prepared this request: ${String(data.summary)}. It is only a note to your teacher and is sent once you confirm it below. Your teacher decides.`);
  }

  if (/\b(explain|teach me|help me understand|walk me through|break (?:it )?down)\b/i.test(text)) {
    if (done.length === 0) return call("explainWithTeacherNotes", { question: text.slice(0, 500) }, 1);
  }
  // "When is my next class?" is answered from the code-computed nextSession, whatever range was asked for.
  if (/\bnext (class|lesson|session)\b|\bwhen is my next\b|\bupcoming (class|lesson|session)\b/i.test(text)) {
    if (done.length === 0) return call("getStudentWorkspace", { when: "this_week" }, 1);
    const next = first?.nextSession as { weekday: string; localDate: string; localTime: string; courseName: string } | null | undefined;
    return say(next ? `Your next class is ${next.weekday} ${next.localDate} at ${next.localTime}: ${next.courseName}.` : "You have no upcoming classes scheduled.");
  }
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
  const quiz = writeQuiz(system, user);
  if (quiz) return quiz;
  const notes = writeNotes(system, user);
  if (notes) return notes;
  const tutor = tutorFromSources(system, user);
  if (tutor) return tutor;

  const names = new Set((params.tools ?? []).map((t) => t.name));
  if (names.has("proposeMarkAttendance")) return teacherFlow(user, params.messages);
  if (names.has("answerFromCourseMaterials")) return studentFlow(user, params.messages);
  return say(HELP_TEACHER);
}
