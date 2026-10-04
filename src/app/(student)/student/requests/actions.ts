"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/actor";
import { localDateTimeToUtcIso } from "@/lib/time";
import { submitStudentRequest } from "@/services/write";

type ActionState = { kind: "success" | "error" | null; message: string };

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

/** Sends a leave or "different time" request for one upcoming session. It only stores a pending request. */
export async function submitRequestAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("STUDENT");
  const kind = value(formData, "kind") === "RESCHEDULE" ? "RESCHEDULE" : "LEAVE";
  const note = value(formData, "note");
  let preferredStartAt: string | undefined;
  if (kind === "RESCHEDULE") {
    const date = value(formData, "date");
    const time = value(formData, "time");
    if (date || time) {
      const converted = localDateTimeToUtcIso(date, time);
      if (!converted) return { kind: "error", message: "Enter a valid date and time, or leave both empty." };
      preferredStartAt = converted;
    }
  }
  const result = await submitStudentRequest(actor, { sessionId: value(formData, "sessionId"), kind, ...(note ? { note } : {}), ...(preferredStartAt ? { preferredStartAt } : {}) });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidatePath("/student");
  return { kind: "success", message: "Request sent. Your teacher will review it." };
}
