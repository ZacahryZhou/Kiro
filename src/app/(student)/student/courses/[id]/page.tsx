import { notFound } from "next/navigation";
import { BookOpen, ExternalLink } from "lucide-react";
import { EmptyState, ErrorAlert, PageHeader } from "@/components/page";
import { requireRole } from "@/lib/auth/actor";
import { NEXT_ACTION_LABELS } from "@/lib/progress";
import { formatLocalDate } from "@/lib/time";
import { CourseAssistant } from "@/features/ai-agent";
import { StudentNotes } from "@/components/student-notes";
import { StudentQuizzes } from "@/components/student-quizzes";
import { listKnowledgeForStudent } from "@/services/knowledge";
import { listMyQuizAttempts, listStudentQuizzes } from "@/services/quiz";
import { getCourseMaterials, listMyCourses, listProgressRecords } from "@/services/read";

function safeExternalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export default async function StudentCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("STUDENT");
  const { id } = await params;
  const coursesResult = await listMyCourses(actor);
  if (!coursesResult.ok) {
    return (
      <ErrorAlert message={coursesResult.error.message} />
    );
  }

  const course = coursesResult.data.courses.find((item) => item.id === id);
  if (!course) notFound();

  const [materialsResult, progressResult, quizzesResult, notesResult, attemptsResult] = await Promise.all([getCourseMaterials(actor, { courseId: id }), listProgressRecords(actor, { courseId: id }), listStudentQuizzes(actor, { courseId: id }), listKnowledgeForStudent(actor, { courseId: id }), listMyQuizAttempts(actor, { courseId: id })]);
  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const progress = progressResult.ok ? progressResult.data.records : [];
  return (
    <section className="space-y-6">
      <PageHeader
        back={{ href: "/student", label: "Back to learning" }}
        eyebrow="Course materials"
        title={course.name}
        description={`${course.subject} · Teacher: ${course.teacherName}`}
      />

      <CourseAssistant role="STUDENT" courseId={course.id} courseName={course.name} />

      {notesResult.ok && <StudentNotes notes={notesResult.data.entries} teacherName={course.teacherName} />}

      {quizzesResult.ok && <StudentQuizzes quizzes={quizzesResult.data.quizzes} attempts={attemptsResult.ok ? attemptsResult.data.attempts : []} />}

      {!materialsResult.ok ? (
        <ErrorAlert message={materialsResult.error.message} />
      ) : materialsResult.data.units.length === 0 ? (
        <EmptyState title="No materials have been added yet" description="Your teacher's lesson materials will appear here." />
      ) : (
        <ol className="space-y-4">
          {materialsResult.data.units.map((unit) => (
            <li key={unit.id} className="kora-card space-y-4 p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden><BookOpen className="size-5" /></span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit {unit.order}</p>
                  <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{unit.title}</h2>
                </div>
              </div>
              {unit.materials.length === 0 ? (
                <p className="text-sm text-muted-foreground">No materials in this unit yet.</p>
              ) : (
                <ul className="space-y-4">
                  {unit.materials.map((material) => {
                    const url = safeExternalUrl(material.url);
                    return (
                    <li key={material.id} className="rounded-xl border bg-muted/40 p-4">
                      <h3 className="font-medium">{material.title}</h3>
                      {material.kind === "TEXT" ? (
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{material.content}</div>
                      ) : url ? (
                        <a
                          className="mt-3 inline-flex items-center gap-1.5 break-all text-sm font-medium text-primary underline underline-offset-4"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open learning resource<ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      ) : null}
                    </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      {progress.length > 0 && (
        <section aria-labelledby="progress-heading" className="space-y-3">
          <h2 id="progress-heading" className="text-lg font-semibold tracking-tight sm:text-xl">Your progress notes</h2>
          <ul className="space-y-3">
            {progress.map((record) => (
              <li key={record.id} className="kora-card space-y-1.5 p-5">
                <p className="text-sm text-muted-foreground">{formatLocalDate(new Date(record.sessionStartAt), timeZone)}</p>
                <p className="text-sm"><span className="text-muted-foreground">Goal: </span>{record.goal}</p>
                <p className="text-sm"><span className="text-muted-foreground">What you produced: </span>{record.output}</p>
                {record.issue && <p className="text-sm"><span className="text-muted-foreground">Difficulty: </span>{record.issue}</p>}
                <p className="text-sm"><span className="text-muted-foreground">Next step: </span>{NEXT_ACTION_LABELS[record.nextAction]}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
