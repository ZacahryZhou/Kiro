import { z } from "zod";

// A teacher's teaching knowledge (contract v0.7, additive): what the students' AI tutor may teach from.
// It is written for students and is separate from the private per-student memory (AgentMemory).

export const KNOWLEDGE_KINDS = ["LESSON_SUMMARY", "KNOWLEDGE_POINT", "COMMON_MISTAKE", "EXAMPLE", "FAQ", "TEACHING_STYLE"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const KnowledgeEntryInput = z.object({
  /** Omit to create a new entry; give an ID to edit one of your own. */
  id: z.string().min(1).optional(),
  /** Omit for notes that apply to all of the teacher's courses. */
  courseId: z.string().min(1).optional(),
  kind: z.enum(KNOWLEDGE_KINDS),
  title: z.string().trim().min(1, "Enter a title.").max(120, "Use at most 120 characters for the title."),
  content: z.string().trim().min(1, "Write the note.").max(4000, "Use at most 4,000 characters for a note."),
});
export type KnowledgeEntryInput = z.infer<typeof KnowledgeEntryInput>;

/** Several notes saved together (a proposal can carry up to twelve). */
export const KnowledgeBatchInput = z.object({ entries: z.array(KnowledgeEntryInput).min(1, "Add at least one note.").max(12, "Add at most 12 notes at a time.") });
export type KnowledgeBatchInput = z.infer<typeof KnowledgeBatchInput>;

export const DeleteKnowledgeInput = z.object({ entryId: z.string().min(1) });
export type DeleteKnowledgeInput = z.infer<typeof DeleteKnowledgeInput>;

export type KnowledgeView = {
  id: string;
  courseId?: string;
  courseName?: string;
  kind: KnowledgeKind;
  title: string;
  content: string;
  updatedAt: string;
};

/** What a student may read: the teacher's notes for their courses (never teaching-style instructions in the list). */
export type StudentKnowledgeView = KnowledgeView & { teacherName: string };
