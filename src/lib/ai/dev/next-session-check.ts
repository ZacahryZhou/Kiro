/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script reads untyped tool JSON */
// Regression check for a real bug: "when is my next class?" was answered with a made-up date because
// the schedule tool only looked at the current week. Dates and the next lesson are now computed by code.
// Run: npx tsx src/lib/ai/dev/next-session-check.ts
import { runAgent } from "../core/agent-loop";
import { APP_TZ, describeInstant } from "../core/time";
import { findTool } from "../domain/edu/tools";
import { actorFor, ids, resetStore, store } from "./fake-store";

const alex = actorFor("teacher1@example.test")!;
const taylor = actorFor("teacher2@example.test")!;
const jordan = actorFor("student1@example.test")!;
const casey = actorFor("student3@example.test")!;

let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra).slice(0, 300)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}
async function run(tool: string, actor: typeof alex, args: unknown = {}) {
  const result = await findTool(actor.role, tool)!.run(actor, args);
  return JSON.parse(result.content) as Record<string, any>;
}

async function main() {
  resetStore();
  // Independent reference: format an instant with Intl, not with the code under test.
  const parts = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)!.value;
    return { weekday: g("weekday"), date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
  };

  let mismatches = 0;
  for (let i = 0; i < 90 * 24; i += 1) {
    const d = new Date(Date.UTC(2026, 9, 1) + i * 3_600_000);
    const mine = describeInstant(d.toISOString());
    const ref = parts(d);
    if (!ref.weekday.startsWith(mine.weekday) || mine.localDate !== ref.date || mine.localTime !== ref.time) mismatches += 1;
  }
  check("describeInstant agrees with Intl for every hour of 90 days (weekday, date and time)", mismatches === 0, mismatches);

  const now = await run("getStudentWorkspace", jordan, { when: "this_week" });
  const refNow = parts(new Date());
  check("Every schedule result states today's weekday, date and time, worked out by code", now.now.localDate === refNow.date && refNow.weekday.startsWith(now.now.weekday), now.now);

  // The independently computed next lesson for Jordan: first scheduled session that starts after now.
  const jordanCourses = new Set(store.enrollments.filter((e) => e.studentId === jordan.userId).map((e) => e.courseId));
  const expected = store.sessions
    .filter((s) => jordanCourses.has(s.courseId) && (s.status === "SCHEDULED" || s.status === "RESCHEDULED") && Date.parse(s.startAt) > Date.now())
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
  const refNext = parts(new Date(expected.startAt));
  check("nextSession is the real next lesson, even when the range asked for is only this week", now.nextSession && now.nextSession.localDate === refNext.date && refNext.weekday.startsWith(now.nextSession.weekday) && now.nextSession.localTime === refNext.time, { got: now.nextSession, want: refNext });
  const today = await run("getStudentWorkspace", jordan, { when: "today" });
  check("nextSession does not depend on the range", JSON.stringify(today.nextSession) === JSON.stringify(now.nextSession));
  const upcoming = await run("getStudentWorkspace", jordan, { when: "upcoming" });
  check("The new 'upcoming' range looks 30 days ahead and starts now", upcoming.sessions.length > 0 && upcoming.sessions.every((s: any) => `${s.localDate} ${s.localTime}` >= `${refNow.date} ${refNow.time}`) , upcoming.sessions.map((s: any) => s.localDate));

  // A cancelled lesson is never "next"; a student with nothing ahead gets null, not a guess.
  store.sessions.filter((s) => jordanCourses.has(s.courseId)).forEach((s) => { if (Date.parse(s.startAt) > Date.now() && s.id === expected.id) s.status = "CANCELLED"; });
  const afterCancel = await run("getStudentWorkspace", jordan, { when: "this_week" });
  check("A cancelled lesson is skipped", !afterCancel.nextSession || afterCancel.nextSession.sessionId !== expected.id, afterCancel.nextSession);
  store.sessions.forEach((s) => { if (jordanCourses.has(s.courseId)) s.status = "CANCELLED"; });
  const none = await run("getStudentWorkspace", jordan, { when: "this_week" });
  check("With no upcoming lesson nextSession is null instead of an invented date", none.nextSession === null);

  resetStore();
  const alexNext = (await run("getTeacherSchedule", alex, { when: "today" })).nextSession;
  const taylorNext = (await run("getTeacherSchedule", taylor, { when: "today" })).nextSession;
  check("A teacher's next lesson comes only from their own courses", !!alexNext && !!taylorNext && alexNext.sessionId !== taylorNext.sessionId && store.courses.find((c) => c.name === alexNext.courseName)?.teacherId === alex.userId && store.courses.find((c) => c.name === taylorNext.courseName)?.teacherId === taylor.userId, { alexNext, taylorNext });
  const caseyNext = (await run("getStudentWorkspace", casey, { when: "today" })).nextSession;
  check("A student never gets another course's lesson as their next one", !caseyNext || store.courses.find((c) => c.name === caseyNext.courseName)?.id === ids.courseC, caseyNext);

  // The scripted model answers "when is my next class" from nextSession, with the same weekday and date as the tool.
  process.env.AI_MOCK = "1";
  const reply = await runAgent({ actor: jordan, role: "STUDENT", userMessage: "when is my next class", history: [] }, { record: async () => undefined });
  const want = (await run("getStudentWorkspace", jordan, { when: "this_week" })).nextSession;
  check("The answer to 'when is my next class' names the real weekday, date and time", reply.reply.includes(want.weekday) && reply.reply.includes(want.localDate) && reply.reply.includes(want.localTime) && reply.reply.includes(want.courseName), reply.reply);
  delete process.env.AI_MOCK;

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
