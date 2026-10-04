"use client";

import { Sparkles } from "lucide-react";
import type { Role } from "@/contracts";
import { labels } from "@/lib/ai/domain/edu/labels";
import { AiPanel } from "./AiPanel";

/** A card with the assistant for one course. It is its own entry, separate from the general "Ask Kiro AI" pop-up. */
export function CourseAssistant({ role, courseId, courseName }: { role: Role; courseId: string; courseName: string }) {
  const title = role === "TEACHER" ? labels.courseChat.teacherTitle : labels.courseChat.studentTitle;
  return (
    <section aria-label={title} className="kora-card space-y-3 p-4 sm:p-5" data-testid="course-assistant">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden><Sparkles className="size-5" /></span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{role === "TEACHER" ? "Assistant for this course" : "Ask about this course"}</p>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
        </div>
      </div>
      <AiPanel role={role} course={{ id: courseId, name: courseName }} />
    </section>
  );
}
