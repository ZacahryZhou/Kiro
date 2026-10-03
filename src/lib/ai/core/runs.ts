import type { Role } from "@/contracts";

// Run log (the AgentRun table). In development it is kept in memory; the Prisma version replaces it at H6.

export type ToolCallLog = { name: string; ok: boolean; ms: number; error?: string };

export type AgentRunRecord = {
  actorId: string;
  role: Role;
  intentSummary: string;
  toolCalls: ToolCallLog[];
  status: "OK" | "ERROR";
  error?: string;
  createdAt: string;
};

export type RunRecorder = (run: AgentRunRecord) => void;

export const memoryRuns: AgentRunRecord[] = [];

export const recordRunInMemory: RunRecorder = (run) => {
  memoryRuns.push(run);
};
