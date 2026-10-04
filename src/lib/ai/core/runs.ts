import { Prisma } from "@prisma/client";
import type { Role } from "@/contracts";
import { prisma } from "@/lib/db/prisma";
import { useRealBackend } from "../runtime";

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

export type RunRecorder = (run: AgentRunRecord) => void | Promise<void>;

export const memoryRuns: AgentRunRecord[] = [];

export const recordRunInMemory: RunRecorder = (run) => {
  memoryRuns.push(run);
};

/** Stores a run in the AgentRun table. A failure to log is swallowed: it must never break a reply. */
export const recordRunInDatabase: RunRecorder = async (run) => {
  try {
    await prisma.agentRun.create({
      data: {
        actorId: run.actorId,
        role: run.role,
        intentSummary: run.intentSummary,
        toolCalls: run.toolCalls as unknown as Prisma.InputJsonValue,
        status: run.status,
        error: run.error,
        createdAt: new Date(run.createdAt),
      },
    });
  } catch {
    // Logging is best effort.
  }
};

/** The recorder used when none is injected: the database in the app, memory in offline checks. */
export const defaultRunRecorder: RunRecorder = useRealBackend ? recordRunInDatabase : recordRunInMemory;
