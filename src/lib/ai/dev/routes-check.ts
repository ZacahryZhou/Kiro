// Route authentication smoke check. Identity must come from Auth.js, never environment variables.
// Run: npx tsx src/lib/ai/dev/routes-check.ts
import { GET as listRoute } from "@/app/api/ai/proposals/route";
import { POST as confirmRoute } from "@/app/api/ai/proposals/[id]/confirm/route";
import { POST as discardRoute } from "@/app/api/ai/proposals/[id]/discard/route";
import { proposalStore } from "../domain/edu/proposal-types";

let failures = 0;
function check(name: string, condition: boolean) {
  if (!condition) failures += 1;
  console.info(`${condition ? "PASS" : "FAIL"} ${name}`);
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (query = "") => listRoute(new Request(`http://localhost/api/ai/proposals${query}`));
const post = (route: typeof confirmRoute, id: string) => route(
  new Request("http://localhost/x", { method: "POST" }), context(id),
);

async function main() {
  proposalStore.clear();
  const proposal = await proposalStore.insert({
    type: "MARK_ATTENDANCE", actorId: "teacher-test", courseId: "course-test",
    payload: { sessionId: "session-test", records: [{ studentId: "student-test", status: "PRESENT" }] },
    summary: "Authentication test only",
  });
  const before = await proposalStore.get(proposal.id);

  delete process.env.DEV_ACTOR_EMAIL;
  check("GET proposals without an authenticated session -> 401", (await get()).status === 401);
  check("Confirm without an authenticated session -> 401", (await post(confirmRoute, proposal.id)).status === 401);
  check("Discard without an authenticated session -> 401", (await post(discardRoute, proposal.id)).status === 401);

  process.env.DEV_ACTOR_EMAIL = "teacher-test@example.test";
  check("A forged DEV_ACTOR_EMAIL still cannot authenticate the proposals route", (await get()).status === 401);
  check("Unauthenticated calls do not mutate proposal state", (await proposalStore.get(proposal.id))?.status === before?.status);
  delete process.env.DEV_ACTOR_EMAIL;

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
