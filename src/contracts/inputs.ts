import { z } from "zod";

const id = z.string().min(1);
const utc = z.string().datetime(); // ISO UTC

export const CreateCourseInput = z.object({
  name: z.string().min(1).max(80),
  subject: z.string().min(1).max(40),
  type: z.enum(["ONE_ON_ONE", "SMALL_CLASS"]),
  location: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  pricePerSessionCents: z.number().int().nonnegative().default(0),
});
export const AddStudentInput = z.object({ courseId: id, email: z.string().email() });
export const CreateSessionsInput = z.object({
  courseId: id,
  sessions: z
    .array(
      z.object({
        startAt: utc,
        durationMin: z.number().int().min(15).max(480),
        location: z.string().max(120).optional(),
        linkUrl: z.string().url().optional(),
      }),
    )
    .min(1)
    .max(30),
});
export const CreateUnitInput = z.object({
  courseId: id,
  title: z.string().min(1).max(80),
  order: z.number().int().optional(),
});

const materialFields = {
  title: z.string().min(1).max(80),
  kind: z.enum(["TEXT", "LINK"]),
  content: z.string().max(20000).optional(),
  url: z.string().url().optional(),
};
const materialRule = (v: { kind: "TEXT" | "LINK"; content?: string; url?: string }) =>
  v.kind === "TEXT" ? !!v.content : !!v.url;
const materialRuleMessage = "TEXT requires content; LINK requires a URL";

export const AddMaterialInput = z
  .object({ unitId: id, ...materialFields })
  .refine(materialRule, materialRuleMessage);
/** Material without its unit, used inside ADD_CONTENT proposals. */
export const MaterialDraftInput = z.object(materialFields).refine(materialRule, materialRuleMessage);

export const ConfirmAttendanceInput = z.object({
  sessionId: id,
  records: z
    .array(z.object({ studentId: id, status: z.enum(["PRESENT", "LEAVE", "ABSENT"]) }))
    .min(1),
});
export const RescheduleInput = z.object({ sessionId: id, newStartAt: utc });
export const CheckConflictsInput = z.object({
  courseId: id,
  startAt: utc,
  durationMin: z.number().int().positive(),
  excludeSessionId: id.optional(),
});

// Tier B
export const SaveProgressInput = z.object({
  sessionId: id,
  studentId: id,
  goal: z.string().min(1),
  output: z.string().min(1),
  issue: z.string().optional(),
  nextAction: z.enum(["PRACTICE", "REVIEW", "EXTRA_MATERIAL", "RECAP_NEXT"]),
  note: z.string().optional(),
});
export const AddStudentNoteInput = z.object({
  courseId: id,
  studentId: id,
  kind: z.enum(["AVAILABILITY", "NOTE"]),
  content: z.string().min(1).max(500),
});
export const ResolveStudentRequestInput = z.object({ requestId: id, decision: z.enum(["APPROVED", "DECLINED"]) });
export const StudentRequestInput = z.object({
  sessionId: id,
  kind: z.enum(["LEAVE", "RESCHEDULE"]),
  note: z.string().max(300).optional(),
  preferredStartAt: utc.optional(),
});

export type CreateCourseInput = z.infer<typeof CreateCourseInput>;
export type AddStudentInput = z.infer<typeof AddStudentInput>;
export type CreateSessionsInput = z.infer<typeof CreateSessionsInput>;
export type CreateUnitInput = z.infer<typeof CreateUnitInput>;
export type AddMaterialInput = z.infer<typeof AddMaterialInput>;
export type MaterialDraftInput = z.infer<typeof MaterialDraftInput>;
export type ConfirmAttendanceInput = z.infer<typeof ConfirmAttendanceInput>;
export type RescheduleInput = z.infer<typeof RescheduleInput>;
export type CheckConflictsInput = z.infer<typeof CheckConflictsInput>;
export type SaveProgressInput = z.infer<typeof SaveProgressInput>;
export type AddStudentNoteInput = z.infer<typeof AddStudentNoteInput>;
export type StudentRequestInput = z.infer<typeof StudentRequestInput>;
export type ResolveStudentRequestInput = z.infer<typeof ResolveStudentRequestInput>;
