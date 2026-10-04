import { Lightbulb, MessageCircleQuestion } from "lucide-react";
import type { StudentKnowledgeView } from "@/contracts";

const KIND_LABEL = { LESSON_SUMMARY: "Lesson summary", KNOWLEDGE_POINT: "Key point", COMMON_MISTAKE: "Common mistake", EXAMPLE: "Example", FAQ: "FAQ", TEACHING_STYLE: "Teaching style" } as const;
const KIND_STYLE = { LESSON_SUMMARY: "bg-sky-100 text-sky-900", KNOWLEDGE_POINT: "bg-emerald-100 text-emerald-900", COMMON_MISTAKE: "bg-rose-100 text-rose-900", EXAMPLE: "bg-amber-100 text-amber-900", FAQ: "bg-violet-100 text-violet-900", TEACHING_STYLE: "bg-zinc-200 text-zinc-800" } as const;

const ORDER = ['LESSON_SUMMARY', 'KNOWLEDGE_POINT', 'EXAMPLE', 'COMMON_MISTAKE', 'FAQ', 'TEACHING_STYLE'] as const;

/** Study notes written by the teacher. The same notes are what the AI tutor teaches from. */
export function StudentNotes({ notes, teacherName }: { notes: StudentKnowledgeView[]; teacherName: string }) {
  if (notes.length === 0) return null;
  const sorted = [...notes].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.title.localeCompare(b.title));
  return (
    <section aria-label="Your teacher's notes" className="kora-card space-y-4 p-5 sm:p-6" data-testid="student-notes">
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden><Lightbulb className="size-5" /></span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Study notes</p>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">What {teacherName} wants you to remember</h2>
        </div>
      </div>
      <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>Stuck? Open the AI assistant and ask it to explain a topic. It teaches from these notes and your course materials, and shows where its answer came from.</span>
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {sorted.map((note) => (
          <li key={note.id} className="rounded-xl border bg-muted/30 p-4" data-testid="student-note">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLE[note.kind]}`}>{KIND_LABEL[note.kind]}</span>
            <h3 className="mt-2 font-semibold leading-snug">{note.title}</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{note.content}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
