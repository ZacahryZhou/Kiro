import Link from "next/link";
import { BookOpen, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorAlert, PageHeader } from "@/components/page";
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
    <section className="space-y-8">
      <PageHeader
        back={{ href: "/teacher/schedule", label: "Back to schedule" }}
        eyebrow="Teacher Workspace"
        title="Your courses"
        description="Create a course, enroll existing students, and set up a schedule."
        actions={<CreateCourseDialog />}
      />

      {!result.ok ? (
        <ErrorAlert message={result.error.message} />
      ) : result.data.courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="No courses yet" description="Create your first course to enroll students and schedule sessions." />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {result.data.courses.length} {result.data.courses.length === 1 ? "course" : "courses"}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.data.courses.map((course) => (
              <li key={course.id}>
                <Link href={`/teacher/courses/${course.id}`} className="kora-card-link block h-full p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <BookOpen className="size-5" aria-hidden />
                    </span>
                    <Badge variant="outline">{courseTypeLabels[course.type]}</Badge>
                  </div>
                  <h2 className="mt-4 font-semibold">{course.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{course.subject}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-3.5" aria-hidden />
                      {course.studentCount} {course.studentCount === 1 ? "student" : "students"}
                    </span>
                    {course.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3.5" aria-hidden />
                        {course.location}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
