"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { Role } from "@/contracts";
import { labels } from "@/lib/ai/domain/edu/labels";
import { AiPanel } from "./AiPanel";

/**
 * Floating button that opens the assistant. The panel stays mounted while closed,
 * so the conversation and any pending proposal cards survive closing and reopening.
 */
export function AiLauncher({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      <div
        id="ai-panel-container"
        hidden={!open}
        className="max-h-[calc(100vh-6rem)] w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/5 animate-in fade-in slide-in-from-bottom-2 duration-200"
      >
        <AiPanel role={role} />
      </div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="ai-panel-container"
        className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {open ? <X className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
        {open ? "Close assistant" : "Ask Kora AI"}
        <span className="sr-only"> ({labels.title})</span>
      </button>
    </div>
  );
}
