// Assertion script for the live trace behind the admin Agent Console.
// Run: npx tsx src/lib/ai/dev/trace-check.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runAgent } from "../core/agent-loop";
import { canViewAgentConsole } from "../trace/access";
import { clearEvents, publish, recentEvents, subscribe } from "../trace/bus";
import { STEP_DEFS, filesForTool } from "../trace/steps";
import { createTracer } from "../trace/tracer";
import { proposalStore } from "../domain/edu/proposal-types";
import { actorFor, resetStore } from "./fake-store";

process.env.AI_MOCK = "1";
let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}

async function main() {
  // ----- the diagram only names files that exist -----
  const root = process.cwd();
  const listed = new Set([...STEP_DEFS.flatMap((s) => s.files), ...["answerFromCourseMaterials", "getStudentMemory", "getMyProfile", "proposeMarkAttendance", "getWorkspace"].flatMap(filesForTool)]);
  const missing = [...listed].filter((file) => !existsSync(join(root, file)));
  check("Every file shown in the diagram exists in the repository", missing.length === 0, missing);
  check("Step ids are unique", new Set(STEP_DEFS.map((s) => s.id)).size === STEP_DEFS.length);

  // ----- a run emits ordered, complete events -----
  resetStore();
  proposalStore.clear();
  clearEvents();
  const alex = actorFor("teacher1@example.test")!;
  const secret = "Jordan came to math today and Sam is on leave";
  const live: number[] = [];
  const stop = subscribe((e) => live.push(e.seq));
  await runAgent({ actor: alex, role: alex.role, userMessage: secret, history: [] }, { record: () => undefined });
  stop();
  const events = recentEvents();
  const steps = events.map((e) => `${e.step}:${e.status}`);
  check("A run emits prompt, model, tool, proposal, run log and reply events", ["prompt:start", "prompt:done", "model:start", "model:done", "tool:start", "tool:done", "proposal:done", "runlog:done", "reply:done"].every((s) => steps.includes(s)), steps);
  check("Events share one run id and sequence numbers rise", new Set(events.map((e) => e.runId)).size === 1 && events.every((e, i) => i === 0 || e.seq > events[i - 1].seq));
  check("Prompt comes before the first model call and the reply comes last", steps.indexOf("prompt:done") < steps.indexOf("model:start") && steps[steps.length - 1] === "reply:done", steps);
  check("Subscribers receive events live", live.length === events.length && live.length > 0);
  check("Tool events name the tool and its files", events.some((e) => e.step === "tool" && e.label && e.files?.includes("src/services/read.ts")));

  // ----- privacy -----
  const dump = JSON.stringify(events);
  check("Events never contain the message text or user ids", !dump.includes("Jordan") && !dump.includes("Sam") && !dump.includes(alex.userId));

  // ----- failures are traced and tracing never throws -----
  clearEvents();
  await runAgent({ actor: alex, role: alex.role, userMessage: "hello", history: [] }, { record: () => undefined, chatCompletion: async () => ({ ok: false, error: { code: "INTERNAL", message: "boom" } }) });
  check("A failed model call is traced as an error and the reply step errors", recentEvents().some((e) => e.step === "model" && e.status === "error") && recentEvents().some((e) => e.step === "reply" && e.status === "error"));
  const t = createTracer("TEACHER");
  const stop2 = subscribe(() => { throw new Error("bad subscriber"); });
  let threw = false;
  try { t.emit("request", "start"); publish({ runId: "x", role: "TEACHER", step: "reply", status: "done" }); } catch { threw = true; }
  stop2();
  check("A throwing subscriber never breaks the agent", !threw);

  // ----- ring buffer -----
  clearEvents();
  for (let i = 0; i < 400; i += 1) publish({ runId: "r", role: "TEACHER", step: "model", status: "done" });
  check("The buffer keeps only the most recent 300 events", recentEvents().length === 300);

  // ----- access -----
  const teacher = { userId: "u1", role: "TEACHER" as const };
  const student = { userId: "u2", role: "STUDENT" as const };
  check("Anonymous users cannot view the console", !canViewAgentConsole(null, null, { NODE_ENV: "development" } as NodeJS.ProcessEnv));
  check("In development a teacher can", canViewAgentConsole(teacher, "t@example.test", { NODE_ENV: "development" } as NodeJS.ProcessEnv));
  check("In development a student cannot", !canViewAgentConsole(student, "s@example.test", { NODE_ENV: "development" } as NodeJS.ProcessEnv));
  check("In production a teacher without allowlisting cannot", !canViewAgentConsole(teacher, "t@example.test", { NODE_ENV: "production" } as NodeJS.ProcessEnv));
  check("In production an allowlisted email can (case-insensitive)", canViewAgentConsole(teacher, "Admin@Example.test", { NODE_ENV: "production", AI_ADMIN_EMAILS: "x@y.z, admin@example.test" } as NodeJS.ProcessEnv));

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}
main();
