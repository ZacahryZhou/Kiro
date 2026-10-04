import { notFound } from "next/navigation";
import { FileText, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorAlert, Initial, PageHeader, SectionHeading } from "@/components/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddStudentForm, CreateSessionsForm, MarkAttendanceForm, ProgressForm, RescheduleSessionForm, TeacherCourseMaterials } from "@/components/teacher-course-forms";
import { NEXT_ACTION_LABELS } from "@/lib/progress";
import { requireRole } from "@/lib/auth/actor";
import { formatLocalDate, formatLocalTime, getLocalDateKey } from "@/lib/time";
import { getCourseMaterials, getTeacherSchedule, listAttendance, listDeductions, listMyCourses, listMyStudents, listProgressRecords, type SessionView } from "@/services/read";

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
      <ErrorAlert message={coursesResult.error.message} />
    );
  }

  const course = coursesResult.data.courses.find((item) => item.id === id);
  if (!course) notFound();

  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const [studentsResult, scheduleResult, attendanceResult, deductionsResult, materialsResult, progressResult] = await Promise.all([
    listMyStudents(actor, { courseId: id }),
    getTeacherSchedule(actor, {
      from: "1970-01-01T00:00:00.000Z",
      to: "9999-12-31T23:59:59.999Z",
      courseId: id,
    }),
    listAttendance(actor, { courseId: id }),
    listDeductions(actor, { courseId: id }),
    getCourseMaterials(actor, { courseId: id }),
    listProgressRecords(actor, { courseId: id }),
  ]);

  const sessionsByDate = new Map<string, SessionView[]>();
  if (scheduleResult.ok) {
    for (const session of scheduleResult.data.sessions) {
      const dateKey = getLocalDateKey(new Date(session.startAt), timeZone);
      sessionsByDate.set(dateKey, [...(sessionsByDate.get(dateKey) ?? []), session]);
    }
  }

  const renderedAt = new Date().getTime();
  const startedSessions = scheduleResult.ok
    ? scheduleResult.data.sessions
        .filter((session) => session.status !== "CANCELLED" && new Date(session.startAt).getTime() <= renderedAt)
        .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))
        .map((session) => ({ id: session.id, label: `${formatLocalDate(new Date(session.startAt), timeZone)}, ${formatLocalTime(new Date(session.startAt), timeZone)}` }))
    : [];

  return (
    <section className="space-y-6">
      <PageHeader
        back={{ href: "/teacher", label: "Back to schedule" }}
        eyebrow="Course details"
        title={course.name}
        description={course.subject}
        actions={<Badge variant="outline">{courseTypeLabels[course.type]}</Badge>}
      />
      <div className="kora-card flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2"><Users className="size-4" aria-hidden />{course.studentCount} {course.studentCount === 1 ? "student" : "students"} enrolled</span>
        {course.location && <span className="inline-flex items-center gap-2"><MapPin className="size-4" aria-hidden />{course.location}</span>}
        {course.description && <span className="inline-flex items-center gap-2"><FileText className="size-4" aria-hidden />{course.description}</span>}
      </div>

      <Tabs defaultValue="students" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:w-[min(100%,44rem)] sm:grid-cols-5">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="space-y-4">
          <SectionHeading title="Students" description={`${course.studentCount} ${course.studentCount === 1 ? "student" : "students"} enrolled`} />
          {!studentsResult.ok ? (
            <ErrorAlert message={studentsResult.error.message} />
          ) : (
            <>
              <AddStudentForm courseId={id} />
              {studentsResult.data.students.length === 0 ? (
                <EmptyState title="No students enrolled yet" description="Add a registered student by email to get started." />
              ) : (
                <div role="region" aria-label="Enrolled students" tabIndex={0} className="kora-card overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-5 py-3 font-medium">Name</th>
                        <th scope="col" className="px-5 py-3 font-medium">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {studentsResult.data.students.map((student) => (
                        <tr key={student.id}>
                          <td className="px-5 py-4 font-medium"><span className="flex items-center gap-3"><Initial name={student.name} className="size-8 text-xs" />{student.name}</span></td>
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
          <SectionHeading title="Sessions" description={`Course sessions, shown in ${timeZone}.`} />
          <CreateSessionsForm courseId={id} timeZone={timeZone} />
          {!scheduleResult.ok ? (
            <ErrorAlert message={scheduleResult.error.message} />
          ) : scheduleResult.data.sessions.length === 0 ? (
            <EmptyState title="No sessions scheduled yet" description="Sessions for this course will appear here." />
          ) : (
            <div className="space-y-4">
              {[...sessionsByDate.entries()].map(([dateKey, sessions]) => (
                <section key={dateKey} aria-labelledby={`date-${dateKey}`} className="kora-card overflow-hidden">
                  <h3 id={`date-${dateKey}`} className="border-b bg-muted/40 px-5 py-3 text-sm font-semibold">
                    {formatLocalDate(new Date(`${dateKey}T12:00:00Z`), "UTC")}
                  </h3>
                  <ul className="divide-y">
                    {sessions.map((session) => (
                      <li key={session.id} className="space-y-3 px-5 py-4">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
                        </div>
                        {(session.status === "SCHEDULED" || session.status === "RESCHEDULED") && studentsResult.ok && (
                          <>
                            <RescheduleSessionForm courseId={id} sessionId={session.id} startAt={session.startAt} timeZone={timeZone} />
                            <MarkAttendanceForm sessionId={session.id} students={studentsResult.data.students} />
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="materials" className="space-y-4">
          <SectionHeading title="Course materials" description="Organize text lessons and helpful links into course units." />
          {!materialsResult.ok ? (
            <ErrorAlert message={materialsResult.error.message} />
          ) : (
            <TeacherCourseMaterials courseId={id} units={materialsResult.data.units} />
          )}
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <SectionHeading title="Attendance" description="Attendance and lesson deductions by session." />
          {!attendanceResult.ok ? (
            <ErrorAlert message={attendanceResult.error.message} />
          ) : !deductionsResult.ok ? (
            <ErrorAlert message={deductionsResult.error.message} />
          ) : attendanceResult.data.records.length === 0 ? (
            <EmptyState title="No attendance records yet" description="Mark attendance for a scheduled session to see it here." />
          ) : (
            <div role="region" aria-label="Attendance and lesson deductions" tabIndex={0} className="kora-card overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">Session</th>
                    <th scope="col" className="px-5 py-3 font-medium">Student</th>
                    <th scope="col" className="px-5 py-3 font-medium">Attendance</th>
                    <th scope="col" className="px-5 py-3 font-medium">Lesson deduction</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {attendanceResult.data.records.map((record) => {
                    const deduction = deductionsResult.data.records.find(
                      (item) => item.sessionId === record.sessionId && item.studentId === record.studentId,
                    );
                    return (
                      <tr key={record.id}>
                        <td className="px-5 py-4">{formatLocalDate(new Date(record.sessionStartAt), timeZone)}</td>
                        <td className="px-5 py-4 font-medium">{record.studentName}</td>
                        <td className="px-5 py-4">{record.status === "PRESENT" ? "Present" : record.status === "LEAVE" ? "Leave" : "Absent"}</td>
                        <td className="px-5 py-4">{deduction ? `$${(deduction.amountCents / 100).toFixed(2)}` : "No deduction"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="progress" className="space-y-4">
          <SectionHeading title="Progress" description="What each student worked on, session by session." />
          {studentsResult.ok && <ProgressForm courseId={id} students={studentsResult.data.students} sessions={startedSessions} />}
          {!progressResult.ok ? (
            <ErrorAlert message={progressResult.error.message} />
          ) : progressResult.data.records.length === 0 ? (
            <EmptyState title="No progress records yet" description="Saved records appear here and are visible to the student (except your private note)." />
          ) : (
            <ul className="space-y-3">
              {progressResult.data.records.map((record) => (
                <li key={record.id} className="kora-card space-y-2 p-5" data-testid="progress-record">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{record.studentName}</p>
                    <span className="text-sm text-muted-foreground">{formatLocalDate(new Date(record.sessionStartAt), timeZone)}</span>
                  </div>
                  <p className="text-sm"><span className="text-muted-foreground">Goal: </span>{record.goal}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Produced: </span>{record.output}</p>
                  {record.issue && <p className="text-sm"><span className="text-muted-foreground">Difficulty: </span>{record.issue}</p>}
                  <p className="text-sm"><span className="text-muted-foreground">Next step: </span>{NEXT_ACTION_LABELS[record.nextAction]}</p>
                  {record.note && <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm"><span className="text-muted-foreground">Private note: </span>{record.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
