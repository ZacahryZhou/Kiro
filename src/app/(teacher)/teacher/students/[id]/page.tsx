import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorAlert, Initial, PageHeader, SectionHeading, StatCard } from "@/components/page";
import { CalendarCheck, Receipt, UserX } from "lucide-react";
import { requireRole } from "@/lib/auth/actor";
import { NEXT_ACTION_LABELS } from "@/lib/progress";
import { loadRoster } from "@/lib/teacher-students";
import { formatLocalDate } from "@/lib/time";
import { listAttendance, listDeductions, listProgressRecords, listStudentRequests } from "@/services/read";

const statusText = { PRESENT: "Present", LEAVE: "Leave", ABSENT: "Absent" } as const;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("TEACHER");
  const { id } = await params;
  const roster = await loadRoster(actor);
  if (!roster.ok) return <ErrorAlert message={roster.message} />;
  const student = roster.students.find((item) => item.id === id);
  if (!student) notFound(); // students outside the teacher's own courses are indistinguishable from missing ones

  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const [attendance, deductions, progress, requests] = await Promise.all([
    listAttendance(actor, { studentId: id }),
    listDeductions(actor, { studentId: id }),
    listProgressRecords(actor, { studentId: id }),
    listStudentRequests(actor, {}),
  ]);
  const records = attendance.ok ? attendance.data.records : [];
  const present = records.filter((r) => r.status === "PRESENT").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const deducted = deductions.ok ? deductions.data.records.reduce((sum, r) => sum + r.amountCents, 0) : 0;
  const studentRequests = requests.ok ? requests.data.requests.filter((r) => r.studentId === id) : [];

  return (
    <section className="space-y-8">
      <PageHeader back={{ href: "/teacher/students", label: "Back to students" }} eyebrow="Student" title={student.name} description={student.email} actions={<Initial name={student.name} className="size-12 text-lg" />} />
      <div className="flex flex-wrap gap-1.5">
        {student.courses.map((course) => <Badge key={course.id} variant="outline">{course.name}</Badge>)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard icon={CalendarCheck} label="Present" value={present} hint={`${records.length} recorded`} />
        <StatCard icon={UserX} label="Absent" value={absent} />
        <StatCard icon={Receipt} label="Deducted" value={`$${(deducted / 100).toFixed(2)}`} hint="Total lesson deductions" />
      </div>

      <div className="space-y-3">
        <SectionHeading title="Attendance" />
        {!attendance.ok ? <ErrorAlert message={attendance.error.message} /> : records.length === 0 ? (
          <EmptyState title="No attendance records yet" />
        ) : (
          <div className="kora-card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Status</th></tr></thead>
              <tbody className="divide-y">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-5 py-3">{formatLocalDate(new Date(record.sessionStartAt), timeZone)}</td>
                    <td className="px-5 py-3"><Badge variant={record.status === "ABSENT" ? "destructive" : record.status === "PRESENT" ? "secondary" : "outline"}>{statusText[record.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <SectionHeading title="Progress" />
        {!progress.ok ? <ErrorAlert message={progress.error.message} /> : progress.data.records.length === 0 ? (
          <EmptyState title="No progress records yet" description="Record progress from a course page." />
        ) : (
          <ul className="space-y-3">
            {progress.data.records.map((record) => (
              <li key={record.id} className="kora-card space-y-1.5 p-5">
                <p className="text-sm text-muted-foreground">{record.courseName} · {formatLocalDate(new Date(record.sessionStartAt), timeZone)}</p>
                <p className="text-sm"><span className="text-muted-foreground">Goal: </span>{record.goal}</p>
                <p className="text-sm"><span className="text-muted-foreground">Produced: </span>{record.output}</p>
                {record.issue && <p className="text-sm"><span className="text-muted-foreground">Difficulty: </span>{record.issue}</p>}
                <p className="text-sm"><span className="text-muted-foreground">Next step: </span>{NEXT_ACTION_LABELS[record.nextAction]}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {studentRequests.length > 0 && (
        <div className="space-y-3">
          <SectionHeading title="Requests" description="Answer them on the Requests page." />
          <ul className="kora-card divide-y overflow-hidden">
            {studentRequests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span>{request.kind === "LEAVE" ? "Leave" : "Different time"} · {request.courseName} · {formatLocalDate(new Date(request.sessionStartAt), timeZone)}</span>
                <Badge variant={request.status === "PENDING" ? "outline" : request.status === "APPROVED" ? "secondary" : "destructive"}>{request.status === "PENDING" ? "Pending" : request.status === "APPROVED" ? "Approved" : "Declined"}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
