"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Check, History, MessageSquarePlus, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { Citation, ProposalView, Role } from "@/contracts";
import { labels } from "@/lib/ai/domain/edu/labels";
import { MessageList, type PanelMessage } from "./MessageList";

type ChatSummary = { id: string; title: string; updatedAt: string; hasPending: boolean };
type ServerMessage = { id: string; role: "user" | "assistant"; content: string; citations?: Citation[]; proposals?: ProposalView[] };

const MAX_INPUT = 2000;

function when(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * The assistant: a list of the user's chats on the left and one chat on the right. Each chat is its
 * own context. The server reads the chat's history itself, so only the message and the chat id are sent.
 */
export function ChatWorkspace({
  role,
  variant,
  initialChatId,
  onChatChange,
  course,
}: {
  role: Role;
  variant: "modal" | "inline";
  initialChatId?: string | null;
  onChatChange?: (id: string | null) => void;
  /** Set for the assistant on a course page: its chats belong to that course and the tools are limited to it. */
  course?: { id: string; name: string };
}) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [opening, setOpening] = useState(Boolean(initialChatId));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const nextId = useRef(1);
  const openToken = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const toPanel = useCallback(
    (items: ServerMessage[]): PanelMessage[] => items.map((m) => ({ id: nextId.current++, role: m.role, content: m.content, citations: m.citations, proposals: m.proposals })),
    [],
  );

  const courseId = course?.id;
  const listUrl = courseId ? `/api/ai/conversations?courseId=${encodeURIComponent(courseId)}` : "/api/ai/conversations";

  const loadList = useCallback(async () => {
    try {
      const response = await fetch(listUrl);
      if (!response.ok) throw new Error("list");
      const body = (await response.json()) as { conversations: ChatSummary[] };
      setChats(body.conversations);
      setListState("ready");
    } catch {
      setListState("error");
    }
  }, [listUrl]);

  const openChat = useCallback(
    async (id: string) => {
      const token = ++openToken.current;
      setOpening(true);
      setNotice(null);
      setShowHistory(false);
      try {
        const response = await fetch(`/api/ai/conversations/${id}`);
        if (token !== openToken.current) return;
        if (!response.ok) {
          setActiveId(null);
          setMessages([]);
          onChatChange?.(null);
          setNotice(labels.chat.notFound);
          void loadList();
          return;
        }
        const body = (await response.json()) as { messages: ServerMessage[] };
        setActiveId(id);
        setMessages(toPanel(body.messages));
        onChatChange?.(id);
      } catch {
        if (token === openToken.current) setNotice(labels.failure);
      } finally {
        if (token === openToken.current) setOpening(false);
      }
    },
    [loadList, onChatChange, toPanel],
  );

  // On mount: load the chat list, and reopen the chat that was open last time (if any).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(listUrl);
        if (!response.ok) throw new Error("list");
        const body = (await response.json()) as { conversations: ChatSummary[] };
        if (!cancelled) {
          setChats(body.conversations);
          setListState("ready");
        }
      } catch {
        if (!cancelled) setListState("error");
      }
      if (!initialChatId) return;
      try {
        const response = await fetch(`/api/ai/conversations/${initialChatId}`);
        if (cancelled) return;
        if (response.ok) {
          const body = (await response.json()) as { messages: ServerMessage[] };
          setActiveId(initialChatId);
          setMessages(toPanel(body.messages));
        } else {
          onChatChange?.(null);
          setNotice(labels.chat.notFound);
        }
      } catch {
        if (!cancelled) setNotice(labels.failure);
      } finally {
        if (!cancelled) setOpening(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only on mount: the parent remembers the last open chat for the next time the assistant opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function newChat() {
    openToken.current += 1;
    setActiveId(null);
    setMessages([]);
    setNotice(null);
    setOpening(false);
    setShowHistory(false);
    onChatChange?.(null);
    inputRef.current?.focus();
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { id: nextId.current++, role: "user", content: text }]);
    setInput("");
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, ...(activeId ? { conversationId: activeId } : courseId ? { courseId } : {}) }),
      });
      const body = await response.json();
      if (response.status === 404 && activeId) {
        setNotice(labels.chat.notFound);
        setActiveId(null);
        onChatChange?.(null);
        void loadList();
        return;
      }
      const reply: string = response.ok ? body.reply : (body.error?.message ?? labels.failure);
      setMessages((m) => [...m, { id: nextId.current++, role: "assistant", content: reply, proposals: body.proposals, citations: body.citations }]);
      if (response.ok && body.conversationId) {
        const id = body.conversationId as string;
        if (id !== activeId) {
          setActiveId(id);
          onChatChange?.(id);
        }
        const now = new Date().toISOString();
        setChats((list) => [{ id, title: body.title ?? text.slice(0, 60), updatedAt: now, hasPending: Array.isArray(body.proposals) && body.proposals.length > 0 || (list.find((c) => c.id === id)?.hasPending ?? false) }, ...list.filter((c) => c.id !== id)]);
      }
    } catch {
      setMessages((m) => [...m, { id: nextId.current++, role: "assistant", content: labels.failure }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  async function saveRename() {
    if (!renaming) return;
    const title = renaming.text.trim();
    const { id } = renaming;
    setRenaming(null);
    if (!title) return;
    setChats((list) => list.map((c) => (c.id === id ? { ...c, title } : c)));
    const response = await fetch(`/api/ai/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    if (!response.ok) void loadList();
  }

  async function removeChat(chat: ChatSummary) {
    if (!window.confirm(labels.chat.deleteConfirm)) return;
    setChats((list) => list.filter((c) => c.id !== chat.id));
    if (chat.id === activeId) newChat();
    const response = await fetch(`/api/ai/conversations/${chat.id}`, { method: "DELETE" });
    if (!response.ok) void loadList();
  }

  const suggestions = course ? (role === "TEACHER" ? labels.courseChat.teacherSuggestions : labels.courseChat.studentSuggestions) : role === "TEACHER" ? labels.teacherSuggestions : labels.studentSuggestions;
  const emptyText = course ? (role === "TEACHER" ? labels.courseChat.emptyTeacher(course.name) : labels.courseChat.emptyStudent(course.name)) : role === "TEACHER" ? labels.chat.emptyTeacher : labels.chat.emptyStudent;
  const productName = course ? (role === "TEACHER" ? labels.courseChat.teacherTitle : labels.courseChat.studentTitle) : labels.title;
  const modal = variant === "modal";

  const sidebar = (
    <aside aria-label={labels.chat.history} className={`flex min-h-0 w-full flex-col border-r bg-muted/30 md:w-64 md:shrink-0 ${showHistory ? "flex" : "hidden md:flex"}`} data-testid="chat-history">
      <div className="flex items-center justify-between gap-2 p-3">
        <h3 className="text-sm font-semibold">{labels.chat.history}</h3>
        <button type="button" onClick={newChat} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="new-chat">
          <MessageSquarePlus className="size-3.5" aria-hidden />{labels.chat.newChat}
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {listState === "loading" && <li className="px-2 py-3 text-xs text-muted-foreground">{labels.chat.loadingChats}</li>}
        {listState === "error" && <li className="px-2 py-3 text-xs text-destructive">{labels.chat.historyFailed}</li>}
        {listState === "ready" && chats.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">{labels.chat.noChats}</li>}
        {chats.map((chat) => (
          <li key={chat.id} className={`group relative rounded-lg ${chat.id === activeId ? "bg-primary/10" : "hover:bg-muted"}`} data-testid="chat-item" data-active={chat.id === activeId}>
            {renaming?.id === chat.id ? (
              <form onSubmit={(e) => { e.preventDefault(); void saveRename(); }} className="flex items-center gap-1 p-1.5">
                <input autoFocus value={renaming.text} onChange={(e) => setRenaming({ id: chat.id, text: e.target.value })} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }} maxLength={80} aria-label="Chat title" className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <button type="submit" aria-label="Save title" className="flex size-7 items-center justify-center rounded-md hover:bg-muted"><Check className="size-3.5" aria-hidden /></button>
              </form>
            ) : (
              <>
                <button type="button" onClick={() => void openChat(chat.id)} className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 pr-14 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-current={chat.id === activeId ? "true" : undefined}>
                  <span className="line-clamp-2 text-sm font-medium leading-snug">{chat.title}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {when(chat.updatedAt)}
                    {chat.hasPending && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-px font-medium text-amber-900" data-testid="chat-pending"><span className="size-1.5 rounded-full bg-amber-500" aria-hidden />{labels.chat.waiting}</span>}
                  </span>
                </button>
                <div className="absolute right-1 top-1.5 flex gap-0.5 opacity-100 md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                  <button type="button" aria-label={`${labels.chat.rename} ${chat.title}`} onClick={() => setRenaming({ id: chat.id, text: chat.title })} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"><Pencil className="size-3" aria-hidden /></button>
                  <button type="button" aria-label={`${labels.chat.delete} ${chat.title}`} onClick={() => void removeChat(chat)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3" aria-hidden /></button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );

  const activeTitle = chats.find((c) => c.id === activeId)?.title ?? labels.chat.newChat;

  return (
    <section aria-label={productName} className={`flex min-h-0 w-full overflow-hidden bg-card ${modal ? "h-full" : "h-[min(34rem,75dvh)] rounded-2xl border"}`} data-testid="chat-workspace">
      {sidebar}
      <div className={`min-h-0 min-w-0 flex-1 flex-col ${showHistory ? "hidden md:flex" : "flex"}`}>
        <header className={`flex shrink-0 items-center gap-2 border-b px-3 py-2.5 ${modal ? "pr-12" : ""}`}>
          <button type="button" onClick={() => setShowHistory(true)} aria-label={labels.chat.history} className="flex size-8 items-center justify-center rounded-lg border hover:bg-muted md:hidden"><History className="size-4" aria-hidden /></button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold" data-testid="chat-title">{activeTitle}</h2>
            <p className="truncate text-xs text-muted-foreground">{productName}</p>
          </div>
          <button type="button" onClick={newChat} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted md:hidden"><MessageSquarePlus className="size-3.5" aria-hidden />{labels.chat.newChat}</button>
        </header>

        {notice && <p role="status" className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">{notice}</p>}

        {opening ? (
          <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground" role="status">{labels.chat.loadingChat}</p>
        ) : messages.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-5 text-center" data-testid="suggestions">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="size-5" aria-hidden /></span>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">{course ? `Ask about ${course.name}` : labels.chat.emptyTitle}</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{emptyText}</p>
            </div>
            <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {suggestions.map((text) => (
                <button key={text} type="button" onClick={() => { setInput(text); inputRef.current?.focus(); }} className="rounded-xl border bg-muted/40 px-3 py-2.5 text-left text-sm transition-colors hover:border-foreground/20 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="suggestion">{text}</button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={messages} busy={busy} />
        )}

        <form onSubmit={send} className="shrink-0 border-t p-3">
          <div className="flex items-end gap-2">
            <label htmlFor={`ai-input-${variant}${courseId ? `-${courseId}` : ""}`} className="sr-only">{labels.inputLabel}</label>
            <textarea
              id={`ai-input-${variant}${courseId ? `-${courseId}` : ""}`}
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={Math.min(5, Math.max(1, input.split("\n").length))}
              maxLength={MAX_INPUT}
              placeholder={labels.inputPlaceholder}
              autoComplete="off"
              className="min-h-10 flex-1 resize-none rounded-xl border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button type="submit" disabled={busy || input.trim() === ""} className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-50">{labels.send}</button>
          </div>
          <p className="mt-1.5 flex justify-between px-1 text-[11px] text-muted-foreground"><span>{labels.chat.inputHint}{modal ? ` · ${labels.chat.closeHint}` : ""}</span>{input.length > MAX_INPUT * 0.8 && <span>{input.length}/{MAX_INPUT}</span>}</p>
        </form>
      </div>
    </section>
  );
}
