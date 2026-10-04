"use server";

import { requireRole } from "@/lib/auth/actor";
import type { QuizResultView } from "@/contracts";
import { checkQuizAnswers } from "@/services/quiz";

/** Marks a student's practice answers. Nothing is stored. */
export async function checkQuizAction(quizId: string, answers: { questionId: string; answer: string }[]): Promise<{ ok: true; result: QuizResultView } | { ok: false; message: string }> {
  const actor = await requireRole("STUDENT");
  const result = await checkQuizAnswers(actor, { quizId, answers });
  if (!result.ok) return { ok: false, message: result.error.message };
  return { ok: true, result: result.data };
}
