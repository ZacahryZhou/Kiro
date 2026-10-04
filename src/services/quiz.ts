import type { Prisma } from "@prisma/client";
import {
  CheckQuizInput as CheckQuizInputSchema,
  CreateQuizInput as CreateQuizInputSchema,
  DeleteQuizInput as DeleteQuizInputSchema,
  SetQuizPublishedInput as SetQuizPublishedInputSchema,
  err,
  ok,
  type CheckQuizInput,
  type CreateQuizInput,
  type DeleteQuizInput,
  type QuizQuestionView,
  type QuizResultView,
  type QuizStudentView,
  type QuizView,
  type Result,
  type SetQuizPublishedInput,
} from "@/contracts";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { gradeAnswer } from "@/lib/quiz-grading";

// Quizzes (contract v0.7). Teachers own the full quiz, key included; students only ever get the
// questions of published quizzes in courses they are enrolled in, and the key comes back only
// after they submit answers.

const questionSelect = { id: true, order: true, type: true, difficulty: true, topic: true, prompt: true, options: true, answer: true, explanation: true, sourceMaterialId: true, sourceQuote: true } as const;

function optionsOf(value: Prisma.JsonValue | null): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
}

/** Creates a quiz as a draft. Every material a question cites must belong to the course. */
export async function createQuiz(actor: Actor, input: CreateQuizInput): Promise<Result<{ quizId: string; questionCount: number }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can create quizzes.");
  const parsed = CreateQuizInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", parsed.error.issues[0]?.message ?? "That quiz is not valid.");
  const quiz = parsed.data;
  try {
    const course = await prisma.course.findFirst({ where: { id: quiz.courseId, teacherId: actor.userId }, select: { id: true } });
    if (!course) return err("FORBIDDEN", "You do not have access to this course.");
    const cited = [...new Set(quiz.questions.flatMap((q) => (q.sourceMaterialId ? [q.sourceMaterialId] : [])))];
    if (cited.length > 0) {
      const own = await prisma.material.count({ where: { id: { in: cited }, unit: { courseId: course.id } } });
      if (own !== cited.length) return err("VALIDATION", "A question cites a material that is not in this course.");
    }
    const created = await prisma.quiz.create({
      data: {
        courseId: course.id,
        title: quiz.title,
        questions: {
          create: quiz.questions.map((q, index) => ({
            order: index + 1,
            type: q.type,
            difficulty: q.difficulty,
            topic: q.topic,
            prompt: q.prompt,
            options: q.options ?? undefined,
            answer: q.answer,
            explanation: q.explanation || null,
            sourceMaterialId: q.sourceMaterialId ?? null,
            sourceQuote: q.sourceQuote ?? null,
          })),
        },
      },
      select: { id: true },
    });
    return ok({ quizId: created.id, questionCount: quiz.questions.length });
  } catch {
    return err("INTERNAL", "Could not save the quiz. Please try again.");
  }
}

/** The teacher's quizzes with the full answer key, newest first. */
export async function listMyQuizzes(actor: Actor, input: { courseId?: string } = {}): Promise<Result<{ quizzes: QuizView[] }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can view quiz answer keys.");
  try {
    const rows = await prisma.quiz.findMany({
      where: { course: { teacherId: actor.userId }, ...(input.courseId ? { courseId: input.courseId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, courseId: true, title: true, published: true, createdAt: true, course: { select: { name: true } }, questions: { orderBy: { order: "asc" }, select: questionSelect } },
    });
    const materialIds = [...new Set(rows.flatMap((row) => row.questions.flatMap((q) => (q.sourceMaterialId ? [q.sourceMaterialId] : []))))];
    const titles = new Map((materialIds.length ? await prisma.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, title: true } }) : []).map((m) => [m.id, m.title]));
    return ok({
      quizzes: rows.map((row) => ({
        id: row.id,
        courseId: row.courseId,
        courseName: row.course.name,
        title: row.title,
        published: row.published,
        createdAt: row.createdAt.toISOString(),
        questions: row.questions.map((q): QuizQuestionView => ({
          id: q.id,
          order: q.order,
          type: q.type,
          difficulty: q.difficulty,
          topic: q.topic,
          prompt: q.prompt,
          ...(optionsOf(q.options) ? { options: optionsOf(q.options) } : {}),
          answer: q.answer,
          ...(q.explanation ? { explanation: q.explanation } : {}),
          ...(q.sourceQuote ? { sourceQuote: q.sourceQuote } : {}),
          ...(q.sourceMaterialId && titles.get(q.sourceMaterialId) ? { sourceTitle: titles.get(q.sourceMaterialId) } : {}),
        })),
      })),
    });
  } catch {
    return err("INTERNAL", "Could not load the quizzes. Please try again.");
  }
}

