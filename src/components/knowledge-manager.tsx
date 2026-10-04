"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KNOWLEDGE_KINDS, type KnowledgeKind, type KnowledgeView } from "@/contracts";
import { deleteKnowledgeAction, saveKnowledgeAction } from "@/app/(teacher)/teacher/knowledge/actions";

const KIND_LABEL: Record<KnowledgeKind, string> = { LESSON_SUMMARY: "Lesson summary", KNOWLEDGE_POINT: "Key point", COMMON_MISTAKE: "Common mistake", EXAMPLE: "Example", FAQ: "FAQ", TEACHING_STYLE: "Teaching style" };
const KIND_HINT: Record<KnowledgeKind, string> = {
  LESSON_SUMMARY: "What a lesson or unit covers, in a few sentences.",
  KNOWLEDGE_POINT: "One concept explained simply, the way you would say it.",
  COMMON_MISTAKE: "A mistake students often make and how to avoid it.",
  EXAMPLE: "A worked example with the steps.",
  FAQ: "A question students ask, with your answer.",
  TEACHING_STYLE: "How you like to explain: tone, order, what to start with.",
};
const KIND_STYLE: Record<KnowledgeKind, string> = {
  LESSON_SUMMARY: "bg-sky-100 text-sky-900",
  KNOWLEDGE_POINT: "bg-emerald-100 text-emerald-900",
  COMMON_MISTAKE: "bg-rose-100 text-rose-900",
  EXAMPLE: "bg-amber-100 text-amber-900",
  FAQ: "bg-violet-100 text-violet-900",
  TEACHING_STYLE: "bg-zinc-200 text-zinc-800",
};
const MAX = 4000;
const field = "mt-1.5 block w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const btn = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const btnPrimary = "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

type Draft = { id?: string; courseId: string; kind: KnowledgeKind; title: string; content: string };
const blank = (courseId = ""): Draft => ({ courseId, kind: "KNOWLEDGE_POINT", title: "", content: "" });

export function KnowledgeManager({ entries, courses }: { entries: KnowledgeView[]; courses: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<string>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const visible = useMemo(() => entries.filter((e) => filter === "all" || (filter === "none" ? !e.courseId : e.courseId === filter || !e.courseId)), [entries, filter]);
  const grouped = KNOWLEDGE_KINDS.map((kind) => [kind, visible.filter((e) => e.kind === kind)] as const).filter(([, list]) => list.length > 0);

  function save() {
    if (!draft) return;
    startTransition(async () => {
      const result = await saveKnowledgeAction({ ...(draft.id ? { id: draft.id } : {}), ...(draft.courseId ? { courseId: draft.courseId } : {}), kind: draft.kind, title: draft.title, content: draft.content });
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setDraft(null);
        router.refresh();
      }
    });
  }
  function remove(entry: KnowledgeView) {
    if (!window.confirm(`Delete the note “${entry.title}”? Your students' tutor will no longer use it.`)) return;
    startTransition(async () => {
      const result = await deleteKnowledgeAction(entry.id);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-5" data-testid="knowledge-manager">
      <div className="kora-card flex items-start gap-3 p-4 text-sm">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="size-4" aria-hidden /></span>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Let the assistant do the typing.</span> Ask it, for example: “Create teaching notes from the materials of my math course” or “Add a common mistake for my math course: students forget to flip the sign when dividing by a negative.” You review everything before it is saved. <span className="font-medium text-foreground">Never put private details about a student here</span>: students and their tutor can read these notes.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by course">
          {[{ id: "all", name: "Everything" }, ...courses].map((c) => (
            <button key={c.id} type="button" onClick={() => setFilter(c.id)} aria-pressed={filter === c.id} className={`h-8 rounded-full px-3 text-sm font-medium transition-colors ${filter === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{c.name}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <p role="status" className={`text-sm ${message && !message.ok ? "text-destructive" : "text-muted-foreground"}`} data-testid="knowledge-status">{message?.text}</p>
          <button type="button" className={btnPrimary} onClick={() => { setDraft(blank(filter !== "all" && filter !== "none" ? filter : "")); setMessage(null); }} data-testid="add-note"><Plus className="size-4" aria-hidden />Add a note</button>
        </div>
      </div>

      {draft && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="kora-card space-y-4 p-5" data-testid="note-form">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Kind
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as KnowledgeKind })} className={`${field} h-10`} data-testid="note-kind">
                {KNOWLEDGE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">{KIND_HINT[draft.kind]}</span>
            </label>
            <label className="text-sm font-medium">
              Applies to
              <select value={draft.courseId} onChange={(e) => setDraft({ ...draft, courseId: e.target.value })} className={`${field} h-10`} data-testid="note-course">
                <option value="">All my courses</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium">
            Title
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} required className={`${field} h-10`} placeholder="e.g. Slope and steepness" data-testid="note-title" />
          </label>
          <label className="block text-sm font-medium">
            Note
            <textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} maxLength={MAX} required rows={6} className={`${field} py-2`} placeholder="Write it the way you would explain it to a student." data-testid="note-content" />
            <span className={`mt-1 block text-right text-xs font-normal ${draft.content.length > MAX * 0.9 ? "text-destructive" : "text-muted-foreground"}`}>{draft.content.length.toLocaleString("en-US")} / {MAX.toLocaleString("en-US")}</span>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={btn} onClick={() => setDraft(null)} disabled={pending}>Cancel</button>
            <button type="submit" className={btnPrimary} disabled={pending || !draft.title.trim() || !draft.content.trim()} data-testid="save-note">{pending ? "Saving…" : draft.id ? "Save changes" : "Save note"}</button>
          </div>
        </form>
      )}

      {entries.length === 0 && !draft ? (
        <div className="rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Lightbulb className="size-5" aria-hidden /></div>
          <h2 className="font-medium">No notes yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Add what you want your students&apos; tutor to teach. Until you do, it can only answer from your course materials.</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No notes for this course yet.</p>
      ) : (
        grouped.map(([kind, list]) => (
          <section key={kind} aria-label={KIND_LABEL[kind]} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><span className={`rounded-full px-2.5 py-0.5 text-xs ${KIND_STYLE[kind]}`}>{KIND_LABEL[kind]}</span><span className="text-xs font-normal text-muted-foreground">{list.length}</span></h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {list.map((entry) => (
                <li key={entry.id} className="kora-card space-y-2 p-4" data-testid="note-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold leading-snug">{entry.title}</h3>
                      <Badge variant="outline" className="mt-1">{entry.courseName ?? "All courses"}</Badge>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" aria-label={`Edit ${entry.title}`} onClick={() => { setDraft({ id: entry.id, courseId: entry.courseId ?? "", kind: entry.kind, title: entry.title, content: entry.content }); setMessage(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Pencil className="size-4" aria-hidden /></button>
                      <button type="button" aria-label={`Delete ${entry.title}`} onClick={() => remove(entry)} disabled={pending} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"><Trash2 className="size-4" aria-hidden /></button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{entry.content}</p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
