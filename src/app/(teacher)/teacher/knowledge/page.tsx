import { KnowledgeManager } from "@/components/knowledge-manager";
import { ErrorAlert, PageHeader } from "@/components/page";
import { requireRole } from "@/lib/auth/actor";
import { listMyKnowledge } from "@/services/knowledge";
import { listMyCourses } from "@/services/read";

export default async function Page() {
  const actor = await requireRole("TEACHER");
  const [notes, courses] = await Promise.all([listMyKnowledge(actor), listMyCourses(actor)]);
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
        <KnowledgeManager entries={notes.data.entries} courses={courses.data.courses.map((c) => ({ id: c.id, name: c.name }))} />
      )}
    </section>
  );
}
