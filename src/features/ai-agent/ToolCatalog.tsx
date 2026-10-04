"use client";

import { useState } from "react";
import { Eye, ShieldCheck, Wrench } from "lucide-react";
import { catalogFor, type CatalogEntry, type CatalogRole } from "@/lib/ai/domain/edu/tool-catalog";

const ROLES: { id: CatalogRole; label: string; blurb: string }[] = [
  { id: "TEACHER", label: "Teacher's agent", blurb: "Looks up anything about the teacher's own courses and students, and can prepare changes for the teacher to confirm." },
  { id: "STUDENT", label: "Student's agent", blurb: "Looks up the student's own data and teaches from the teacher's notes. The only change it can prepare is a leave or time request, sent after the student confirms." },
];

function Group({ icon, title, note, entries, tone }: { icon: React.ReactNode; title: string; note: string; entries: CatalogEntry[]; tone: string }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={`flex size-6 items-center justify-center rounded-md ${tone}`}>{icon}</span>{title} <span className="text-xs font-normal text-muted-foreground" data-testid="group-count">{entries.length}</span></h3>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {entries.map((entry) => (
          <li key={entry.tool} className="rounded-lg border bg-muted/30 px-3 py-2" data-testid="tool-item">
            <p className="text-sm font-medium">{entry.title}</p>
            <p className="text-xs leading-5 text-muted-foreground">{entry.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Everything the agents can do, in plain words, split into looking things up and preparing a change. Collapsed until opened. */
export function ToolCatalog() {
  const [role, setRole] = useState<CatalogRole>("TEACHER");
  const read = catalogFor(role, "read");
  const propose = catalogFor(role, "propose");
  const current = ROLES.find((r) => r.id === role)!;
  return (
    <details className="kora-card group p-4" data-testid="tool-catalog">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm font-semibold">
        <span className="flex items-center gap-2"><Wrench className="size-4" aria-hidden />What the agents can do</span>
        <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show all tools</span>
        <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <div className="mt-4 space-y-4">
        <div role="group" aria-label="Choose an agent" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {ROLES.map((item) => (
            <button key={item.id} type="button" onClick={() => setRole(item.id)} aria-pressed={role === item.id} className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${role === item.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{current.blurb}</p>
        <p className="text-xs text-muted-foreground" data-testid="catalog-total">{read.length + propose.length} tools: {read.length} read-only and {propose.length} that prepare a change.</p>
        <Group icon={<Eye className="size-3.5" aria-hidden />} tone="bg-sky-100 text-sky-900" title="Read-only" note="Look things up. These can never change anything." entries={read} />
        <Group icon={<ShieldCheck className="size-3.5" aria-hidden />} tone="bg-amber-100 text-amber-900" title="Prepare a change" note="Save a proposal and show a preview. Nothing changes until a person confirms." entries={propose} />
      </div>
    </details>
  );
}
