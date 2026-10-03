"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProposalView } from "@/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { labels } from "@/lib/ai/domain/edu/labels";

type State =
  | { kind: "pending" }
  | { kind: "working" }
  | { kind: "executed" }
  | { kind: "discarded" }
  | { kind: "failed"; message: string };

type ApiBody = { status?: string; error?: { message?: string } };

async function post(path: string): Promise<{ ok: boolean; body: ApiBody }> {
  try {
    const response = await fetch(path, { method: "POST" });
    return { ok: response.ok, body: await response.json() };
  } catch {
    return { ok: false, body: { error: { message: labels.failure } } };
  }
}

export function ProposalCard({ proposal }: { proposal: ProposalView }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "pending" });

  async function confirm() {
    setState({ kind: "working" });
    const { ok, body } = await post(`/api/ai/proposals/${proposal.id}/confirm`);
    if (ok && body.status === "executed") {
      setState({ kind: "executed" });
      router.refresh(); // show the new data on the page behind the panel
    } else {
      setState({ kind: "failed", message: body.error?.message ?? labels.failure });
    }
  }

  async function cancel() {
    setState({ kind: "working" });
    const { ok, body } = await post(`/api/ai/proposals/${proposal.id}/discard`);
    setState(ok ? { kind: "discarded" } : { kind: "failed", message: body.error?.message ?? labels.failure });
  }

  const open = state.kind === "pending" || state.kind === "working";
  return (
    <section aria-label={labels.proposal.heading} className="mt-2 rounded-lg border bg-card p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-medium">{labels.proposal.heading}</p>
        {open ? <Badge variant="outline">Pending</Badge> : null}
      </div>
      <p className="mb-1">{proposal.summary}</p>
      {proposal.preview && proposal.preview.length > 0 ? (
        <ul className="mb-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
          {proposal.preview.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <>
          <p className="mb-2 text-xs text-muted-foreground">{labels.proposal.notChanged}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirm} disabled={state.kind === "working"}>
              {state.kind === "working" ? labels.proposal.working : labels.proposal.confirm}
            </Button>
            <Button size="sm" variant="outline" onClick={cancel} disabled={state.kind === "working"}>
              {labels.proposal.cancel}
            </Button>
          </div>
        </>
      ) : null}
      <p role="status" className="text-xs">
        {state.kind === "executed" ? labels.proposal.done : null}
        {state.kind === "discarded" ? labels.proposal.discarded : null}
        {state.kind === "failed" ? `${labels.proposal.failedPrefix}${state.message}` : null}
      </p>
    </section>
  );
}
