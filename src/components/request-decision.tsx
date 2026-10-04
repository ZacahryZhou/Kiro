"use client";

import { useActionState } from "react";
import { resolveRequestAction } from "@/app/(teacher)/teacher/requests/actions";
import { Button } from "@/components/ui/button";

const initial = { kind: null as "success" | "error" | null, message: "" };

export function RequestDecision({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(resolveRequestAction, initial);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" name="decision" value="APPROVED" disabled={pending}>Approve</Button>
      <Button type="submit" name="decision" value="DECLINED" variant="outline" disabled={pending}>Decline</Button>
      {state.kind === "error" && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
    </form>
  );
}
