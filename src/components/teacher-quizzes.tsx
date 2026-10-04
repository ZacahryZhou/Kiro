"use client";

import { useState, useTransition } from "react";
import { Check, Eye, EyeOff, FileQuestion, Quote, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { QuizQuestionView, QuizResultsView, QuizView } from "@/contracts";
import { deleteQuizAction, publishQuizAction } from "@/app/(teacher)/teacher/courses/quiz-actions";

const TYPE_LABEL = { MULTIPLE_CHOICE: "Multiple choice", TRUE_FALSE: "True / false", SHORT_ANSWER: "Short answer" } as const;
const LEVEL_LABEL = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" } as const;
const LEVEL_STYLE = { EASY: "bg-emerald-100 text-emerald-900", MEDIUM: "bg-amber-100 text-amber-900", HARD: "bg-rose-100 text-rose-900" } as const;

function tally<K extends string>(questions: QuizQuestionView[], key: (q: QuizQuestionView) => K, labels: Record<K, string>) {
  return (Object.keys(labels) as K[]).map((k) => [labels[k], questions.filter((q) => key(q) === k).length] as const).filter(([, n]) => n > 0).map(([label, n]) => `${n} ${label.toLowerCase()}`).join(" · ");
}

function Question({ question }: { question: QuizQuestionView }) {
  return (
    <li className="rounded-xl border bg-card/60 p-4" data-testid="quiz-question">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold tabular-nums">Q{question.order}</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${LEVEL_STYLE[question.difficulty]}`}>{LEVEL_LABEL[question.difficulty]}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{TYPE_LABEL[question.type]}</span>
        <span className="text-muted-foreground">Topic: {question.topic}</span>
      </div>
      <p className="mt-2 font-medium">{question.prompt}</p>
      {question.options && (
        <ul className="mt-2 space-y-1 text-sm">
          {question.options.map((option) => (
            <li key={option} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${option === question.answer ? "bg-emerald-50 font-medium text-emerald-900" : "text-muted-foreground"}`}>
              {option === question.answer ? <Check className="size-4 shrink-0" aria-label="Correct answer" /> : <span className="size-4 shrink-0" aria-hidden />}
              {option}
            </li>
          ))}
        </ul>
      )}
      {!question.options && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-sm text-emerald-900"><Check className="size-4 shrink-0" aria-hidden /><span><span className="font-medium">Answer:</span> {question.answer}</span></p>
      )}
      {question.explanation && <p className="mt-2 text-sm text-muted-foreground">{question.explanation}</p>}
      {question.sourceQuote && (
        <p className="mt-2 flex gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Quote className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>From {question.sourceTitle ? <span className="font-medium">{question.sourceTitle}</span> : "your materials"}: “{question.sourceQuote}”</span>
        </p>
      )}
    </li>
  );
}

function ResultsPanel({ results }: { results?: QuizResultsView }) {
  if (!results) return null;
  const pct = (score: number, graded: number) => (graded > 0 ? `${score}/${graded} (${Math.round((score / graded) * 100)}%)` : "not marked");
  return (
    <details className="group rounded-xl border bg-muted/30 p-3" data-testid="quiz-results">
      <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
        Student results · {results.takers} {results.takers === 1 ? "student has" : "students have"} taken it{results.averagePercent !== null ? ` · average ${results.averagePercent}%` : ""}
      </summary>
      {results.students.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{results.published ? "Nobody has taken this quiz yet." : "Publish the quiz so students can take it."}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="text-muted-foreground"><tr><th scope="col" className="py-1.5 pr-4 font-medium">Student</th><th scope="col" className="py-1.5 pr-4 font-medium">Latest</th><th scope="col" className="py-1.5 pr-4 font-medium">Best</th><th scope="col" className="py-1.5 font-medium">Attempts</th></tr></thead>
            <tbody className="divide-y">{results.students.map((student) => (
              <tr key={student.studentId} data-testid="quiz-result-row"><td className="py-1.5 pr-4 font-medium">{student.studentName}</td><td className="py-1.5 pr-4 tabular-nums">{pct(student.latest.score, student.latest.graded)}</td><td className="py-1.5 pr-4 tabular-nums">{pct(student.best.score, student.best.graded)}</td><td className="py-1.5 tabular-nums">{student.attempts}</td></tr>
            ))}</tbody>
          </table></div>
          {results.hardestQuestions.length > 0 && (
            <div className="text-sm"><p className="font-medium">Most missed</p><ul className="mt-1 space-y-0.5 text-muted-foreground">{results.hardestQuestions.map((q) => <li key={q.questionId}>Q{q.order}: {q.prompt} <span className="whitespace-nowrap">({q.wrong} of {q.answered} wrong)</span></li>)}</ul></div>
          )}
        </div>
      )}
      {results.notTaken.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Not taken yet: {results.notTaken.map((n) => n.studentName).join(", ")}</p>}
    </details>
  );
}

function QuizCard({ courseId, quiz, results }: { courseId: string; quiz: QuizView; results?: QuizResultsView }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  function toggle() {
    startTransition(async () => {
      const result = await publishQuizAction(courseId, quiz.id, !quiz.published);
      setMessage({ ok: result.ok, text: result.message });
    });
  }
  function remove() {
    if (!window.confirm(`Delete the quiz “${quiz.title}”? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteQuizAction(courseId, quiz.id);
      if (!result.ok) setMessage({ ok: false, text: result.message });
    });
  }
  return (
    <li className="kora-card space-y-3 p-5" data-testid="quiz-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight">{quiz.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{quiz.questions.length} questions · {tally(quiz.questions, (q) => q.type, TYPE_LABEL)}</p>
          <p className="text-sm text-muted-foreground">{tally(quiz.questions, (q) => q.difficulty, LEVEL_LABEL)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={quiz.published ? "default" : "outline"} data-testid="quiz-status">{quiz.published ? "Published" : "Draft"}</Badge>
          <button type="button" onClick={toggle} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50" data-testid="quiz-publish">
            {quiz.published ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            {quiz.published ? "Hide from students" : "Publish to students"}
          </button>
          <button type="button" onClick={remove} disabled={pending} aria-label={`Delete ${quiz.title}`} className="inline-flex size-9 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-muted-foreground" : "text-destructive"}`}>{message.text}</p>}
      <ResultsPanel results={results} />
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">View questions and answer key</summary>
        <ol className="mt-3 space-y-3">{quiz.questions.map((q) => <Question key={q.id} question={q} />)}</ol>
      </details>
    </li>
  );
}

export function TeacherQuizzes({ courseId, quizzes, results = [] }: { courseId: string; quizzes: QuizView[]; results?: QuizResultsView[] }) {
  if (quizzes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground"><FileQuestion className="size-5" aria-hidden /></div>
        <h3 className="font-medium">No quizzes yet</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Ask the assistant to write one from your materials, for example: “Create a quiz of 8 questions for this course: 5 multiple choice, 2 true/false, 1 short answer; 3 easy, 3 medium, 2 hard; covering slope and solving equations.”</p>
      </div>
    );
  }
  return <ul className="space-y-4">{quizzes.map((quiz) => <QuizCard key={quiz.id} courseId={courseId} quiz={quiz} results={results.find((r) => r.quizId === quiz.id)} />)}</ul>;
}
