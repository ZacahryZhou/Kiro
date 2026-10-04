"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleHelp, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { QuizAttemptView, QuizResultView, QuizStudentView } from "@/contracts";
import { checkQuizAction } from "@/app/(student)/student/courses/quiz-actions";

const LEVEL_LABEL = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" } as const;

function QuizCard({ quiz, last }: { quiz: QuizStudentView; last?: QuizAttemptView }) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResultView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const answered = quiz.questions.filter((q) => (answers[q.id] ?? "").trim() !== "").length;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await checkQuizAction(quiz.id, quiz.questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" })));
      if (response.ok) setResult(response.result);
      else setError(response.message);
    });
  }
  function reset() {
    setAnswers({});
    setResult(null);
    setError(null);
  }

  return (
    <li className="rounded-xl border bg-muted/40 p-4" data-testid="student-quiz">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">{quiz.title}</h3>
          <p className="text-xs text-muted-foreground">{quiz.questions.length} questions · your score is saved and your teacher can see it</p>
          {last && (
            <p className="mt-1 text-xs font-medium text-emerald-700" data-testid="last-result">
              {last.graded > 0 ? `Last result: ${last.score} of ${last.graded} right` : "Last attempt saved"} · {last.attempts} {last.attempts === 1 ? "attempt" : "attempts"}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85" aria-expanded={open} data-testid="start-quiz">
          {open ? "Close" : result ? "Review" : "Start practice"}
        </button>
      </div>
      {open && (
        <form onSubmit={submit} className="mt-4 space-y-4">
          {result && (
            <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900" data-testid="quiz-score">
              <p className="text-lg font-semibold">{result.graded === 0 ? "Compare your answers below." : `You got ${result.score} of ${result.graded} right.`}</p>
              <p className="text-sm">{result.results.some((r) => r.correct === null) ? "Short answers are not marked: compare yours with the model answer." : "Read the explanations to see why."}</p>
            </div>
          )}
          <ol className="space-y-4">
            {quiz.questions.map((question) => {
              const mark = result?.results.find((r) => r.questionId === question.id);
              const name = `q-${quiz.id}-${question.id}`;
              return (
                <li key={question.id} className={`rounded-xl border bg-card p-4 ${mark?.correct === true ? "border-emerald-300" : mark?.correct === false ? "border-rose-300" : ""}`}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold tabular-nums text-foreground">Q{question.order}</span>
                    <Badge variant="outline">{LEVEL_LABEL[question.difficulty]}</Badge>
                    <span>{question.topic}</span>
                  </div>
                  <fieldset disabled={!!result || pending} className="mt-2">
                    <legend className="font-medium">{question.prompt}</legend>
                    {question.type === "SHORT_ANSWER" ? (
                      <input
                        aria-label={`Answer to question ${question.order}`}
                        value={answers[question.id] ?? ""}
                        onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                        maxLength={300}
                        className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {(question.options ?? ["True", "False"]).map((option) => (
                          <label key={option} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 ${result ? "cursor-default" : "hover:bg-muted"}`}>
                            <input type="radio" name={name} value={option} checked={answers[question.id] === option} onChange={() => setAnswers({ ...answers, [question.id]: option })} className="size-4 accent-[var(--primary)]" />
                            {option}
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                  {mark && (
                    <div className="mt-3 space-y-1 text-sm" data-testid="question-feedback">
                      <p className={`flex items-center gap-2 font-medium ${mark.correct === true ? "text-emerald-700" : mark.correct === false ? "text-rose-700" : "text-muted-foreground"}`}>
                        {mark.correct === true ? <CheckCircle2 className="size-4" aria-hidden /> : mark.correct === false ? <XCircle className="size-4" aria-hidden /> : <CircleHelp className="size-4" aria-hidden />}
                        {mark.correct === true ? "Correct" : mark.correct === false ? (mark.yourAnswer ? "Not quite" : "Not answered") : "Compare with the model answer"}
                      </p>
                      {mark.correct !== true && <p><span className="text-muted-foreground">Answer: </span><span className="font-medium">{mark.correctAnswer}</span></p>}
                      {mark.explanation && <p className="text-muted-foreground">{mark.explanation}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            {result ? (
              <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"><RotateCcw className="size-4" aria-hidden />Try again</button>
            ) : (
              <>
                <button type="submit" disabled={pending || answered === 0} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50" data-testid="check-answers">{pending ? "Checking…" : "Check my answers"}</button>
                <span className="text-xs text-muted-foreground">{answered} of {quiz.questions.length} answered</span>
              </>
            )}
          </div>
        </form>
      )}
    </li>
  );
}

export function StudentQuizzes({ quizzes, attempts = [] }: { quizzes: QuizStudentView[]; attempts?: QuizAttemptView[] }) {
  if (quizzes.length === 0) return null;
  return (
    <section aria-label="Practice quizzes" className="kora-card space-y-4 p-5 sm:p-6" data-testid="student-quizzes">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Practice</p>
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Quizzes from your teacher</h2>
      </div>
      <ul className="space-y-3">{quizzes.map((quiz) => <QuizCard key={quiz.id} quiz={quiz} last={attempts.find((a) => a.quizId === quiz.id)} />)}</ul>
    </section>
  );
}