/** Published quizzes in the student's own courses. The answer key is never included. */
export async function listStudentQuizzes(actor: Actor, input: { courseId?: string } = {}): Promise<Result<{ quizzes: QuizStudentView[] }>> {
  if (actor.role !== "STUDENT") return err("FORBIDDEN", "Only students can take quizzes.");
  try {
    const rows = await prisma.quiz.findMany({
      where: { published: true, course: { enrollments: { some: { studentId: actor.userId } } }, ...(input.courseId ? { courseId: input.courseId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, courseId: true, title: true, createdAt: true, course: { select: { name: true } }, questions: { orderBy: { order: "asc" }, select: { id: true, order: true, type: true, difficulty: true, topic: true, prompt: true, options: true } } },
    });
    return ok({
      quizzes: rows.map((row) => ({
        id: row.id,
        courseId: row.courseId,
        courseName: row.course.name,
        title: row.title,
        createdAt: row.createdAt.toISOString(),
        questions: row.questions.map((q) => ({ id: q.id, order: q.order, type: q.type, difficulty: q.difficulty, topic: q.topic, prompt: q.prompt, ...(optionsOf(q.options) ? { options: optionsOf(q.options) } : {}) })),
      })),
    });
  } catch {
    return err("INTERNAL", "Could not load the quizzes. Please try again.");
  }
}

/** Publishes a quiz so enrolled students can practise it, or hides it again. */
export async function setQuizPublished(actor: Actor, input: SetQuizPublishedInput): Promise<Result<{ published: boolean }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can publish quizzes.");
  const parsed = SetQuizPublishedInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a quiz.");
  try {
    const updated = await prisma.quiz.updateMany({ where: { id: parsed.data.quizId, course: { teacherId: actor.userId } }, data: { published: parsed.data.published } });
    if (updated.count === 0) return err("NOT_FOUND", "That quiz was not found.");
    return ok({ published: parsed.data.published });
  } catch {
    return err("INTERNAL", "Could not update the quiz. Please try again.");
  }
}

export async function deleteQuiz(actor: Actor, input: DeleteQuizInput): Promise<Result<{ deleted: true }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can delete quizzes.");
  const parsed = DeleteQuizInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Choose a quiz.");
  try {
    const removed = await prisma.quiz.deleteMany({ where: { id: parsed.data.quizId, course: { teacherId: actor.userId } } });
    if (removed.count === 0) return err("NOT_FOUND", "That quiz was not found.");
    return ok({ deleted: true });
  } catch {
    return err("INTERNAL", "Could not delete the quiz. Please try again.");
  }
}

/**
 * Practice mode for a student: marks multiple-choice and true/false answers and reveals the key and
 * explanations. Short answers are shown with the model answer for the student to compare. Nothing is stored.
 */
export async function checkQuizAnswers(actor: Actor, input: CheckQuizInput): Promise<Result<QuizResultView>> {
  if (actor.role !== "STUDENT") return err("FORBIDDEN", "Only students can take quizzes.");
  const parsed = CheckQuizInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Answer the questions and try again.");
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: parsed.data.quizId, published: true, course: { enrollments: { some: { studentId: actor.userId } } } },
      select: { questions: { orderBy: { order: "asc" }, select: { id: true, type: true, answer: true, explanation: true } } },
    });
    if (!quiz) return err("NOT_FOUND", "That quiz was not found.");
    const given = new Map(parsed.data.answers.map((a) => [a.questionId, a.answer]));
    const results = quiz.questions.map((q) => {
      const yourAnswer = given.get(q.id) ?? "";
      return { questionId: q.id, correct: yourAnswer === "" && q.type !== "SHORT_ANSWER" ? false : gradeAnswer(q.type, yourAnswer, q.answer), yourAnswer, correctAnswer: q.answer, ...(q.explanation ? { explanation: q.explanation } : {}) };
    });
    const marked = results.filter((r) => r.correct !== null);
    return ok({ graded: marked.length, score: marked.filter((r) => r.correct).length, results });
  } catch {
    return err("INTERNAL", "Could not check your answers. Please try again.");
  }
}
