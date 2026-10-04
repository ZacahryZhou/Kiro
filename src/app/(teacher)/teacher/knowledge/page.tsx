import { KnowledgeManager } from "@/components/knowledge-manager";
import { KnowledgeUpload } from "@/components/knowledge-upload";
import { ErrorAlert, PageHeader } from "@/components/page";
import { requireRole } from "@/lib/auth/actor";
import { listMyKnowledge } from "@/services/knowledge";
import { getCourseMaterials, listMyCourses } from "@/services/read";

export default async function Page() {
  const actor = await requireRole("TEACHER");
  const [notes, courses] = await Promise.all([listMyKnowledge(actor), listMyCourses(actor)]);
  // The units of each course, so a file can be filed under one of them.
  const targets = courses.ok
    ? await Promise.all(
        courses.data.courses.map(async (course) => {
          const materials = await getCourseMaterials(actor, { courseId: course.id });
          return { id: course.id, name: course.name, units: materials.ok ? materials.data.units.map((unit) => ({ id: unit.id, title: unit.title })) : [] };
        }),
      )
    : [];
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Teacher workspace"
        title="Teaching knowledge"
        description="What your students' AI tutor knows and teaches from: lesson summaries, key points, common mistakes, examples, FAQs and how you like to explain. Students can read these notes too."
      />
      {!notes.ok ? (
        <ErrorAlert message={notes.error.message} />
      ) : !courses.ok ? (
        <ErrorAlert message={courses.error.message} />
      ) : (
        <>
          <KnowledgeUpload courses={targets} />
          <KnowledgeManager entries={notes.data.entries} courses={courses.data.courses.map((c) => ({ id: c.id, name: c.name }))} />
        </>
      )}
    </section>
  );
}
