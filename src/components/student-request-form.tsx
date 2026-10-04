"use client";

import { useActionState, useState } from "react";
import { submitRequestAction } from "@/app/(student)/student/requests/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial = { kind: null as "success" | "error" | null, message: "" };

/** A small form under an upcoming session where a student asks for leave or a different time. */
export function StudentRequestForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(submitRequestAction, initial);
  const [kind, setKind] = useState<"LEAVE" | "RESCHEDULE">("LEAVE");
  return (
    <details className="group border-t bg-muted/30 px-5 py-3 text-sm">
      <summary className="cursor-pointer select-none font-medium text-muted-foreground transition-colors hover:text-foreground">
        Ask for leave or a different time
      </summary>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="sessionId" value={sessionId} />
        <fieldset className="flex gap-4">
          <legend className="sr-only">Request type</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" value="LEAVE" checked={kind === "LEAVE"} onChange={() => setKind("LEAVE")} /> Leave
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" value="RESCHEDULE" checked={kind === "RESCHEDULE"} onChange={() => setKind("RESCHEDULE")} /> Different time
          </label>
        </fieldset>
        {kind === "RESCHEDULE" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`req-date-${sessionId}`}>Preferred date (optional)</Label>
              <Input id={`req-date-${sessionId}`} name="date" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`req-time-${sessionId}`}>Preferred time (optional)</Label>
              <Input id={`req-time-${sessionId}`} name="time" type="time" />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`req-note-${sessionId}`}>Note for your teacher (optional)</Label>
          <Textarea id={`req-note-${sessionId}`} name="note" maxLength={300} rows={2} />
        </div>
        {state.kind && (
          <p role={state.kind === "error" ? "alert" : "status"} className={state.kind === "error" ? "text-destructive" : "text-emerald-700"}>
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send request"}</Button>
      </form>
    </details>
  );
}
