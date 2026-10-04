import { z } from "zod";
import { DashboardLayoutInput } from "./dashboard";
import { KnowledgeBatchInput } from "./knowledge";
import { CreateQuizInput } from "./quiz";
import {
  AddStudentInput,
  AddStudentNoteInput,
  ConfirmAttendanceInput,
  CreateCourseInput,
  CreateSessionsInput,
  MaterialDraftInput,
  RescheduleInput,
  SaveProgressInput,
  StudentRequestInput,
} from "./inputs";

export const PROPOSAL_TYPES = [
  "CREATE_COURSE",
  "CREATE_SESSIONS",
  "ADD_CONTENT",
  "MARK_ATTENDANCE",
  "RESCHEDULE",
  "PROGRESS_RECORD",
  "STUDENT_REQUEST",
  "ADD_STUDENT_NOTE",
  "ADD_STUDENT",
  "DASHBOARD_LAYOUT",
  "QUIZ",
  "KNOWLEDGE",
] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export const PROPOSAL_STATUSES = ["pending", "confirmed", "executed", "failed", "discarded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Payload schema for each proposal type (contract §8). */
export const ProposalPayloadSchemas = {
  CREATE_COURSE: z.object({
    course: CreateCourseInput,
    studentEmails: z.array(z.string().email()),
  }),
  CREATE_SESSIONS: CreateSessionsInput,
  ADD_CONTENT: z.object({
    courseId: z.string().min(1),
    unit: z.object({ title: z.string().min(1).max(80), order: z.number().int().optional() }),
    materials: z.array(MaterialDraftInput),
  }),
  MARK_ATTENDANCE: ConfirmAttendanceInput,
  RESCHEDULE: RescheduleInput,
  PROGRESS_RECORD: SaveProgressInput,
  STUDENT_REQUEST: StudentRequestInput,
  ADD_STUDENT_NOTE: AddStudentNoteInput,
  ADD_STUDENT: AddStudentInput,
  DASHBOARD_LAYOUT: DashboardLayoutInput,
  QUIZ: CreateQuizInput,
  KNOWLEDGE: KnowledgeBatchInput,
} satisfies Record<ProposalType, z.ZodType>;

export type ProposalPayloads = {
  [T in ProposalType]: z.infer<(typeof ProposalPayloadSchemas)[T]>;
};

/** A proposal's type and payload, discriminated by `type`. */
export type ProposalDraft = {
  [T in ProposalType]: { type: T; payload: ProposalPayloads[T] };
}[ProposalType];

// API response types (contract §9)
export type ProposalView = {
  id: string;
  type: ProposalType;
  summary: string;
  payload: unknown;
  status: ProposalStatus;
  createdAt: string;
  /** Readable preview lines computed by code (added in v0.5; optional so older callers still work). */
  preview?: string[];
};
export type Citation = { materialId: string; unitId: string; title: string; quote: string };
