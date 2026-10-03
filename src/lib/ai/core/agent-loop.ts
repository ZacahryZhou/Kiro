import type { Actor, Role } from "@/contracts";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AgentInput = {
  actor: Actor;
  role: Role;
  userMessage: string;
  history: ChatTurn[];
};
export type AgentOutput = { reply: string };

/** Placeholder until S2.3 adds the model <-> tool loop. */
export async function runAgent({ userMessage }: AgentInput): Promise<AgentOutput> {
  return { reply: `Received: ${userMessage}` };
}
