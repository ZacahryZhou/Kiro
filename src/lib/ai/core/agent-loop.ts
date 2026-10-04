import type { Actor, Citation, ProposalView, Role } from "@/contracts";
import type { Policy } from "../domain/edu/policy";
import { getSystemPrompt } from "../domain/edu/prompts";
import { findTool, getToolsForRole } from "../domain/edu/tools";
import { chatCompletion } from "./provider";
import { recordRunInMemory, type RunRecorder, type ToolCallLog } from "./runs";
import type { ChatMessage, ToolCall } from "./types";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AgentInput = {
  actor: Actor;
  role: Role;
  userMessage: string;
  history: ChatTurn[];
};
export type AgentOutput = {
  reply: string;
  toolCalls: ToolCallLog[];
  /** Proposals created during this run; the teacher still has to confirm them. */
  proposals: ProposalView[];
  citations: Citation[];
  status: "OK" | "ERROR";
  error?: string;
};

/** Injectable pieces, so the loop can be tested without a network or a real model. */
export type AgentDeps = {
  chatCompletion?: typeof chatCompletion;
  now?: () => Date;
  record?: RunRecorder;
  maxRounds?: number;
  timeoutMs?: number;
  /** Behaviour rules; defaults to the ones loaded from docs/AI-REPLY-POLICY.md. */
  policy?: Policy;
};

const MAX_ROUNDS = 6;
const TOTAL_TIMEOUT_MS = 60_000;
const MAX_HISTORY = 10;
const GIVE_UP_REPLY = "I couldn't work this out. Please try rephrasing your request.";
const TIMEOUT_REPLY = "That took too long. Please try again, or ask for something smaller.";

/**
 * The model <-> tool loop. The model may call tools for up to `maxRounds` rounds; every tool runs
 * with the signed-in actor injected by code. Never throws; failures become a friendly reply.
 */
export async function runAgent(input: AgentInput, deps: AgentDeps = {}): Promise<AgentOutput> {
  const complete = deps.chatCompletion ?? chatCompletion;
  const now = deps.now ?? (() => new Date());
  const record = deps.record ?? recordRunInMemory;
  const maxRounds = deps.maxRounds ?? MAX_ROUNDS;
  const timeoutMs = deps.timeoutMs ?? TOTAL_TIMEOUT_MS;

  const startedAt = now().getTime();
  const toolLog: ToolCallLog[] = [];
  const proposals: ProposalView[] = [];
  const citations: Citation[] = [];
  let finalReply: string | undefined;

  const finish = (reply: string, status: "OK" | "ERROR", error?: string): AgentOutput => {
    record({
      actorId: input.actor.userId,
      role: input.role,
      intentSummary: input.userMessage.slice(0, 200),
      toolCalls: toolLog,
      status,
      error,
      createdAt: new Date(startedAt).toISOString(),
    });
    return { reply, toolCalls: toolLog, proposals, citations, status, error };
  };

  const tools = getToolsForRole(input.role);
  const specs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
  const messages: ChatMessage[] = [
    { role: "system", content: getSystemPrompt(input.role, new Date(startedAt), deps.policy) },
    ...input.history.slice(-MAX_HISTORY).map((turn): ChatMessage => ({ role: turn.role, content: turn.content })),
    { role: "user", content: input.userMessage },
  ];

  for (let round = 0; round < maxRounds; round += 1) {
    if (now().getTime() - startedAt > timeoutMs) return finish(TIMEOUT_REPLY, "ERROR", "TIMEOUT");

    const completion = await complete({ messages, tools: specs.length > 0 ? specs : undefined });
    if (!completion.ok) return finish(completion.error.message, "ERROR", completion.error.message);

    const { content, toolCalls, message } = completion.data;
    messages.push(message);
    if (toolCalls.length === 0) {
      return finish(content?.trim() || "I don't have an answer for that.", "OK");
    }

    for (const call of toolCalls) {
      messages.push({ role: "tool", tool_call_id: call.id, content: await runToolCall(call) });
    }
    // A tool may supply an already-verified reply (materials Q&A); it is returned as is, not rewritten.
    if (finalReply !== undefined) return finish(finalReply, "OK");
  }
  return finish(GIVE_UP_REPLY, "ERROR", "MAX_ROUNDS");

  async function runToolCall(call: ToolCall): Promise<string> {
    const began = now().getTime();
    const log = (ok: boolean, error?: string) =>
      toolLog.push({ name: call.name, ok, ms: now().getTime() - began, ...(error ? { error } : {}) });

    const tool = findTool(input.role, call.name);
    if (!tool) {
      log(false, "UNKNOWN_TOOL");
      return JSON.stringify({ error: { code: "UNKNOWN_TOOL", message: `There is no tool named ${call.name}.` } });
    }
    if (call.args === null) {
      log(false, "INVALID_ARGUMENTS");
      return JSON.stringify({ error: { code: "INVALID_ARGUMENTS", message: call.argsError ?? "The arguments were not valid JSON." } });
    }
    const result = await tool.run(input.actor, call.args, { complete });
    if (result.proposal) proposals.push(result.proposal);
    if (result.citations) citations.push(...result.citations);
    if (result.finalReply !== undefined && finalReply === undefined) finalReply = result.finalReply;
    log(result.ok, result.ok ? undefined : errorCode(result.content));
    return result.content;
  }
}

function errorCode(content: string): string {
  try {
    return (JSON.parse(content) as { error?: { code?: string } }).error?.code ?? "ERROR";
  } catch {
    return "ERROR";
  }
}
