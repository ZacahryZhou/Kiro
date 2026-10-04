"use server";

import { revalidatePath } from "next/cache";
import { DashboardLayoutInput, type DashboardItem } from "@/contracts";
import { requireRole } from "@/lib/auth/actor";
import { loadDashboardData } from "@/lib/dashboard-data";
import type { DashboardData } from "@/components/dashboard/types";
import { deleteDashboardLayout, saveDashboardLayout, activateDashboardLayout } from "@/services/dashboard";

type Outcome = { ok: true; message: string } | { ok: false; message: string };

/** Saves the layout the teacher arranged and makes it the one shown on the home page. */
export async function saveLayoutAction(input: unknown): Promise<Outcome> {
  const actor = await requireRole("TEACHER");
  const parsed = DashboardLayoutInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That layout is not valid." };
  const result = await saveDashboardLayout(actor, parsed.data);
  if (!result.ok) return { ok: false, message: result.error.message };
  revalidatePath("/teacher");
  return { ok: true, message: `Saved “${result.data.name}”.` };
}

/** Switches to a saved layout, or back to the built-in Classic layout when `layoutId` is null. */
export async function switchLayoutAction(layoutId: string | null): Promise<Outcome> {
  const actor = await requireRole("TEACHER");
  const result = await activateDashboardLayout(actor, { layoutId });
  if (!result.ok) return { ok: false, message: result.error.message };
  revalidatePath("/teacher");
  return { ok: true, message: layoutId ? "Layout applied." : "Back to the Classic layout." };
}

export async function deleteLayoutAction(layoutId: string): Promise<Outcome> {
  const actor = await requireRole("TEACHER");
  const result = await deleteDashboardLayout(actor, { layoutId });
  if (!result.ok) return { ok: false, message: result.error.message };
  revalidatePath("/teacher");
  return { ok: true, message: "Layout deleted." };
}

/** Loads live data for the widgets in an unsaved layout, so a newly added widget shows real content while editing. */
export async function previewDataAction(items: DashboardItem[]): Promise<{ ok: true; data: DashboardData } | { ok: false; message: string }> {
  const actor = await requireRole("TEACHER");
  const parsed = DashboardLayoutInput.safeParse({ name: "preview", items });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That layout is not valid." };
  const data = await loadDashboardData(actor, parsed.data.items, process.env.APP_TZ || "America/Vancouver");
  return { ok: true, data };
}
