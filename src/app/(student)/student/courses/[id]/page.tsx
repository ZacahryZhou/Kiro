import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/actor";
import { getCourseMaterials, listMyCourses } from "@/services/read";

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
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        {coursesResult.error.message}
      </div>
    );
  }

  const course = coursesResult.data.courses.find((item) => item.id === id);
  if (!course) notFound();

  const materialsResult = await getCourseMaterials(actor, { courseId: id });
  return (
    <section className="space-y-6">
      <Link href="/student" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        ← Back to learning
      </Link>
      <header>
        <p className="mb-2 text-sm font-medium text-muted-foreground">Course materials</p>
        <h1 className="text-3xl font-semibold tracking-tight">{course.name}</h1>
        <p className="mt-2 text-muted-foreground">{course.subject} · Teacher: {course.teacherName}</p>
      </header>

      {!materialsResult.ok ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {materialsResult.error.message}
        </div>
      ) : materialsResult.data.units.length === 0 ? (
        <div className="rounded-2xl border bg-white px-6 py-10 text-center">
          <h2 className="font-medium">No materials have been added yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your teacher&apos;s lesson materials will appear here.</p>
        </div>
      ) : (
        <ol className="space-y-4">
          {materialsResult.data.units.map((unit) => (
            <li key={unit.id} className="space-y-4 rounded-xl border bg-white p-5 sm:p-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit {unit.order}</p>
                <h2 className="mt-1 text-xl font-semibold">{unit.title}</h2>
              </div>
              {unit.materials.length === 0 ? (
                <p className="text-sm text-muted-foreground">No materials in this unit yet.</p>
              ) : (
                <ul className="space-y-4">
                  {unit.materials.map((material) => {
                    const url = safeExternalUrl(material.url);
                    return (
                    <li key={material.id} className="rounded-lg border bg-slate-50 p-4">
                      <h3 className="font-medium">{material.title}</h3>
                      {material.kind === "TEXT" ? (
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{material.content}</div>
                      ) : url ? (
                        <a
                          className="mt-3 inline-block break-all text-sm font-medium text-primary underline underline-offset-4"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open learning resource
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
    </section>
  );
}
