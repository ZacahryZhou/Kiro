// Terminal test entry point for the AI agent (development only).
// Run: DEV_ROLE=TEACHER DEV_USER_EMAIL=teacher1@example.test npx tsx --env-file=.env src/lib/ai/dev/chat.ts
// (--env-file loads AI_BASE_URL, AI_API_KEY and AI_MODEL from your local .env; never commit that file.)
// RAW=1 sends each line straight to the model with no tools, to test connectivity.
// Commands: /pending, /confirm <id>, /discard <id>, exit.
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import type { Role } from "@/contracts";
import { runAgent, type ChatTurn } from "../core/agent-loop";
import { chatCompletion } from "../core/provider";
import { loadPolicy } from "../domain/edu/policy";
import { eduProposals } from "../domain/edu/proposal-types";
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
  if (loadPolicy().source === "fallback") {
    stdout.write("Warning: docs/AI-REPLY-POLICY.md could not be loaded; using the short built-in rules.\n");
  }

  const history: ChatTurn[] = [];
  const respond = async (line: string): Promise<string> => {
    if (process.env.RAW === "1") {
      const result = await chatCompletion({ messages: [...history, { role: "user", content: line }] });
      return result.ok ? (result.data.content ?? "(empty reply)") : `Error: ${result.error.message}`;
    }
    const result = await runAgent({ actor, role: role as Role, userMessage: line, history });
    const used = result.toolCalls.map((c) => `${c.name}${c.ok ? "" : ` (${c.error ?? "failed"})`} ${c.ms}ms`);
    const titles = [...new Set(result.citations.map((c) => c.title))];
    const blocks = [used.length > 0 ? `[tools: ${used.join(", ")}]` : "", result.reply, titles.length > 0 ? `Sources: ${titles.join("; ")}` : ""];
    for (const proposal of result.proposals) {
      const lines = await eduProposals.describe(actor, proposal.id);
      blocks.push(
        [
          `--- Proposal ${proposal.id} (pending, nothing has been changed yet) ---`,
          ...(lines.ok ? lines.data.map((l) => `  ${l}`) : [`  ${proposal.summary}`]),
          `Type /confirm ${proposal.id} to apply it, or /discard ${proposal.id}.`,
        ].join("\n"),
      );
    }
    return blocks.filter(Boolean).join("\n");
  };

  const command = async (line: string): Promise<string> => {
    const [name, id] = line.split(/\s+/);
    if (name === "/pending") {
      const pending = await eduProposals.list(actor, "pending");
      return pending.length === 0 ? "No pending proposals." : pending.map((p) => `${p.id}: ${p.summary}`).join("\n");
    }
    if ((name === "/confirm" || name === "/discard") && !id) return `Usage: ${name} <proposal id>`;
    if (name === "/confirm") {
      const result = await eduProposals.confirm(actor, id);
      if (!result.ok) return `Error: ${result.error.message}`;
      if (result.data.status === "failed") return `Failed: ${result.data.error?.message}`;
      const done = result.data.result as { attendance?: unknown[]; deductions?: unknown[]; sessionStatus?: string };
      return done.attendance
        ? `Executed: ${done.attendance.length} attendance records, ${done.deductions?.length ?? 0} deduction(s), session ${done.sessionStatus}.`
        : "Executed.";
    }
    if (name === "/discard") {
      const result = await eduProposals.discard(actor, id);
      return result.ok ? "Discarded." : `Error: ${result.error.message}`;
    }
    return `Unknown command ${name}. Try /pending, /confirm <id>, /discard <id> or exit.`;
  };
  const rl = createInterface({ input: stdin });
  stdout.write("> ");
  // Lines are handled one at a time, so piped input also waits for each reply before it ends.
  for await (const raw of rl) {
    const line = raw.trim();
    if (line === "exit" || line === "quit") break;
    if (line !== "") {
      const reply = line.startsWith("/") ? await command(line) : await respond(line);
      stdout.write(`${reply}\n`);
      if (!line.startsWith("/")) {
        history.push({ role: "user", content: line }, { role: "assistant", content: reply });
        history.splice(0, Math.max(0, history.length - MAX_HISTORY));
      }
    }
    stdout.write("> ");
  }
  rl.close();
}

main();
