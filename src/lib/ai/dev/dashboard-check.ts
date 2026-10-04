/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script reads untyped tool JSON */
// Assertion script for AI-designed home pages (tool, packing, proposals, confirmation, isolation).
// Run: npx tsx src/lib/ai/dev/dashboard-check.ts
import { DashboardLayoutInput, GRID_COLUMNS, WIDGET_TYPES } from "@/contracts";
import { packWidgets } from "@/lib/dashboard-pack";
import { runAgent } from "../core/agent-loop";
import { eduProposals, proposalStore } from "../domain/edu/proposal-types";
import { findTool, getToolsForRole } from "../domain/edu/tools";
import { actorFor, resetStore, store } from "./fake-store";

const alex = actorFor("teacher1@example.test")!;
const taylor = actorFor("teacher2@example.test")!;
const jordan = actorFor("student1@example.test")!;

let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}
async function run(tool: string, actor: typeof alex, args: unknown = {}) {
  const found = findTool(actor.role, tool);
  if (!found) return { ok: false, data: { error: { code: "UNKNOWN_TOOL" } } as Record<string, any>, proposal: undefined };
  const result = await found.run(actor, args);
  return { ok: result.ok, data: JSON.parse(result.content) as Record<string, any>, proposal: result.proposal };
}
async function chat(actor: typeof alex, message: string) {
  return runAgent({ actor, role: actor.role, userMessage: message, history: [] }, { record: async () => undefined });
}

