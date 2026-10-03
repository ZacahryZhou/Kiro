import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddStudentForm, CreateSessionsForm } from "@/components/teacher-course-forms";
import { requireRole } from "@/lib/auth/actor";
import { formatLocalDate, formatLocalTime, getLocalDateKey } from "@/lib/time";
import { getTeacherSchedule, listMyCourses, listMyStudents, type SessionView } from "@/services/read";

const statusLabels = {
  SCHEDULED: "Scheduled",
  RESCHEDULED: "Rescheduled",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
} as const;

const courseTypeLabels = {
  ONE_ON_ONE: "One-to-one",
  SMALL_CLASS: "Small class",
} as const;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("TEACHER");
  const { id } = await params;
  const coursesResult = await listMyCourses(actor);

  if (!coursesResult.ok) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        {coursesResult.error.message}
      </div>
    );
  }

  const course = coursesResult.data.courses.find((item) => item.id === id);
  if (!course) notFound();

  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const [studentsResult, scheduleResult] = await Promise.all([
    listMyStudents(actor, { courseId: id }),
    getTeacherSchedule(actor, {
      from: "1970-01-01T00:00:00.000Z",
      to: "9999-12-31T23:59:59.999Z",
      courseId: id,
    }),
  ]);

  const sessionsByDate = new Map<string, SessionView[]>();
  if (scheduleResult.ok) {
    for (const session of scheduleResult.data.sessions) {
      const dateKey = getLocalDateKey(new Date(session.startAt), timeZone);
      sessionsByDate.set(dateKey, [...(sessionsByDate.get(dateKey) ?? []), session]);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <Link href="/teacher" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          ← Back to schedule
        </Link>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-muted-foreground">Course details</p>
          <Badge variant="outline">{courseTypeLabels[course.type]}</Badge>
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{course.name}</h1>
          <p className="mt-2 text-muted-foreground">{course.subject}</p>
        </div>
        {(course.location || course.description) && (
          <div className="space-y-1 text-sm text-muted-foreground">
            {course.location && <p>{course.location}</p>}
            {course.description && <p>{course.description}</p>}
          </div>
        )}
      </header>

      <Tabs defaultValue="students" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:w-[min(100%,34rem)] sm:grid-cols-4">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Students</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {course.studentCount} {course.studentCount === 1 ? "student" : "students"} enrolled
            </p>
          </div>
          {!studentsResult.ok ? (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
              {studentsResult.error.message}
            </div>
          ) : (
            <>
              <AddStudentForm courseId={id} />
              {studentsResult.data.students.length === 0 ? (
                <div className="rounded-2xl border bg-white px-6 py-10 text-center">
                  <h3 className="font-medium">No students enrolled yet</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Add a registered student by email to get started.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-5 py-3 font-medium">Name</th>
                        <th scope="col" className="px-5 py-3 font-medium">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {studentsResult.data.students.map((student) => (
                        <tr key={student.id}>
                          <td className="px-5 py-4 font-medium">{student.name}</td>
                          <td className="px-5 py-4 text-muted-foreground">{student.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Sessions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Course sessions, shown in {timeZone}.</p>
          </div>
          <CreateSessionsForm courseId={id} timeZone={timeZone} />
          {!scheduleResult.ok ? (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
              {scheduleResult.error.message}
            </div>
          ) : scheduleResult.data.sessions.length === 0 ? (
            <div className="rounded-2xl border bg-white px-6 py-10 text-center">
              <h3 className="font-medium">No sessions scheduled yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">Sessions for this course will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {[...sessionsByDate.entries()].map(([dateKey, sessions]) => (
                <section key={dateKey} aria-labelledby={`date-${dateKey}`} className="overflow-hidden rounded-2xl border bg-white">
                  <h3 id={`date-${dateKey}`} className="border-b px-5 py-3 text-sm font-semibold">
                    {formatLocalDate(new Date(`${dateKey}T12:00:00Z`), "UTC")}
                  </h3>
                  <ul className="divide-y">
                    {sessions.map((session) => (
                      <li key={session.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4">
                        <time dateTime={session.startAt} className="w-24 shrink-0 font-medium tabular-nums">
                          {formatLocalTime(new Date(session.startAt), timeZone)}
                        </time>
                        <span className="min-w-32 flex-1 font-medium">
                          {session.durationMin} min
                          {session.location && <span className="ml-2 font-normal text-muted-foreground">· {session.location}</span>}
                        </span>
                        <Badge variant={session.status === "CANCELLED" ? "destructive" : session.status === "COMPLETED" ? "secondary" : "outline"}>
                          {statusLabels[session.status]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="materials">
          <div className="rounded-2xl border bg-white px-6 py-10 text-center">
            <h2 className="font-medium">Course materials are not available yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Material management will be added in a later step.</p>
          </div>
        </TabsContent>

        <TabsContent value="attendance">
          <div className="rounded-2xl border bg-white px-6 py-10 text-center">
            <h2 className="font-medium">Attendance records are not available yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Attendance tracking will be added in a later step.</p>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
