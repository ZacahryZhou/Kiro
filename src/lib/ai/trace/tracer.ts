import { randomUUID } from "node:crypto";
import { publish, type TraceStatus } from "./bus";
import type { StepId } from "./steps";

export type Tracer = {
  runId: string;
  emit: (step: StepId, status: TraceStatus, extra?: { label?: string; ms?: number; files?: string[] }) => void;
};

/** One tracer per agent run or confirmation. Emitting never throws. */
export function createTracer(role: string): Tracer {
  const runId = randomUUID().slice(0, 8);
  return {
    runId,
    emit(step, status, extra = {}) {
      try {
        publish({ runId, role, step, status, ...extra });
      } catch {
        // Tracing must never break the agent.
      }
    },
  };
}

export const noopTracer: Tracer = { runId: "none", emit: () => undefined };
