"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProposalView, Role } from "@/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { labels } from "@/lib/ai/domain/edu/labels";
import { MessageList, type PanelMessage } from "./MessageList";

const HISTORY_LIMIT = 10;

export function AiPanel({ role }: { role: Role }) {
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);

  // After a reload, bring back changes the assistant prepared earlier that still wait for a decision.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/ai/proposals?status=pending");
        if (!response.ok) return;
        const body = (await response.json()) as { proposals?: ProposalView[] };
        const pending = body.proposals ?? [];
        if (cancelled || pending.length === 0) return;
        setMessages((m) =>
          m.length > 0
            ? m
            : [{ id: nextId.current++, role: "assistant", content: labels.pendingRestored(pending.length), proposals: pending }],
        );
      } catch {
        // Restoring is a convenience; the panel works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    // Only recent plain text goes back to the server; identity is never sent.
    const history = messages.slice(-HISTORY_LIMIT).map(({ role: r, content }) => ({ role: r, content }));
    setMessages((m) => [...m, { id: nextId.current++, role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const body = await response.json();
      const reply: string = response.ok ? body.reply : (body.error?.message ?? labels.failure);
      setMessages((m) => [
        ...m,
        { id: nextId.current++, role: "assistant", content: reply, proposals: body.proposals, citations: body.citations },
      ]);
    } catch {
      setMessages((m) => [...m, { id: nextId.current++, role: "assistant", content: labels.failure }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={labels.title} className="flex h-[min(32rem,calc(100vh-7rem))] w-full max-w-md flex-col rounded-2xl border bg-card">
      <header className="border-b bg-muted/40 px-4 py-3">
        <h2 className="text-sm font-semibold">{labels.title}</h2>
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">{role === "TEACHER" ? labels.teacherHint : labels.studentHint}</p>
        ) : null}
      </header>
      {messages.length === 0 ? (
        <div className="flex-1 space-y-2 overflow-y-auto p-3" data-testid="suggestions">
          {(role === "TEACHER" ? labels.teacherSuggestions : labels.studentSuggestions).map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => {
                setInput(text);
                inputRef.current?.focus();
              }}
              className="block w-full rounded-xl border bg-muted/40 px-3 py-2.5 text-left text-sm transition-colors hover:border-foreground/20 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="suggestion"
            >
              {text}
            </button>
          ))}
          <p className="px-1 pt-1 text-xs text-muted-foreground">Click an example to put it in the box, edit it, then press Send.</p>
        </div>
      ) : (
        <MessageList messages={messages} busy={busy} />
      )}
      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <label htmlFor="ai-input" className="sr-only">
          {labels.inputLabel}
        </label>
        <Input
          id="ai-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={labels.inputPlaceholder}
          maxLength={2000}
          disabled={busy}
          autoComplete="off"
        />
        <Button type="submit" disabled={busy || input.trim() === ""}>
          {labels.send}
        </Button>
      </form>
    </section>
  );
}
