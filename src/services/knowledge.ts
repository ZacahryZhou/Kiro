import {
  DeleteKnowledgeInput as DeleteKnowledgeInputSchema,
  KnowledgeBatchInput as KnowledgeBatchInputSchema,
  KnowledgeEntryInput as KnowledgeEntryInputSchema,
  err,
  ok,
  type DeleteKnowledgeInput,
  type KnowledgeBatchInput,
  type KnowledgeEntryInput,
  type KnowledgeView,
  type Result,
  type StudentKnowledgeView,
} from "@/contracts";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";

// Teaching knowledge (contract v0.7). A teacher writes and edits their own notes; a student reads
// only the notes of teachers whose courses they are enrolled in. Nothing here touches AgentMemory.

const MAX_ENTRIES_PER_TEACHER = 200;
const select = { id: true, courseId: true, kind: true, title: true, content: true, updatedAt: true, course: { select: { name: true } } } as const;

type Row = { id: string; courseId: string | null; kind: KnowledgeView["kind"]; title: string; content: string; updatedAt: Date; course: { name: string } | null };

function toView(row: Row): KnowledgeView {
  return { id: row.id, ...(row.courseId ? { courseId: row.courseId, courseName: row.course?.name } : {}), kind: row.kind, title: row.title, content: row.content, updatedAt: row.updatedAt.toISOString() };
}

/** Creates or edits one of the teacher's own notes. A note may be tied to one of their courses or apply to all. */
export async function saveKnowledgeEntry(actor: Actor, input: KnowledgeEntryInput): Promise<Result<KnowledgeView>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can write teaching notes.");
  const parsed = KnowledgeEntryInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", parsed.error.issues[0]?.message ?? "That note is not valid.");
  const entry = parsed.data;
  try {
    if (entry.courseId) {
      const course = await prisma.course.findFirst({ where: { id: entry.courseId, teacherId: actor.userId }, select: { id: true } });
      if (!course) return err("FORBIDDEN", "You do not have access to this course.");
    }
    if (entry.id) {
      const existing = await prisma.knowledgeEntry.findFirst({ where: { id: entry.id, teacherId: actor.userId }, select: { id: true } });
      if (!existing) return err("NOT_FOUND", "That note was not found.");
      const row = await prisma.knowledgeEntry.update({ where: { id: entry.id }, data: { courseId: entry.courseId ?? null, kind: entry.kind, title: entry.title, content: entry.content }, select });
      return ok(toView(row));
    }
    if ((await prisma.knowledgeEntry.count({ where: { teacherId: actor.userId } })) >= MAX_ENTRIES_PER_TEACHER) {
      return err("CONFLICT", `You can keep up to ${MAX_ENTRIES_PER_TEACHER} notes. Delete some first.`);
    }
    const row = await prisma.knowledgeEntry.create({ data: { teacherId: actor.userId, courseId: entry.courseId ?? null, kind: entry.kind, title: entry.title, content: entry.content }, select });
    return ok(toView(row));
  } catch {
    return err("INTERNAL", "Could not save the note. Please try again.");
  }
}

