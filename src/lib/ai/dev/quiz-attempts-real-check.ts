/* eslint-disable @typescript-eslint/no-explicit-any -- dev check script reads untyped service results */
// Saved quiz attempts against the real database: scores, teacher results, isolation.
// Run against an isolated migrated development database after `npm run db:seed:demo`:
//   NODE_ENV=development npx tsx src/lib/ai/dev/quiz-attempts-real-check.ts
import { prisma } from "@/lib/db/prisma";
import { seedFixtures } from "../../../../prisma/seed-ai";
import * as quizzes from "@/services/quiz";
import type { Actor } from "@/contracts";

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.info("SKIP quiz attempts check (run with NODE_ENV=development against an isolated database).");
    await prisma.$disconnect();
    return;
  }
  const user = (email: string) => prisma.user.findUnique({ where: { email } });
  const [alexU, taylorU, jordanU, samU, caseyU] = await Promise.all([user("t+alex@example.test"), user("t+taylor@example.test"), user("s+jordan@example.test"), user("s+sam@example.test"), user("s+casey@example.test")]);
  if (!alexU || !taylorU || !jordanU || !samU || !caseyU) throw new Error("Run npm run db:seed:demo first.");
  const alex: Actor = { userId: alexU.id, role: "TEACHER" };
  const taylor: Actor = { userId: taylorU.id, role: "TEACHER" };
  const jordan: Actor = { userId: jordanU.id, role: "STUDENT" };
  const sam: Actor = { userId: samU.id, role: "STUDENT" };
  const casey: Actor = { userId: caseyU.id, role: "STUDENT" };
  let assertions = 0;
  const check = (condition: boolean, description: string) => {
    if (!condition) throw new Error(`FAIL: ${description}`);
    assertions += 1;
    console.info(`PASS ${description}`);
  };
  try {
    await seedFixtures(prisma, { reset: true });
    const created = await quizzes.createQuiz(alex, {
      courseId: "kora-ai-course-math",
      title: "Attempts check",
      questions: [
        { type: "MULTIPLE_CHOICE", difficulty: "EASY", topic: "t", prompt: "Pick B", options: ["A", "B", "C"], answer: "B" },
        { type: "TRUE_FALSE", difficulty: "EASY", topic: "t", prompt: "Sky is blue", answer: "True" },
        { type: "SHORT_ANSWER", difficulty: "MEDIUM", topic: "t", prompt: "Name one", answer: "anything" },
      ],
    });
    if (!created.ok) throw new Error("Could not create the check quiz.");
    const quizId = created.data.quizId;
    const questions = await prisma.quizQuestion.findMany({ where: { quizId }, orderBy: { order: "asc" } });
    const answers = (a: string, b: string) => [{ questionId: questions[0].id, answer: a }, { questionId: questions[1].id, answer: b }, { questionId: questions[2].id, answer: "something" }];

    check(!(await quizzes.checkQuizAnswers(jordan, { quizId, answers: answers("B", "True") })).ok, "a draft quiz cannot be taken, so nothing is saved");
    await quizzes.setQuizPublished(alex, { quizId, published: true });
    const first = await quizzes.checkQuizAnswers(jordan, { quizId, answers: answers("A", "True") });
    check(first.ok && first.data.graded === 2 && first.data.score === 1, "a submission is marked by code (short answers are not marked)");
    check((await prisma.quizAttempt.count({ where: { quizId, studentId: jordan.userId } })) === 1, "the attempt is saved");
    await quizzes.checkQuizAnswers(jordan, { quizId, answers: answers("B", "True") });
    await quizzes.checkQuizAnswers(sam, { quizId, answers: answers("A", "False") });
    check(!(await quizzes.checkQuizAnswers(casey, { quizId, answers: answers("B", "True") })).ok && (await prisma.quizAttempt.count({ where: { studentId: casey.userId } })) === 0, "a student who is not in the course cannot take it or leave an attempt");

    const mine = await quizzes.listMyQuizAttempts(jordan, { courseId: "kora-ai-course-math" });
    check(mine.ok && mine.data.attempts.length === 1 && mine.data.attempts[0].score === 2 && mine.data.attempts[0].attempts === 2, "a student sees their own latest result and attempt count");
    check(mine.ok && !(await quizzes.listMyQuizAttempts(sam)).ok === false && (await quizzes.listMyQuizAttempts(sam) as any).data.attempts[0].score === 0, "another student's result is separate");
    check(!(await quizzes.listMyQuizAttempts(alex)).ok, "a teacher cannot use the student result list");

    const results = await quizzes.listQuizResults(alex, { courseId: "kora-ai-course-math" });
    const view = results.ok ? results.data.quizzes.find((q) => q.quizId === quizId) : undefined;
    check(!!view && view.takers === 2 && view.students.length === 2, "the teacher sees both students who took it");
    const jordanRow = view?.students.find((s) => s.studentId === jordan.userId);
    check(jordanRow?.attempts === 2 && jordanRow.latest.score === 2 && jordanRow.best.score === 2, "latest, best and attempts are right for a student with two attempts");
    check(view?.averagePercent === 50, "the class average uses each student's latest result (100% and 0%)");
    check((view?.hardestQuestions[0]?.wrong ?? 0) >= 1, "the most-missed questions are listed");
    check(!(await quizzes.listQuizResults(taylor)).ok === false && (await quizzes.listQuizResults(taylor) as any).data.quizzes.every((q: { quizId: string }) => q.quizId !== quizId), "another teacher never sees these results");
    check(!(await quizzes.listQuizResults(jordan)).ok, "a student cannot see class results");

    await prisma.enrollment.delete({ where: { courseId_studentId: { courseId: "kora-ai-course-math", studentId: sam.userId } } });
    const after = await quizzes.listQuizResults(alex, { quizId });
    check(after.ok && after.data.quizzes[0].takers === 1, "a student removed from the course drops out of the results");
    await quizzes.deleteQuiz(alex, { quizId });
    check((await prisma.quizAttempt.count({ where: { quizId } })) === 0, "deleting a quiz deletes its attempts");
  } finally {
    await seedFixtures(prisma, { reset: true });
    await prisma.$disconnect();
  }
  console.info(`All ${assertions} quiz attempt checks passed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Quiz attempts check failed.");
  process.exitCode = 1;
});
