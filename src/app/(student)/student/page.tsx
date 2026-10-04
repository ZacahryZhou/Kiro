import Link from "next/link";
import { BookOpen, CalendarDays, CheckCircle2, MapPin } from "lucide-react";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorAlert, PageHeader, SectionHeading, StatCard } from "@/components/page";
import { requireRole } from "@/lib/auth/actor";
import { formatLocalDate, formatLocalTime, getLocalDateKey } from "@/lib/time";
import { StudentRequestForm } from "@/components/student-request-form";
import { getStudentWorkspace, listAttendance, listStudentRequests, type SessionView } from "@/services/read";

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
  const session = await auth();
  const firstName = session?.user?.name?.trim().split(/\s+/)[0];
  const now = new Date();
  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [result, attendanceResult, requestsResult] = await Promise.all([
    getStudentWorkspace(actor, { from: now.toISOString(), to: to.toISOString() }),
    listAttendance(actor, {}),
    listStudentRequests(actor, {}),
  ]);
  const requests = requestsResult.ok ? requestsResult.data.requests : [];
  const pendingSessions = new Set(requests.filter((request) => request.status === "PENDING").map((request) => request.sessionId));

  const sessionsByDate = new Map<string, SessionView[]>();
  if (result.ok) {
    for (const session of result.data.sessions) {
      const dateKey = getLocalDateKey(new Date(session.startAt), timeZone);
      sessionsByDate.set(dateKey, [...(sessionsByDate.get(dateKey) ?? []), session]);
    }
  }

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Student Workspace"
        title="Your learning"
        description={firstName ? `Welcome back, ${firstName}. Your courses and schedule, all in one place.` : "Your courses and schedule, all in one place."}
      />

      {!result.ok ? (
        <ErrorAlert message={result.error.message} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={BookOpen} label="Courses" value={result.data.courses.length} />
            <StatCard icon={CalendarDays} label="Upcoming sessions" value={result.data.sessions.length} hint="Next 30 days" />
            <StatCard
              icon={CheckCircle2}
              label="Attended"
              value={attendanceResult.ok ? attendanceResult.data.records.filter((record) => record.status === "PRESENT").length : "-"}
              hint="Sessions marked present"
            />
          </div>

          <section aria-labelledby="courses-heading" className="space-y-4">
            <SectionHeading id="courses-heading" title="My courses" description={`${result.data.courses.length} ${result.data.courses.length === 1 ? "course" : "courses"}`} />

            {result.data.courses.length === 0 ? (
              <EmptyState title="You are not enrolled in any courses yet" description="Your teacher's courses will appear here when you join one." />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {result.data.courses.map((course) => (
                  <li key={course.id}>
                    <Link
                      href={`/student/courses/${course.id}`}
                      className="kora-card-link block h-full p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold">{course.name}</h3>
                        <Badge variant="outline">{courseTypeLabels[course.type]}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{course.subject}</p>
                      <p className="mt-4 text-sm">Teacher: {course.teacherName}</p>
                      {course.location && <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-3.5" aria-hidden />{course.location}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="upcoming-heading" className="space-y-4">
            <SectionHeading id="upcoming-heading" title="Upcoming sessions" description="Your schedule for the next 30 days." />

            {result.data.sessions.length === 0 ? (
              <EmptyState title="No upcoming sessions" description="New sessions for your courses will show up here." />
            ) : (
              <div className="space-y-4">
                {[...sessionsByDate.entries()].map(([dateKey, sessions]) => (
                  <section key={dateKey} aria-labelledby={`date-${dateKey}`} className="kora-card overflow-hidden">
                    <h3 id={`date-${dateKey}`} className="border-b bg-muted/40 px-5 py-3 text-sm font-semibold">
                      {formatLocalDate(new Date(`${dateKey}T12:00:00Z`), "UTC")}
                    </h3>
                    <ul className="divide-y">
                      {sessions.map((session) => (
                        <li key={session.id}>
                          <Link
                            href={`/student/courses/${session.courseId}`}
                            className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
                          {(session.status === "SCHEDULED" || session.status === "RESCHEDULED") &&
                            (pendingSessions.has(session.id) ? (
                              <p className="border-t bg-muted/30 px-5 py-2.5 text-sm text-muted-foreground">Request sent. Waiting for your teacher.</p>
                            ) : (
                              <StudentRequestForm sessionId={session.id} />
                            ))}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </section>

          {requests.length > 0 && (
            <section aria-labelledby="requests-heading" className="space-y-4">
              <SectionHeading id="requests-heading" title="My requests" description="Leave and different-time requests you sent to your teachers." />
              <ul className="kora-card divide-y overflow-hidden">
                {requests.map((request) => (
                  <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="font-medium">{request.courseName}</p>
                      <p className="text-sm text-muted-foreground">
                        {request.kind === "LEAVE" ? "Leave" : "Different time"} · {formatLocalDate(new Date(request.sessionStartAt), timeZone)}, {formatLocalTime(new Date(request.sessionStartAt), timeZone)}
                      </p>
                    </div>
                    <Badge variant={request.status === "PENDING" ? "outline" : request.status === "APPROVED" ? "secondary" : "destructive"}>
                      {request.status === "PENDING" ? "Pending" : request.status === "APPROVED" ? "Approved" : "Declined"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="attendance-heading" className="space-y-4">
            <SectionHeading id="attendance-heading" title="Attendance history" description="Your attendance for completed sessions." />
            {!attendanceResult.ok ? (
              <ErrorAlert message={attendanceResult.error.message} />
            ) : attendanceResult.data.records.length === 0 ? (
              <EmptyState title="No attendance records yet" description="Your teacher's attendance records will appear here." />
            ) : (
              <div role="region" aria-label="Attendance records" tabIndex={0} className="kora-card overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Date</th>
                      <th scope="col" className="px-5 py-3 font-medium">Course</th>
                      <th scope="col" className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {attendanceResult.data.records.map((record) => {
                      const courseName = result.ok
                        ? result.data.courses.find((course) => course.id === record.courseId)?.name
                        : undefined;
                      return (
                        <tr key={record.id}>
                          <td className="px-5 py-4">{formatLocalDate(new Date(record.sessionStartAt), timeZone)}</td>
                          <td className="px-5 py-4 font-medium">{courseName ?? "Course"}</td>
                          <td className="px-5 py-4">
                            <Badge variant={record.status === "ABSENT" ? "destructive" : record.status === "PRESENT" ? "secondary" : "outline"}>
                              {record.status === "PRESENT" ? "Present" : record.status === "LEAVE" ? "Leave" : "Absent"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
