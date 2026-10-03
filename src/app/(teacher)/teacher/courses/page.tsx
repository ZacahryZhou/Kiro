import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CreateCourseDialog } from "@/components/teacher-course-forms";
import { requireRole } from "@/lib/auth/actor";
import { listMyCourses } from "@/services/read";

const courseTypeLabels = {
  ONE_ON_ONE: "One-to-one",
  SMALL_CLASS: "Small class",
} as const;

export default async function Page() {
  const actor = await requireRole("TEACHER");
  const result = await listMyCourses(actor);

  return (
    <section className="space-y-6">
      <Link href="/teacher" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        ← Back to schedule
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Teacher Workspace</p>
          <h1 className="text-3xl font-semibold tracking-tight">Your courses</h1>
          <p className="mt-2 text-muted-foreground">Create a course, enroll existing students, and set up a schedule.</p>
        </div>
        <CreateCourseDialog />
      </header>

      {!result.ok ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {result.error.message}
        </div>
      ) : result.data.courses.length === 0 ? (
        <div className="rounded-2xl border bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-medium">No courses yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Create your first course to enroll students and schedule sessions.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {result.data.courses.length} {result.data.courses.length === 1 ? "course" : "courses"}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {result.data.courses.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/teacher/courses/${course.id}`}
                  className="block h-full rounded-xl border bg-white p-5 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{course.name}</h2>
                    <Badge variant="outline">{courseTypeLabels[course.type]}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{course.subject}</p>
                  <p className="mt-4 text-sm">
                    {course.studentCount} {course.studentCount === 1 ? "student" : "students"}
                  </p>
                  {course.location && <p className="mt-1 text-sm text-muted-foreground">{course.location}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
