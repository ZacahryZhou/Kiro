import { z } from "zod";

// Quizzes written from course materials (contract v0.7, additive).

export const QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const MAX_QUESTIONS = 30;

const id = z.string().min(1);

export const QuizQuestionDraft = z
  .object({
    type: z.enum(QUESTION_TYPES),
    difficulty: z.enum(DIFFICULTIES),
    topic: z.string().trim().min(1).max(80),
    prompt: z.string().trim().min(1).max(1000),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(5).optional(),
    answer: z.string().trim().min(1).max(500),
    explanation: z.string().trim().max(1000).optional(),
    /** The material and the exact words in it this question is based on. */
    sourceMaterialId: id.optional(),
    sourceQuote: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === "MULTIPLE_CHOICE") {
      const options = q.options ?? [];
      if (options.length < 3) ctx.addIssue({ code: "custom", message: "A multiple-choice question needs 3 to 5 options." });
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) ctx.addIssue({ code: "custom", message: "Options must be different from each other." });
      if (!options.includes(q.answer)) ctx.addIssue({ code: "custom", message: "The answer must be one of the options." });
    } else if (q.options) {
      ctx.addIssue({ code: "custom", message: "Only multiple-choice questions have options." });
    }
    if (q.type === "TRUE_FALSE" && q.answer !== "True" && q.answer !== "False") {
      ctx.addIssue({ code: "custom", message: "A true/false answer must be True or False." });
    }
  });
export type QuizQuestionDraft = z.infer<typeof QuizQuestionDraft>;

export const CreateQuizInput = z.object({
  courseId: id,
  title: z.string().trim().min(1, "Enter a quiz title.").max(120),
  questions: z.array(QuizQuestionDraft).min(1, "A quiz needs at least one question.").max(MAX_QUESTIONS, `A quiz can have at most ${MAX_QUESTIONS} questions.`),
});
export type CreateQuizInput = z.infer<typeof CreateQuizInput>;

export const SetQuizPublishedInput = z.object({ quizId: id, published: z.boolean() });
export type SetQuizPublishedInput = z.infer<typeof SetQuizPublishedInput>;
export const DeleteQuizInput = z.object({ quizId: id });
export type DeleteQuizInput = z.infer<typeof DeleteQuizInput>;
export const CheckQuizInput = z.object({
  quizId: id,
  answers: z.array(z.object({ questionId: id, answer: z.string().max(500) })).max(MAX_QUESTIONS),
});
export type CheckQuizInput = z.infer<typeof CheckQuizInput>;

/** What a teacher sees: the full key. */
export type QuizQuestionView = {
  id: string;
  order: number;
  type: QuestionType;
  difficulty: Difficulty;
  topic: string;
  prompt: string;
  options?: string[];
  answer: string;
  explanation?: string;
  sourceQuote?: string;
  sourceTitle?: string;
};
export type QuizView = { id: string; courseId: string; courseName: string; title: string; published: boolean; createdAt: string; questions: QuizQuestionView[] };

/** What a student sees before answering: no key, no explanation, no source. */
export type QuizStudentQuestionView = { id: string; order: number; type: QuestionType; difficulty: Difficulty; topic: string; prompt: string; options?: string[] };
export type QuizStudentView = { id: string; courseId: string; courseName: string; title: string; createdAt: string; questions: QuizStudentQuestionView[] };

export type QuizResultView = {
  /** Questions that were marked automatically (multiple choice and true/false). */
  graded: number;
  score: number;
  results: { questionId: string; correct: boolean | null; yourAnswer: string; correctAnswer: string; explanation?: string }[];
};
