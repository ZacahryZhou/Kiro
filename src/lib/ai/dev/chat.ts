// Terminal test entry point for the AI agent (development only).
// Run: DEV_ROLE=TEACHER DEV_USER_EMAIL=teacher1@example.test npx tsx --env-file=.env src/lib/ai/dev/chat.ts
// (--env-file loads AI_BASE_URL, AI_API_KEY and AI_MODEL from your local .env; never commit that file.)
// RAW=1 sends each line straight to the model with no tools, to test connectivity.
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import type { Role } from "@/contracts";
import { runAgent, type ChatTurn } from "../core/agent-loop";
import { chatCompletion } from "../core/provider";
import { actorFor, findUserByEmail } from "./fake-store";

const MAX_HISTORY = 10;

function fatal(message: string): never {
  stderr.write(`${message}\n`);
  process.exit(1);
}

async function main() {
  const role = process.env.DEV_ROLE;
  const email = process.env.DEV_USER_EMAIL;
  if (role !== "TEACHER" && role !== "STUDENT") {
    fatal("Set DEV_ROLE to TEACHER or STUDENT.");
  }
  if (!email) fatal("Set DEV_USER_EMAIL, for example teacher1@example.test.");

  const actor = actorFor(email);
  if (!actor) fatal(`No demo user has the email ${email}.`);
  if (actor.role !== role) fatal(`${email} is a ${actor.role}, but DEV_ROLE is ${role}.`);

  const name = findUserByEmail(email)!.name;
  stdout.write(`Signed in as ${name} (${role}). Type a message, or "exit" to quit.\n`);

  const history: ChatTurn[] = [];
  const respond = async (line: string): Promise<string> => {
    if (process.env.RAW === "1") {
      const result = await chatCompletion({ messages: [...history, { role: "user", content: line }] });
      return result.ok ? (result.data.content ?? "(empty reply)") : `Error: ${result.error.message}`;
    }
    const result = await runAgent({ actor, role: role as Role, userMessage: line, history });
    const used = result.toolCalls.map((c) => `${c.name}${c.ok ? "" : ` (${c.error ?? "failed"})`} ${c.ms}ms`);
    return used.length > 0 ? `[tools: ${used.join(", ")}]\n${result.reply}` : result.reply;
  };
  const rl = createInterface({ input: stdin });
  stdout.write("> ");
  // Lines are handled one at a time, so piped input also waits for each reply before it ends.
  for await (const raw of rl) {
    const line = raw.trim();
    if (line === "exit" || line === "quit") break;
    if (line !== "") {
      const reply = await respond(line);
      stdout.write(`${reply}\n`);
      history.push({ role: "user", content: line }, { role: "assistant", content: reply });
      history.splice(0, Math.max(0, history.length - MAX_HISTORY));
    }
    stdout.write("> ");
  }
  rl.close();
}

main();
