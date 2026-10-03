"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Role } from "@/contracts";
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
    <section aria-label={labels.title} className="flex h-[32rem] w-full max-w-md flex-col rounded-xl border bg-background">
      <header className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{labels.title}</h2>
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">{role === "TEACHER" ? labels.teacherHint : labels.studentHint}</p>
        ) : null}
      </header>
      <MessageList messages={messages} busy={busy} />
      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <label htmlFor="ai-input" className="sr-only">
          {labels.inputLabel}
        </label>
        <Input
          id="ai-input"
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
