"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { Role } from "@/contracts";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { labels } from "@/lib/ai/domain/edu/labels";
import { ChatWorkspace } from "./ChatWorkspace";

/**
 * Floating button that opens the assistant as a centred pop-up with the user's chat history.
 * Ctrl+K (or Cmd+K) opens it from anywhere. Reopening returns to the chat that was open.
 */
export function AiLauncher({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [lastChatId, setLastChatId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  // How many prepared changes still wait for a decision (a badge on the button). It is only a convenience.
  const countPending = useCallback(async (): Promise<number | undefined> => {
    try {
      const response = await fetch("/api/ai/proposals?status=pending");
      if (!response.ok) return undefined;
      return ((await response.json()) as { proposals?: unknown[] }).proposals?.length ?? 0;
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void countPending().then((count) => {
      if (!cancelled && count !== undefined) setPending(count);
    });
    return () => {
      cancelled = true;
    };
  }, [countPending]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) void countPending().then((count) => count !== undefined && setPending(count));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="Ctrl+K"
        className="fixed bottom-4 right-4 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
        data-testid="ai-launcher"
      >
        <Sparkles className="size-4" aria-hidden />
        Ask Kora AI
        <span className="sr-only"> ({labels.title})</span>
        {pending > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white" aria-label={`${pending} changes waiting for your decision`} data-testid="ai-pending-badge">{pending}</span>
        )}
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(46rem,calc(100vh-2rem))] w-[min(62rem,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none" data-testid="ai-dialog">
          <DialogTitle className="sr-only">{labels.title}</DialogTitle>
          <DialogDescription className="sr-only">Chat with the assistant. Your earlier chats are listed on the left.</DialogDescription>
          <ChatWorkspace role={role} variant="modal" initialChatId={lastChatId} onChatChange={setLastChatId} />
        </DialogContent>
      </Dialog>
    </>
  );
}