/** Saves several notes at once, all or nothing. Used when the teacher confirms an assistant proposal. */
export async function saveKnowledgeEntries(actor: Actor, input: KnowledgeBatchInput): Promise<Result<{ saved: number; entryIds: string[] }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can write teaching notes.");
  const parsed = KnowledgeBatchInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", parsed.error.issues[0]?.message ?? "Those notes are not valid.");
  const entries = parsed.data.entries;
  try {
    const courseIds = [...new Set(entries.flatMap((e) => (e.courseId ? [e.courseId] : [])))];
    if (courseIds.length > 0 && (await prisma.course.count({ where: { id: { in: courseIds }, teacherId: actor.userId } })) !== courseIds.length) {
      return err("FORBIDDEN", "A note points at a course you do not teach.");
    }
    const editIds = entries.flatMap((e) => (e.id ? [e.id] : []));
    if (editIds.length > 0 && (await prisma.knowledgeEntry.count({ where: { id: { in: editIds }, teacherId: actor.userId } })) !== editIds.length) {
      return err("NOT_FOUND", "A note you are editing was not found.");
    }
    const fresh = entries.filter((e) => !e.id).length;
    if ((await prisma.knowledgeEntry.count({ where: { teacherId: actor.userId } })) + fresh > MAX_ENTRIES_PER_TEACHER) {
      return err("CONFLICT", `You can keep up to ${MAX_ENTRIES_PER_TEACHER} notes. Delete some first.`);
    }
    const rows = await prisma.$transaction(
      entries.map((e) =>
        e.id
          ? prisma.knowledgeEntry.update({ where: { id: e.id }, data: { courseId: e.courseId ?? null, kind: e.kind, title: e.title, content: e.content }, select: { id: true } })
          : prisma.knowledgeEntry.create({ data: { teacherId: actor.userId, courseId: e.courseId ?? null, kind: e.kind, title: e.title, content: e.content }, select: { id: true } }),
      ),
    );
    return ok({ saved: rows.length, entryIds: rows.map((r) => r.id) });
  } catch {
    return err("INTERNAL", "Could not save the notes. Please try again.");
  }
}

/** The teacher's own notes, grouped by course in the UI. */
export async function listMyKnowledge(actor: Actor, input: { courseId?: string } = {}): Promise<Result<{ entries: KnowledgeView[] }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can view their teaching notes.");
  try {
    const rows = await prisma.knowledgeEntry.findMany({ where: { teacherId: actor.userId, ...(input.courseId ? { OR: [{ courseId: input.courseId }, { courseId: null }] } : {}) }, select, orderBy: [{ kind: "asc" }, { updatedAt: "desc" }], take: 300 });
    return ok({ entries: rows.map(toView) });
  } catch {
    return err("INTERNAL", "Could not load your notes. Please try again.");
  }
}

export async function deleteKnowledgeEntry(actor: Actor, input: DeleteKnowledgeInput): Promise<Result<{ deleted: true }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can delete teaching notes.");
  const parsed = DeleteKnowledgeInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a note.");
  try {
    const removed = await prisma.knowledgeEntry.deleteMany({ where: { id: parsed.data.entryId, teacherId: actor.userId } });
    if (removed.count === 0) return err("NOT_FOUND", "That note was not found.");
    return ok({ deleted: true });
  } catch {
    return err("INTERNAL", "Could not delete the note. Please try again.");
  }
}

/**
 * The notes a student may learn from: notes tied to a course they are enrolled in, plus the
 * all-courses notes of the teachers of those courses. `includeStyle` is for the tutor itself:
 * teaching-style notes steer how it explains and are not shown as study notes.
 */
export async function listKnowledgeForStudent(actor: Actor, input: { courseId?: string; includeStyle?: boolean } = {}): Promise<Result<{ entries: StudentKnowledgeView[] }>> {
  if (actor.role !== "STUDENT") return err("FORBIDDEN", "Only students can read their teachers' notes this way.");
  try {
    const enrolled = await prisma.enrollment.findMany({ where: { studentId: actor.userId, ...(input.courseId ? { courseId: input.courseId } : {}) }, select: { courseId: true, course: { select: { teacherId: true, teacher: { select: { name: true } } } } } });
    if (enrolled.length === 0) return ok({ entries: [] });
    const courseIds = enrolled.map((e) => e.courseId);
    const teacherIds = [...new Set(enrolled.map((e) => e.course.teacherId))];
    const teacherNames = new Map(enrolled.map((e) => [e.course.teacherId, e.course.teacher.name]));
    const rows = await prisma.knowledgeEntry.findMany({
      where: { OR: [{ courseId: { in: courseIds } }, { courseId: null, teacherId: { in: teacherIds } }], ...(input.includeStyle ? {} : { kind: { not: "TEACHING_STYLE" } }) },
      select: { ...select, teacherId: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 300,
    });
    return ok({ entries: rows.map((row) => ({ ...toView(row), teacherName: teacherNames.get(row.teacherId) ?? "Your teacher" })) });
  } catch {
    return err("INTERNAL", "Could not load your teacher's notes. Please try again.");
  }
}
