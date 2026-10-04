import type { Prisma } from "@prisma/client";
import {
  DashboardItemSchema,
  DashboardLayoutInput as DashboardLayoutInputSchema,
  DeleteLayoutInput as DeleteLayoutInputSchema,
  MAX_LAYOUTS,
  UseLayoutInput as UseLayoutInputSchema,
  err,
  ok,
  type DashboardItem,
  type DashboardLayoutInput,
  type DashboardLayoutView,
  type DashboardMotion,
  type DashboardTheme,
  type DeleteLayoutInput,
  type Result,
  type UseLayoutInput,
} from "@/contracts";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

// Home-page layouts (contract v0.7). Every function takes the signed-in actor and only ever touches
// that teacher's own rows. Layouts hold widget choices, never business data.

type LayoutRow = { id: string; name: string; theme: string; motion: string; items: Prisma.JsonValue; lastUsedAt: Date | null; updatedAt: Date };

function toView(row: LayoutRow, activeId: string | null): DashboardLayoutView {
  const items = z.array(DashboardItemSchema).safeParse(row.items);
  return {
    id: row.id,
    name: row.name,
    theme: row.theme as DashboardTheme,
    motion: row.motion as DashboardMotion,
    items: items.success ? items.data : [],
    isActive: row.id === activeId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const select = { id: true, name: true, theme: true, motion: true, items: true, lastUsedAt: true, updatedAt: true } as const;

function activeIdOf(rows: LayoutRow[]): string | null {
  let best: LayoutRow | null = null;
  for (const row of rows) {
    if (row.lastUsedAt && (!best || row.lastUsedAt > (best.lastUsedAt as Date))) best = row;
  }
  return best?.id ?? null;
}

/** All of the teacher's saved layouts, newest-used first. The active one is flagged. */
export async function listMyLayouts(actor: Actor): Promise<Result<{ layouts: DashboardLayoutView[] }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers have a customisable home page.");
  try {
    const rows = await prisma.dashboardLayout.findMany({ where: { teacherId: actor.userId }, select, orderBy: [{ lastUsedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }] });
    const activeId = activeIdOf(rows);
    return ok({ layouts: rows.map((row) => toView(row, activeId)) });
  } catch {
    return err("INTERNAL", "Could not load your layouts. Please try again.");
  }
}

/** The layout shown on the home page: the one used most recently, or null for the built-in Classic layout. */
export async function getActiveLayout(actor: Actor): Promise<Result<{ layout: DashboardLayoutView | null }>> {
  const all = await listMyLayouts(actor);
  if (!all.ok) return all;
  return ok({ layout: all.data.layouts.find((layout) => layout.isActive) ?? null });
}

/** Every course and student a layout points at must belong to this teacher. */
async function checkReferences(actor: Actor, items: DashboardItem[]): Promise<Result<null>> {
  const courseIds = [...new Set(items.flatMap((item) => (item.courseId ? [item.courseId] : [])))];
  const studentIds = [...new Set(items.flatMap((item) => (item.studentId ? [item.studentId] : [])))];
  if (courseIds.length > 0) {
    const owned = await prisma.course.count({ where: { id: { in: courseIds }, teacherId: actor.userId } });
    if (owned !== courseIds.length) return err("FORBIDDEN", "A widget points at a course you do not teach.");
  }
  if (studentIds.length > 0) {
    const mine = await prisma.user.count({ where: { id: { in: studentIds }, role: "STUDENT", enrollments: { some: { course: { teacherId: actor.userId } } } } });
    if (mine !== studentIds.length) return err("FORBIDDEN", "A widget points at a student who is not in your courses.");
  }
  return ok(null);
}

/**
 * Saves a layout and makes it the active one. A layout with the same name is replaced, so
 * "save as" with an existing name updates it. At most MAX_LAYOUTS layouts per teacher.
 */
export async function saveDashboardLayout(actor: Actor, input: DashboardLayoutInput): Promise<Result<DashboardLayoutView>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers have a customisable home page.");
  const parsed = DashboardLayoutInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", parsed.error.issues[0]?.message ?? "That layout is not valid.");
  const layout = parsed.data;
  try {
    const refs = await checkReferences(actor, layout.items);
    if (!refs.ok) return refs;
    const existing = await prisma.dashboardLayout.findUnique({ where: { teacherId_name: { teacherId: actor.userId, name: layout.name } }, select: { id: true } });
    if (!existing && (await prisma.dashboardLayout.count({ where: { teacherId: actor.userId } })) >= MAX_LAYOUTS) {
      return err("CONFLICT", `You can keep up to ${MAX_LAYOUTS} layouts. Delete one first.`);
    }
    const now = new Date();
    const values = { theme: layout.theme, motion: layout.motion, items: layout.items as unknown as Prisma.InputJsonValue, lastUsedAt: now };
    const row = await prisma.dashboardLayout.upsert({
      where: { teacherId_name: { teacherId: actor.userId, name: layout.name } },
      create: { teacherId: actor.userId, name: layout.name, ...values },
      update: values,
      select,
    });
    return ok(toView(row, row.id));
  } catch {
    return err("INTERNAL", "Could not save the layout. Please try again.");
  }
}

/** Makes one of the teacher's layouts active, or passes null to go back to the built-in Classic layout. */
export async function useDashboardLayout(actor: Actor, input: UseLayoutInput): Promise<Result<{ activeLayoutId: string | null }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers have a customisable home page.");
  const parsed = UseLayoutInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a layout.");
  try {
    if (parsed.data.layoutId === null) {
      await prisma.dashboardLayout.updateMany({ where: { teacherId: actor.userId }, data: { lastUsedAt: null } });
      return ok({ activeLayoutId: null });
    }
    const updated = await prisma.dashboardLayout.updateMany({ where: { id: parsed.data.layoutId, teacherId: actor.userId }, data: { lastUsedAt: new Date() } });
    if (updated.count === 0) return err("NOT_FOUND", "That layout was not found.");
    return ok({ activeLayoutId: parsed.data.layoutId });
  } catch {
    return err("INTERNAL", "Could not switch layouts. Please try again.");
  }
}

/** Deletes one of the teacher's own layouts. */
export async function deleteDashboardLayout(actor: Actor, input: DeleteLayoutInput): Promise<Result<{ deleted: true }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers have a customisable home page.");
  const parsed = DeleteLayoutInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a layout.");
  try {
    const removed = await prisma.dashboardLayout.deleteMany({ where: { id: parsed.data.layoutId, teacherId: actor.userId } });
    if (removed.count === 0) return err("NOT_FOUND", "That layout was not found.");
    return ok({ deleted: true });
  } catch {
    return err("INTERNAL", "Could not delete the layout. Please try again.");
  }
}
