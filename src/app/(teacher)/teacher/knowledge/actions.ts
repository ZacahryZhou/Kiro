"use server";

import { revalidatePath } from "next/cache";
import { KnowledgeEntryInput, type KnowledgeEntryInput as EntryInput } from "@/contracts";
import { requireRole } from "@/lib/auth/actor";
import { deleteKnowledgeEntry, saveKnowledgeEntry } from "@/services/knowledge";

type Outcome = { ok: true; message: string } | { ok: false; message: string };

function refresh() {
  revalidatePath("/teacher/knowledge");
  revalidatePath("/student", "layout");
}

/** Creates a note, or edits one when `id` is given. */
export async function saveKnowledgeAction(input: EntryInput): Promise<Outcome> {
  const actor = await requireRole("TEACHER");
  const parsed = KnowledgeEntryInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That note is not valid." };
  const result = await saveKnowledgeEntry(actor, parsed.data);
  if (!result.ok) return { ok: false, message: result.error.message };
  refresh();
  return { ok: true, message: parsed.data.id ? "Note updated." : "Note saved. Your students' tutor can use it now." };
}

export async function deleteKnowledgeAction(entryId: string): Promise<Outcome> {
  const actor = await requireRole("TEACHER");
  const result = await deleteKnowledgeEntry(actor, { entryId });
  if (!result.ok) return { ok: false, message: result.error.message };
  refresh();
  return { ok: true, message: "Note deleted." };
}
