"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/actor";
import { deleteQuiz, setQuizPublished } from "@/services/quiz";

type Outcome = { ok: true; message: string } | { ok: false; message: string };

function refresh(courseId: string) {
  revalidatePath(`/teacher/courses/${courseId}`);
  revalidatePath(`/student/courses/${courseId}`);
}

export async function publishQuizAction(courseId: string, quizId: string, published: boolean): Promise<Outcome> {
  const actor = await requireRole("TEACHER");
  const result = await setQuizPublished(actor, { quizId, published });
  if (!result.ok) return { ok: false, message: result.error.message };
  refresh(courseId);
  return { ok: true, message: published ? "Published. Students in this course can now practise it." : "Hidden from students." };
}

export async function deleteQuizAction(courseId: string, quizId: string): Promise<Outcome> {
  const actor = await requireRole("TEACHER");
  const result = await deleteQuiz(actor, { quizId });
  if (!result.ok) return { ok: false, message: result.error.message };
  refresh(courseId);
  return { ok: true, message: "Quiz deleted." };
}
