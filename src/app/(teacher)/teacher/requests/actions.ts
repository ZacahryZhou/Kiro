"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/actor";
import { resolveStudentRequest } from "@/services/write";

type ActionState = { kind: "success" | "error" | null; message: string };

/** Approves or declines a pending request. Nothing else changes: the schedule and attendance stay as they are. */
export async function resolveRequestAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("TEACHER");
  const requestId = formData.get("requestId");
  const decision = formData.get("decision") === "APPROVED" ? "APPROVED" : "DECLINED";
  if (typeof requestId !== "string" || requestId === "") return { kind: "error", message: "Request not found." };
  const result = await resolveStudentRequest(actor, { requestId, decision });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidatePath("/teacher/requests");
  revalidatePath("/teacher");
  revalidatePath("/teacher/schedule");
  return { kind: "success", message: decision === "APPROVED" ? "Approved." : "Declined." };
}
