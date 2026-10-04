"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/actor";
import { changeMyPassword, updateMyProfile } from "@/services/write";

type ActionState = { kind: "success" | "error" | null; message: string };

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry : "";
}

export async function updateProfileAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const result = await updateMyProfile(actor, { name: value(formData, "name") });
  if (!result.ok) return { kind: "error", message: result.error.message };
  revalidatePath("/", "layout");
  return { kind: "success", message: "Name updated." };
}

export async function changePasswordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if (value(formData, "newPassword") !== value(formData, "confirmPassword")) {
    return { kind: "error", message: "The new password and its confirmation do not match." };
  }
  const result = await changeMyPassword(actor, { currentPassword: value(formData, "currentPassword"), newPassword: value(formData, "newPassword") });
  if (!result.ok) return { kind: "error", message: result.error.message };
  return { kind: "success", message: "Password changed. Use it the next time you sign in." };
}
