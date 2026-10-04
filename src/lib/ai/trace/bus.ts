import type { StepId } from "./steps";

// In-memory event bus behind the admin console. Events hold step names, tool names, timings and
// the role only. Message text, tool arguments and results are never recorded.

export type TraceStatus = "start" | "done" | "error";
export type TraceEvent = {
  seq: number;
  ts: string;
  runId: string;
  role: string;
  step: StepId;
  status: TraceStatus;
  /** Short non-sensitive note, such as a tool name or an error code. */
  label?: string;
  ms?: number;
  /** Extra files touched by this event, on top of the step's own list. */
  files?: string[];
};

const MAX_EVENTS = 300;
type Listener = (event: TraceEvent) => void;
type BusState = { seq: number; events: TraceEvent[]; listeners: Set<Listener> };

// Next.js can load this module in several bundles; globalThis keeps one shared bus per process.
const key = Symbol.for("kora.ai.trace.bus");
const holder = globalThis as unknown as Record<symbol, BusState | undefined>;
const state: BusState = (holder[key] ??= { seq: 0, events: [], listeners: new Set() });

export function publish(event: Omit<TraceEvent, "seq" | "ts">): TraceEvent {
  const full: TraceEvent = { ...event, seq: ++state.seq, ts: new Date().toISOString() };
  state.events.push(full);
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  for (const listener of state.listeners) {
    try {
      listener(full);
    } catch {
      // A broken subscriber must not affect the agent.
    }
  }
  return full;
}

export const recentEvents = (): TraceEvent[] => [...state.events];

export function subscribe(listener: Listener): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function clearEvents(): void {
  state.events.length = 0;
}
