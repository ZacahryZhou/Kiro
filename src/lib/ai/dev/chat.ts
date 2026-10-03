// Terminal test entry point for the AI agent (development only).
// Run: DEV_ROLE=TEACHER DEV_USER_EMAIL=teacher1@example.test npx tsx src/lib/ai/dev/chat.ts
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import type { Role } from "@/contracts";
import { runAgent, type ChatTurn } from "../core/agent-loop";
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
  const rl = createInterface({ input: stdin, output: stdout });
  rl.on("close", () => process.exit(0));

  for (;;) {
    const line = (await rl.question("> ")).trim();
    if (line === "") continue;
    if (line === "exit" || line === "quit") break;
    const { reply } = await runAgent({ actor, role: role as Role, userMessage: line, history });
    stdout.write(`${reply}\n`);
    history.push({ role: "user", content: line }, { role: "assistant", content: reply });
    history.splice(0, Math.max(0, history.length - MAX_HISTORY));
  }
  rl.close();
}

main();
