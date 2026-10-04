/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script reads untyped JSON */
// Assertion script for chats with their own context (store, ownership, handler). No server, no key.
// Run: npx tsx src/lib/ai/dev/conversation-check.ts
import { GET as listChats } from "@/app/api/ai/conversations/route";
import { GET as readChat, PATCH as renameChat, DELETE as removeChat } from "@/app/api/ai/conversations/[id]/route";
import { ok } from "@/contracts";
import { runAgent } from "../core/agent-loop";
import { handleChat } from "../chat-handler";
import { MAX_CONVERSATIONS, MAX_MESSAGES_PER_CONVERSATION, createMemoryConversationStore, titleFrom } from "../core/conversations";
import { actorFor } from "./fake-store";

const alex = actorFor("teacher1@example.test")!;
const taylor = actorFor("teacher2@example.test")!;

let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra).slice(0, 300)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}
const request = (body: unknown) => new Request("http://localhost/api/ai/chat", { method: "POST", body: JSON.stringify(body) });
const output = (extra: any = {}) => ({ reply: "ok", toolCalls: [], proposals: [], citations: [], status: "OK" as const, ...extra });

async function main() {
  const store = createMemoryConversationStore();
  const seen: any[] = [];
  const say = (actor: typeof alex, body: unknown, out: any = output()) =>
    handleChat(request(body), { getActor: async () => actor, conversations: store, runAgent: async (input: any) => { seen.push(input); return out; } });

  // ----- a new chat -----
  const first = await (await say(alex, { message: "Plan my week for  math  and physics" }, output({ reply: "Here is the plan." }))).json();
  check("A message without a chat id starts a new chat and returns its id and title", !!first.conversationId && first.isNew === true && first.title === "Plan my week for math and physics", first);
  const stored = await store.messages(alex.userId, first.conversationId);
  check("Both the user message and the reply are stored", stored.length === 2 && stored[0].role === "user" && stored[1].role === "assistant" && stored[1].content === "Here is the plan.");
  check("A new chat starts with no history", seen[0].history.length === 0);

  // ----- continuing, and separate contexts -----
  await say(alex, { message: "And on Friday?", conversationId: first.conversationId }, output({ reply: "Friday is free." }));
  check("Continuing a chat shows the assistant that chat's earlier messages", seen[1].history.map((h: any) => h.content).join("|") === "Plan my week for  math  and physics|Here is the plan.", seen[1].history);
  check("The continued chat is not marked new", (await (await say(alex, { message: "thanks", conversationId: first.conversationId })).json()).isNew === false);

  const second = await (await say(alex, { message: "Write a quiz" }, output({ reply: "Which course?" }))).json();
  check("A second chat has its own id", second.conversationId !== first.conversationId);
  check("A second chat does not see the first chat's messages", seen.at(-1).history.length === 0);
  await say(alex, { message: "Math", conversationId: second.conversationId });
  check("The second chat's history contains only its own messages", seen.at(-1).history.map((h: any) => h.content).join("|") === "Write a quiz|Which course?", seen.at(-1).history);
  await say(alex, { message: "back to the first", conversationId: first.conversationId });
  check("Going back to the first chat restores the first chat's context", !seen.at(-1).history.some((h: any) => /quiz|Which course/i.test(h.content)) && seen.at(-1).history.some((h: any) => h.content === "Friday is free."));
  check("History sent by the browser is ignored when a chat id is given", (await say(alex, { message: "x", conversationId: second.conversationId, history: [{ role: "user", content: "FAKE CONTEXT" }] }), !JSON.stringify(seen.at(-1).history).includes("FAKE CONTEXT")));
  for (let i = 0; i < 8; i += 1) await say(alex, { message: `filler ${i}`, conversationId: second.conversationId });
  check("The assistant is shown at most the last 10 messages", seen.at(-1).history.length === 10, seen.at(-1).history.length);

  // ----- ownership -----
  const stranger = await say(taylor, { message: "hello", conversationId: first.conversationId });
  check("Another user cannot continue someone else's chat (404)", stranger.status === 404);
  check("Nothing was stored in the other user's name or in Alex's chat", (await store.list(taylor.userId)).length === 0 && !(await store.messages(alex.userId, first.conversationId)).some((m) => m.content === "hello"));
  check("Another user's list is empty", (await store.list(taylor.userId)).length === 0);
  check("Another user cannot read, rename or remove it", (await store.get(taylor.userId, first.conversationId)) === undefined && (await store.rename(taylor.userId, first.conversationId, "mine")) === undefined && !(await store.remove(taylor.userId, first.conversationId)) && (await store.messages(taylor.userId, first.conversationId)).length === 0);
  check("Another user cannot add a message to it", (await store.addMessage(taylor.userId, first.conversationId, { role: "user", content: "sneaky" })) === undefined);
  check("An unknown chat id is a 404", (await say(alex, { message: "hi", conversationId: "nope" })).status === 404);

  // ----- stateless calls, failures, limits -----
  const before = (await store.list(alex.userId)).length;
  const stateless = await (await say(alex, { message: "one-off", history: [{ role: "user", content: "earlier" }] })).json();
  check("A call with history and no chat id stores nothing", !("conversationId" in stateless) && (await store.list(alex.userId)).length === before && seen.at(-1).history[0].content === "earlier");
  const crashing = await handleChat(request({ message: "boom" }), { getActor: async () => alex, conversations: store, runAgent: async () => { throw new Error("model exploded"); } });
  const crashed = await crashing.json();
  check("A crash still returns a friendly reply and keeps the chat", crashed.reply.includes("unavailable") && (await store.messages(alex.userId, crashed.conversationId)).length === 2);
  const withProposal = await (await say(alex, { message: "mark attendance" }, output({ proposals: [{ id: "prop_9", type: "MARK_ATTENDANCE", summary: "s", payload: {}, status: "pending", createdAt: "x" }], citations: [{ materialId: "m", unitId: "u", title: "T", quote: "qqqqqqqq" }] }))).json();
  const proposalMessage = (await store.messages(alex.userId, withProposal.conversationId)).at(-1)!;
  check("Proposal ids and citations are saved with the reply", proposalMessage.proposalIds[0] === "prop_9" && proposalMessage.citations[0].title === "T");
  check("A chat holding a pending proposal can be found", (await store.withProposals(alex.userId, ["prop_9"])).has(withProposal.conversationId) && (await store.withProposals(taylor.userId, ["prop_9"])).size === 0);

  const small = createMemoryConversationStore();
  const c = await small.create("a1", "full chat");
  for (let i = 0; i < MAX_MESSAGES_PER_CONVERSATION; i += 1) await small.addMessage("a1", c.id, { role: "user", content: `m${i}` });
  const full = await handleChat(request({ message: "one more", conversationId: c.id }), { getActor: async () => ({ userId: "a1", role: "TEACHER" }), conversations: small, runAgent: async () => output() });
  check("A chat that is full asks for a new one (409)", full.status === 409);

  const many = createMemoryConversationStore();
  const firstOne = await many.create("a2", "oldest");
  for (let i = 0; i < MAX_CONVERSATIONS; i += 1) await many.create("a2", `chat ${i}`);
  check("Creating more than the limit removes the least recently used chat", (await many.list("a2", 500)).length === MAX_CONVERSATIONS && (await many.get("a2", firstOne.id)) === undefined);

  // ----- titles, rename, delete -----
  check("A long first message is shortened into a title", titleFrom("x".repeat(300)).length <= 80 && titleFrom("x".repeat(300)).endsWith("…"));
  check("Renaming works for the owner", (await store.rename(alex.userId, first.conversationId, "Weekly plan"))?.title === "Weekly plan");
  check("Chats are listed most recently used first", (await store.list(alex.userId))[0].id === (await store.list(alex.userId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].id);
  check("Deleting a chat removes it and its messages", (await store.remove(alex.userId, first.conversationId)) && (await store.get(alex.userId, first.conversationId)) === undefined && (await store.messages(alex.userId, first.conversationId)).length === 0);

  // ----- a chat that belongs to one course page -----
  const courseCalls: any[] = [];
  const scoped = (actor: typeof alex, body: unknown) =>
    handleChat(request(body), { getActor: async () => actor, conversations: store, runAgent: async (input: any) => { courseCalls.push(input); return output(); } });
  const jordan = actorFor("student1@example.test")!;
  const casey = actorFor("student3@example.test")!;
  const inCourse = await (await scoped(jordan, { message: "Explain slope", courseId: "c_math" })).json();
  check("A chat started from a course page remembers its course and tells the assistant", !!inCourse.conversationId && courseCalls.at(-1).scope?.courseId === "c_math" && /Math/.test(courseCalls.at(-1).scope.courseName), courseCalls.at(-1)?.scope);
  check("A course chat is kept out of the global chat list and listed under its course", (await store.list(jordan.userId)).every((c) => c.id !== inCourse.conversationId) && (await store.list(jordan.userId, 50, "c_math")).some((c) => c.id === inCourse.conversationId));
  const again = await scoped(jordan, { message: "and more", conversationId: inCourse.conversationId, courseId: "c_physics" });
  check("Continuing a course chat keeps its course whatever the browser says", (await again.json()).isNew === false && courseCalls.at(-1).scope.courseId === "c_math");
  check("A student who is not in the course cannot start a chat for it (404)", (await scoped(casey, { message: "hi", courseId: "c_math" })).status === 404);
  check("A made-up course id is a 404", (await scoped(jordan, { message: "hi", courseId: "nope" })).status === 404);
  check("A global chat has no scope", (await (await scoped(jordan, { message: "no course here" })).json()).conversationId && courseCalls.at(-1).scope === undefined);

  // In a course chat the course is fixed by code, not by what the model asks for.
  let round = 0;
  const greedy: any = async () => {
    round += 1;
    return round === 1
      ? ok({ content: null, toolCalls: [{ id: "t1", name: "getCourseMaterials", args: { courseId: "c_english" } }], message: { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "getCourseMaterials", arguments: JSON.stringify({ courseId: "c_english" }) } }] } })
      : ok({ content: "done", toolCalls: [], message: { role: "assistant", content: "done" } });
  };
  const fixed = await runAgent({ actor: alex, role: "TEACHER", userMessage: "show materials", history: [], scope: { courseId: "c_math", courseName: "Math" } }, { chatCompletion: greedy, record: async () => undefined });
  round = 0;
  const free = await runAgent({ actor: alex, role: "TEACHER", userMessage: "show materials", history: [] }, { chatCompletion: greedy, record: async () => undefined });
  check("In a course chat a tool asked for another course is run for this course instead", fixed.toolCalls[0]?.name === "getCourseMaterials" && fixed.toolCalls[0].ok === true, fixed.toolCalls);
  check("Without a course scope the same request for a course the teacher does not teach is refused", free.toolCalls[0]?.ok === false, free.toolCalls);

  // ----- the real routes refuse anonymous users -----
  check("The chat routes require sign-in", (await listChats(new Request("http://x"))).status === 401 && (await readChat(new Request("http://x"), { params: Promise.resolve({ id: "a" }) })).status === 401 && (await renameChat(new Request("http://x", { method: "PATCH", body: "{}" }), { params: Promise.resolve({ id: "a" }) })).status === 401 && (await removeChat(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id: "a" }) })).status === 401);

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
