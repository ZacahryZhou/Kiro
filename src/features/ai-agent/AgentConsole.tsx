"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Role } from "@/contracts";
import { STEP_DEFS, type StepId } from "@/lib/ai/trace/steps";
import type { TraceEvent } from "@/lib/ai/trace/bus";
import { AiPanel } from "./AiPanel";
import { ArchitectureGraph } from "./ArchitectureGraph";
import { ToolCatalog } from "./ToolCatalog";

type StepState = "idle" | "active" | "done" | "error";

const STATE_STYLE: Record<StepState, string> = {
  idle: "border-border bg-card text-muted-foreground",
  active: "border-amber-500 bg-amber-100 text-amber-950 shadow-[0_0_0_3px_rgba(245,158,11,0.35)] animate-pulse",
  done: "border-emerald-500 bg-emerald-50 text-emerald-950",
  error: "border-red-500 bg-red-50 text-red-950",
};

/** Folds the events of one run, up to `upTo`, into a per-step state and the files touched. */
function foldRun(events: TraceEvent[], upTo: number) {
  const states = new Map<StepId, StepState>();
  const extraFiles = new Map<StepId, Set<string>>();
  let last: TraceEvent | undefined;
  for (const event of events.slice(0, upTo)) {
    last = event;
    const state: StepState = event.status === "start" ? "active" : event.status === "done" ? "done" : "error";
    states.set(event.step, state);
    if (event.files) {
      const set = extraFiles.get(event.step) ?? new Set<string>();
      event.files.forEach((file) => set.add(file));
      extraFiles.set(event.step, set);
    }
  }
  return { states, extraFiles, last };
}

export function AgentConsole({ role }: { role: Role }) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/ai/trace/stream");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as TraceEvent;
      setEvents((all) => (all.some((item) => item.seq === event.seq) ? all : [...all, event].slice(-300)));
    };
    return () => source.close();
  }, []);

  const runs = useMemo(() => {
    const order: string[] = [];
    for (const event of events) if (!order.includes(event.runId)) order.push(event.runId);
    return order;
  }, [events]);

  const followLatest = selectedRun === null;
  const runId = selectedRun ?? runs[runs.length - 1] ?? null;
  const runEvents = useMemo(() => events.filter((event) => event.runId === runId), [events, runId]);
  const upTo = replayAt ?? runEvents.length;
  const { states, extraFiles, last } = useMemo(() => foldRun(runEvents, upTo), [runEvents, upTo]);

  function replay() {
    if (timer.current) clearInterval(timer.current);
    let index = 0;
    setReplayAt(0);
    timer.current = setInterval(() => {
      index += 1;
      if (index >= runEvents.length) {
        if (timer.current) clearInterval(timer.current);
        setReplayAt(null);
      } else {
        setReplayAt(index);
      }
    }, 700);
  }
  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const activeStep = last && states.get(last.step) !== "idle" ? last.step : null;
  const activeDef = STEP_DEFS.find((step) => step.id === activeStep);
  const highlightedFiles = new Set<string>([...(activeDef?.files ?? []), ...(activeStep ? (extraFiles.get(activeStep) ?? []) : [])]);
  const touchedFiles = new Set<string>();
  for (const [step, state] of states) {
    if (state === "idle") continue;
    STEP_DEFS.find((def) => def.id === step)?.files.forEach((file) => touchedFiles.add(file));
    extraFiles.get(step)?.forEach((file) => touchedFiles.add(file));
  }
  const allFiles = [...new Set(STEP_DEFS.flatMap((step) => step.files))];

  return (
    <div className="flex flex-col gap-4" data-testid="agent-console">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">AI Agent Console</h1>
          <p className="text-sm text-muted-foreground">
            Live pipeline view. Send a message in the panel and watch each step and file light up. Only step names and timings are shown, never message text.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            data-testid="connection"
            className={`rounded-full px-2 py-0.5 ${connected ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}
          >
            {connected ? "Live" : "Disconnected"}
          </span>
          <select
            aria-label="Run"
            className="rounded border bg-background px-2 py-1"
            value={followLatest ? "latest" : (selectedRun ?? "latest")}
            onChange={(e) => {
              setReplayAt(null);
              setSelectedRun(e.target.value === "latest" ? null : e.target.value);
            }}
          >
            <option value="latest">Follow latest run</option>
            {runs.map((id) => (
              <option key={id} value={id}>
                Run {id}
              </option>
            ))}
          </select>
          <button className="rounded border px-3 py-1 hover:bg-muted disabled:opacity-50" onClick={replay} disabled={runEvents.length === 0}>
            Replay
          </button>
        </div>
      </header>

      <ArchitectureGraph states={states} activeStep={activeStep} />

      <ToolCatalog />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="flex flex-col gap-3" aria-label="Pipeline">
          <ol className="flex flex-col gap-2">
            {STEP_DEFS.map((step) => {
              const state = states.get(step.id) ?? "idle";
              const label = runEvents.filter((e) => e.step === step.id && e.label).map((e) => e.label);
              return (
                <li
                  key={step.id}
                  data-testid={`step-${step.id}`}
                  data-state={state}
                  className={`rounded-xl border-2 p-3 transition-colors ${STATE_STYLE[state]} ${activeStep === step.id ? "ring-2 ring-amber-500" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{step.title}</span>
                    <span className="text-xs uppercase tracking-wide">{state}</span>
                  </div>
                  <p className="text-xs opacity-80">{step.summary}</p>
                  {label.length > 0 && state !== "idle" && (
                    <p className="mt-1 text-xs font-mono opacity-90">{[...new Set(label)].slice(-4).join(" · ")}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <div className="flex flex-col gap-4">
          <section aria-label="Files" className="kora-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Files used</h2>
            <ul className="flex flex-col gap-1 font-mono text-xs">
              {allFiles.map((file) => {
                const hot = highlightedFiles.has(file);
                const touched = touchedFiles.has(file);
                return (
                  <li
                    key={file}
                    data-testid="file"
                    data-file={file}
                    data-hot={hot}
                    data-touched={touched}
                    className={`rounded px-2 py-0.5 ${hot ? "bg-amber-200 font-semibold text-amber-950" : touched ? "bg-emerald-100 text-emerald-950" : "text-muted-foreground"}`}
                  >
                    {file}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Amber: the running step. Green: touched earlier in this run.</p>
          </section>

          <section aria-label="Chat" className="kora-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Try it</h2>
            <AiPanel role={role} />
          </section>

          <section aria-label="Event log" className="kora-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Event log</h2>
            <ul className="max-h-48 overflow-auto font-mono text-xs" data-testid="event-log">
              {runEvents.slice(0, upTo).map((event) => (
                <li key={event.seq}>
                  {event.ts.slice(11, 23)} {event.step} {event.status}
                  {event.label ? ` (${event.label})` : ""}
                  {event.ms !== undefined ? ` ${event.ms}ms` : ""}
                </li>
              ))}
              {runEvents.length === 0 && <li className="text-muted-foreground">Waiting for activity...</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
