import type { QuestionType } from "@/contracts";

/** Marks one answer. Short answers are not marked automatically: the student compares with the model answer. */
export function gradeAnswer(type: QuestionType, given: string, correct: string): boolean | null {
  if (type === "SHORT_ANSWER") return null;
  return given.trim().toLowerCase() === correct.trim().toLowerCase();
}
