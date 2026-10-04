import Link from "next/link";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorAlert, Initial, PageHeader } from "@/components/page";
import { requireRole } from "@/lib/auth/actor";
import { loadRoster } from "@/lib/teacher-students";
import { listAttendance } from "@/services/read";

export default async function Page() {
  const actor = await requireRole("TEACHER");
  const [roster, attendance] = await Promise.all([loadRoster(actor), listAttendance(actor, {})]);
  const counts = new Map<string, { present: number; leave: number; absent: number }>();
  if (attendance.ok) {
    for (const record of attendance.data.records) {
      const row = counts.get(record.studentId) ?? { present: 0, leave: 0, absent: 0 };
      if (record.status === "PRESENT") row.present += 1;
      else if (record.status === "LEAVE") row.leave += 1;
      else row.absent += 1;
      counts.set(record.studentId, row);
    }
  }
  return (
    <section className="space-y-8">
      <PageHeader eyebrow="Teacher Workspace" title="Students" description="Everyone enrolled in your courses. Open a student to see their attendance, progress and requests." />
      {!roster.ok ? (
        <ErrorAlert message={roster.message} />
      ) : roster.students.length === 0 ? (
        <EmptyState icon={Users} title="No students yet" description="Add a registered student to a course to see them here." />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{roster.students.length} {roster.students.length === 1 ? "student" : "students"}</p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {roster.students.map((student) => {
              const row = counts.get(student.id) ?? { present: 0, leave: 0, absent: 0 };
              return (
                <li key={student.id}>
                  <Link href={`/teacher/students/${student.id}`} className="kora-card-link block h-full p-5" data-testid="student-card">
                    <div className="flex items-center gap-3">
                      <Initial name={student.name} className="size-10 text-sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{student.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{student.email}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {student.courses.map((course) => <Badge key={course.id} variant="outline">{course.name}</Badge>)}
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">
                      Attendance: {row.present} present · {row.leave} leave · {row.absent} absent
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
