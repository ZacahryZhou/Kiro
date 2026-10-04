import type { Actor, Citation, ProposalView, Role } from "@/contracts";
import type { Policy } from "../domain/edu/policy";
import { getSystemPrompt } from "../domain/edu/prompts";
import { findTool, getToolsForRole } from "../domain/edu/tools";
import { eduMockModel } from "../domain/edu/mock-model";
import { chatCompletion } from "./provider";
import { defaultRunRecorder, type RunRecorder, type ToolCallLog } from "./runs";
import { createTracer, filesForTool, type Tracer } from "../trace";
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
  /** Live trace for the admin console; defaults to a new tracer on the shared bus. */
  tracer?: Tracer;
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
  const complete: typeof chatCompletion = deps.chatCompletion ?? ((params, options) => chatCompletion(params, { mock: eduMockModel, ...options }));
  const now = deps.now ?? (() => new Date());
  const record = deps.record ?? defaultRunRecorder;
  const maxRounds = deps.maxRounds ?? MAX_ROUNDS;
  const timeoutMs = deps.timeoutMs ?? TOTAL_TIMEOUT_MS;

  const tracer = deps.tracer ?? createTracer(input.role);
  const startedAt = now().getTime();
  const toolLog: ToolCallLog[] = [];
  const proposals: ProposalView[] = [];
  const citations: Citation[] = [];
  let finalReply: string | undefined;

  const finish = async (reply: string, status: "OK" | "ERROR", error?: string): Promise<AgentOutput> => {
    tracer.emit("runlog", "start");
    try {
      await record({
        actorId: input.actor.userId,
        role: input.role,
        intentSummary: input.userMessage.slice(0, 200),
        toolCalls: toolLog,
        status,
        error,
        createdAt: new Date(startedAt).toISOString(),
      });
    } catch {
      // Logging must never break a reply.
    }
    tracer.emit("runlog", "done");
    tracer.emit("reply", status === "OK" ? "done" : "error", error ? { label: error.slice(0, 40) } : undefined);
    return { reply, toolCalls: toolLog, proposals, citations, status, error };
  };

  const tools = getToolsForRole(input.role);
  const specs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
  tracer.emit("prompt", "start");
  const messages: ChatMessage[] = [
    { role: "system", content: getSystemPrompt(input.role, new Date(startedAt), deps.policy) },
    ...input.history.slice(-MAX_HISTORY).map((turn): ChatMessage => ({ role: turn.role, content: turn.content })),
    { role: "user", content: input.userMessage },
  ];
  tracer.emit("prompt", "done");

  for (let round = 0; round < maxRounds; round += 1) {
    if (now().getTime() - startedAt > timeoutMs) return finish(TIMEOUT_REPLY, "ERROR", "TIMEOUT");

    tracer.emit("model", "start", { label: `round ${round + 1}` });
    const modelBegan = now().getTime();
    const completion = await complete({ messages, tools: specs.length > 0 ? specs : undefined });
    tracer.emit("model", completion.ok ? "done" : "error", { label: `round ${round + 1}`, ms: now().getTime() - modelBegan });
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
      {
        toolLog.push({ name: call.name, ok, ms: now().getTime() - began, ...(error ? { error } : {}) });
        tracer.emit("tool", ok ? "done" : "error", { label: call.name, ms: now().getTime() - began, files: filesForTool(call.name) });
      };

    tracer.emit("tool", "start", { label: call.name, files: filesForTool(call.name) });
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
    if (result.proposal) {
      proposals.push(result.proposal);
      tracer.emit("proposal", "done", { label: result.proposal.type });
    }
    if (result.citations) {
      citations.push(...result.citations);
      tracer.emit("citations", "done", { label: `${result.citations.length} verified` });
    }
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
