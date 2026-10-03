/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script reads untyped JSON */
// Assertion script for the proposal routes, calling the handlers directly (no server, no key).
// Run: npx tsx src/lib/ai/dev/routes-check.ts
import { GET as listRoute } from "@/app/api/ai/proposals/route";
import { POST as confirmRoute } from "@/app/api/ai/proposals/[id]/confirm/route";
import { POST as discardRoute } from "@/app/api/ai/proposals/[id]/discard/route";
import { proposalStore } from "../domain/edu/proposal-types";
import { findTool } from "../domain/edu/tools";
import { actorFor, ids, resetStore, store } from "./fake-store";

let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}

const asUser = (email: string | undefined) => {
  if (email) process.env.DEV_ACTOR_EMAIL = email;
  else delete process.env.DEV_ACTOR_EMAIL;
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (query = "") => listRoute(new Request(`http://localhost/api/ai/proposals${query}`));
const post = (route: typeof confirmRoute, id: string) => route(new Request("http://localhost/x", { method: "POST" }), ctx(id));
const json = async (response: Response) => (await response.json()) as Record<string, any>;

async function main() {
  resetStore();
  proposalStore.clear();
  const alex = actorFor("teacher1@example.test")!;
  const created = await findTool("TEACHER", "proposeMarkAttendance")!.run(alex, {
    sessionId: "s_a_today",
    records: [{ studentId: ids.jordan, status: "PRESENT" }, { studentId: ids.sam, status: "LEAVE" }],
  });
  const id = created.proposal!.id;
  const attendanceBefore = store.attendance.length;

  asUser(undefined);
  const noSession = await get();
  check("No signed-in user -> 401 on every route", noSession.status === 401 && (await post(confirmRoute, id)).status === 401 && (await post(discardRoute, id)).status === 401);
  check("Nothing changed for the unauthenticated calls", store.attendance.length === attendanceBefore && (await proposalStore.get(id))?.status === "pending");

  asUser("teacher1@example.test");
  const listed = await json(await get("?status=pending"));
  check("GET lists my pending proposals", listed.proposals.length === 1 && listed.proposals[0].id === id && listed.proposals[0].status === "pending");
  check("GET rejects an unknown status filter", (await get("?status=bogus")).status === 400);

  asUser("teacher2@example.test");
  check("Another teacher sees none of my proposals", (await json(await get())).proposals.length === 0);
  const forbiddenConfirm = await confirmRoute(new Request("http://localhost/x", { method: "POST" }), ctx(id));
  check("Another teacher's confirm -> 403 and nothing is written", forbiddenConfirm.status === 403 && store.attendance.length === attendanceBefore);
  check("Another teacher's discard -> 403", (await post(discardRoute, id)).status === 403);

  asUser("teacher1@example.test");
  check("Unknown proposal -> 404", (await post(confirmRoute, "prop_999")).status === 404);
  const confirmed = await post(confirmRoute, id);
  const body = await json(confirmed);
  check("Confirm -> 200 executed with the attendance result", confirmed.status === 200 && body.status === "executed" && body.result.attendance.length === 2 && body.result.deductions.length === 1, body);
  const second = await json(await post(confirmRoute, id));
  check("Confirming again -> 200 executed, no new records", second.status === "executed" && store.attendance.length === attendanceBefore + 2);
  check("Discarding an executed proposal -> 409", (await post(discardRoute, id)).status === 409);

  const other = await findTool("TEACHER", "proposeMarkAttendance")!.run(alex, {
    sessionId: "s_a_thu",
    records: [{ studentId: ids.jordan, status: "ABSENT" }, { studentId: ids.sam, status: "PRESENT" }],
  });
  const discarded = await post(discardRoute, other.proposal!.id);
  check("Discard -> 200 discarded", discarded.status === 200 && (await json(discarded)).status === "discarded");
  check("Confirm after discard -> 409", (await post(confirmRoute, other.proposal!.id)).status === 409);

  const stale = await findTool("TEACHER", "proposeMarkAttendance")!.run(alex, {
    sessionId: "s_a_next_thu",
    records: [{ studentId: ids.jordan, status: "PRESENT" }, { studentId: ids.sam, status: "PRESENT" }],
  });
  store.sessions.find((s) => s.id === "s_a_next_thu")!.status = "CANCELLED";
  const failed = await post(confirmRoute, stale.proposal!.id);
  const failedBody = await json(failed);
  check("A failed confirmation is 200 with status failed and the service error", failed.status === 200 && failedBody.status === "failed" && failedBody.error.code === "CONFLICT", failedBody);
  check("Error responses carry only code and message", !JSON.stringify(await json(await post(confirmRoute, "prop_999"))).includes("stack"));

  asUser(undefined);
  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
