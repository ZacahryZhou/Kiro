import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/actor";
import { formatLocalDate, formatLocalTime, getLocalDateKey } from "@/lib/time";
import { getStudentWorkspace, type SessionView } from "@/services/read";

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

export default async function Page() {
  const actor = await requireRole("STUDENT");
  const now = new Date();
  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const result = await getStudentWorkspace(actor, { from: now.toISOString(), to: to.toISOString() });

  const sessionsByDate = new Map<string, SessionView[]>();
  if (result.ok) {
    for (const session of result.data.sessions) {
      const dateKey = getLocalDateKey(new Date(session.startAt), timeZone);
      sessionsByDate.set(dateKey, [...(sessionsByDate.get(dateKey) ?? []), session]);
    }
  }

  return (
    <section className="space-y-8">
      <header>
        <p className="mb-2 text-sm font-medium text-muted-foreground">Student Workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">Your learning</h1>
        <p className="mt-2 text-muted-foreground">Your courses and schedule, all in one place.</p>
      </header>

      {!result.ok ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {result.error.message}
        </div>
      ) : (
        <>
          <section aria-labelledby="courses-heading" className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="courses-heading" className="text-xl font-semibold">My courses</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.data.courses.length} {result.data.courses.length === 1 ? "course" : "courses"}
                </p>
              </div>
            </div>

            {result.data.courses.length === 0 ? (
              <div className="rounded-2xl border bg-white px-6 py-10 text-center">
                <h3 className="font-medium">You are not enrolled in any courses yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">Your teacher&apos;s courses will appear here when you join one.</p>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {result.data.courses.map((course) => (
                  <li key={course.id}>
                    <Link
                      href={`/student/courses/${course.id}`}
                      className="block h-full rounded-xl border bg-white p-5 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold">{course.name}</h3>
                        <Badge variant="outline">{courseTypeLabels[course.type]}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{course.subject}</p>
                      <p className="mt-4 text-sm">Teacher: {course.teacherName}</p>
                      {course.location && <p className="mt-1 text-sm text-muted-foreground">{course.location}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="upcoming-heading" className="space-y-4">
            <div>
              <h2 id="upcoming-heading" className="text-xl font-semibold">Upcoming sessions</h2>
              <p className="mt-1 text-sm text-muted-foreground">Your schedule for the next 30 days.</p>
            </div>

            {result.data.sessions.length === 0 ? (
              <div className="rounded-2xl border bg-white px-6 py-10 text-center">
                <h3 className="font-medium">No upcoming sessions</h3>
                <p className="mt-2 text-sm text-muted-foreground">New sessions for your courses will show up here.</p>
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
                        <li key={session.id}>
                          <Link
                            href={`/student/courses/${session.courseId}`}
                            className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            <time dateTime={session.startAt} className="w-24 shrink-0 font-medium tabular-nums">
                              {formatLocalTime(new Date(session.startAt), timeZone)}
                            </time>
                            <span className="min-w-40 flex-1 font-medium">{session.courseName}</span>
                            <span className="text-sm text-muted-foreground">{session.durationMin} min</span>
                            <Badge variant={session.status === "CANCELLED" ? "destructive" : session.status === "COMPLETED" ? "secondary" : "outline"}>
                              {statusLabels[session.status]}
                            </Badge>
                            {session.location && <span className="w-full text-sm text-muted-foreground sm:pl-24">{session.location}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