async function main() {
  resetStore();
  proposalStore.clear();

  // ----- packing -----
  const everything = packWidgets(WIDGET_TYPES.map((type) => ({ type, ...(type === "STUDENT_FOCUS" ? { studentId: "s" } : {}) })));
  const overlap = everything.some((a, i) => everything.some((b, j) => i < j && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  check("Packing places every widget inside the 12 columns", everything.every((item) => item.x >= 0 && item.x + item.w <= GRID_COLUMNS));
  check("Packing never overlaps two widgets", !overlap);
  check("Packing keeps widget ids unique", new Set(everything.map((item) => item.id)).size === everything.length);
  check("Packing honours a requested width", packWidgets([{ type: "COURSE_LIST", size: "full" }])[0].w === 12 && packWidgets([{ type: "COURSE_LIST", size: "small" }])[0].w === 4);
  check("The packed layout passes the contract schema", DashboardLayoutInput.safeParse({ name: "All", theme: "kora", motion: "calm", items: everything.slice(0, 12) }).success);

  // ----- tool -----
  check("Teachers have the layout tools; students do not", !!findTool("TEACHER", "proposeDashboardLayout") && !!findTool("TEACHER", "listMyDashboardLayouts") && !getToolsForRole("STUDENT").some((t) => /Dashboard/.test(t.name)));
  const none = await run("listMyDashboardLayouts", alex);
  check("A new teacher has no saved layouts", none.ok && none.data.layouts.length === 0);

  const first = await run("proposeDashboardLayout", alex, { name: "Teaching day", theme: "ocean", motion: "lively", widgets: [{ type: "TODAY_SESSIONS" }, { type: "PENDING_REQUESTS" }, { type: "STUDENT_FOCUS", studentName: "Jordan" }, { type: "ATTENDANCE_TREND", courseName: "Math" }] });
  check("A layout request becomes a pending DASHBOARD_LAYOUT proposal and saves nothing yet", first.ok && first.proposal?.type === "DASHBOARD_LAYOUT" && first.proposal.status === "pending" && store.layouts.length === 0, first.data);
  const payload = first.proposal?.payload as any;
  check("Code resolved the student name to an ID and the course name to an ID", payload?.items.some((i: any) => i.type === "STUDENT_FOCUS" && i.studentId === "u_jordan") && payload.items.some((i: any) => i.type === "ATTENDANCE_TREND" && i.courseId === "c_math"), payload);
  check("The preview names the widgets, colours and motion", (first.proposal?.preview ?? []).some((l) => l.includes("Student focus (Jordan")) && (first.proposal?.preview ?? []).some((l) => l.includes("Ocean") && l.includes("Lively")), first.proposal?.preview);
  const confirmed = await eduProposals.confirm(alex, first.proposal!.id);
  check("Confirming saves one layout and makes it active", confirmed.ok && confirmed.data.status === "executed" && store.layouts.length === 1 && store.layouts[0].name === "Teaching day", confirmed.ok ? confirmed.data : confirmed);
  const again = await eduProposals.confirm(alex, first.proposal!.id);
  check("Confirming the same proposal twice changes nothing", store.layouts.length === 1 && (!again.ok || again.data.status !== "executed" || store.layouts.length === 1));
  const listed = await run("listMyDashboardLayouts", alex);
  check("The saved layout is listed and flagged active", listed.data.layouts.length === 1 && listed.data.layouts[0].active === true && listed.data.layouts[0].theme === "ocean");

  const replace = await run("proposeDashboardLayout", alex, { name: "Teaching day", widgets: [{ type: "MONTH_CALENDAR" }] });
  check("A layout reusing a saved name warns that it replaces it", (replace.proposal?.preview ?? []).some((l) => l.includes("replaces")), replace.proposal?.preview);

  // ----- refusals -----
  check("An unknown student is refused with a question for the teacher", (await run("proposeDashboardLayout", alex, { name: "X", widgets: [{ type: "STUDENT_FOCUS", studentName: "Zelda" }] })).data.error?.code === "NOT_FOUND");
  check("Another teacher's student cannot be pinned by name", (await run("proposeDashboardLayout", taylor, { name: "X", widgets: [{ type: "STUDENT_FOCUS", studentName: "Jordan" }] })).data.error?.code === "NOT_FOUND");
  check("A student focus widget without a name is refused", !(await run("proposeDashboardLayout", alex, { name: "X", widgets: [{ type: "STUDENT_FOCUS" }] })).ok);
  check("An unknown widget type is refused", !(await run("proposeDashboardLayout", alex, { name: "X", widgets: [{ type: "ROCKET" }] })).ok);
  check("More than twelve widgets are refused", !(await run("proposeDashboardLayout", alex, { name: "X", widgets: Array.from({ length: 13 }, () => ({ type: "STATS" })) })).ok);
  check("A course the teacher does not teach cannot be pinned", (await run("proposeDashboardLayout", taylor, { name: "X", widgets: [{ type: "ATTENDANCE_TREND", courseName: "Math" }] })).data.error?.code === "NOT_FOUND");
  check("Coordinates in the arguments are ignored (code places widgets)", ((await run("proposeDashboardLayout", alex, { name: "Y", widgets: [{ type: "STATS", x: 9, y: 99, w: 1, h: 1 }] })).proposal?.payload as any)?.items[0].x === 0);
  const isolated = await run("listMyDashboardLayouts", taylor);
  check("Another teacher sees none of Alex's layouts", isolated.data.layouts.length === 0);
  check("A student cannot save a layout through the service", !(await (await import("../services")).saveDashboardLayout(jordan, { name: "S", theme: "kora", motion: "calm", items: [{ id: "a", type: "STATS", x: 0, y: 0, w: 12, h: 2 }] })).ok);

  // ----- demo model end to end -----
  proposalStore.clear();
  process.env.AI_MOCK = "1";
  const demo = await chat(alex, "Design my home page called Evening prep: show today, my requests and Jordan's progress in sunset colours, lively.");
  check("The demo model turns a sentence into a layout proposal", demo.proposals.length === 1 && demo.proposals[0].type === "DASHBOARD_LAYOUT", demo.reply);
  const demoPayload = demo.proposals[0]?.payload as any;
  check("The proposal carries the right theme, motion, name and widgets", demoPayload?.theme === "sunset" && demoPayload.motion === "lively" && demoPayload.name === "Evening prep" && ["TODAY_SESSIONS", "PENDING_REQUESTS", "STUDENT_FOCUS"].every((t) => demoPayload.items.some((i: any) => i.type === t)), demoPayload);
  check("The reply says nothing has changed until confirmation", /confirm/i.test(demo.reply), demo.reply);
  check("Asking with no widgets gets a question, not a proposal", (await chat(alex, "Design my home page please")).proposals.length === 0);
  const studentTry = await chat(jordan, "Design my home page with today and requests");
  check("A student asking for a home page design gets no proposal", studentTry.proposals.length === 0);

  delete process.env.AI_MOCK;
  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
