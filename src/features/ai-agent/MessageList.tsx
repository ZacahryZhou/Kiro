"use client";

import { useEffect, useRef } from "react";
import { ImageIcon } from "lucide-react";
import type { Citation, ProposalView } from "@/contracts";
import { Badge } from "@/components/ui/badge";
import { labels } from "@/lib/ai/domain/edu/labels";
import { ProposalCard } from "./ProposalCard";

export type PanelMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  proposals?: ProposalView[];
  citations?: Citation[];
  /** Photos attached to a user message: a thumbnail while the chat is open, just the name after it is reopened. */
  attachments?: { name: string; thumb?: string }[];
};

export function MessageList({ messages, busy }: { messages: PanelMessage[]; busy: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the newest message in view by scrolling the list itself, never the page around it.
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, busy]);

  return (
    // min-h-0 lets the list shrink to the space left by the header and input, so it scrolls instead of growing.
    <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3" role="log" aria-live="polite" aria-label={labels.title}>
      {messages.map((message) => (
        <div key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
          <p className="mb-0.5 text-xs text-muted-foreground">
            {message.role === "user" ? labels.you : labels.assistant}
          </p>
          {message.attachments && message.attachments.length > 0 ? (
            <ul className="mb-1 flex flex-wrap justify-end gap-1.5" aria-label="Attached photos" data-testid="message-attachments">
              {message.attachments.map((photo, index) =>
                photo.thumb ? (
                  <li key={index}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a tiny data URL made in the browser */}
                    <img src={photo.thumb} alt={photo.name} title={photo.name} className="size-16 rounded-lg border object-cover" />
                  </li>
                ) : (
                  <li key={index} className="inline-flex max-w-48 items-center gap-1.5 rounded-lg border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                    <ImageIcon className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{photo.name}</span>
                  </li>
                ),
              )}
            </ul>
          ) : null}
          {message.content ? (
            <p
              className={`inline-block max-w-full whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {message.content}
            </p>
          ) : null}
          {message.citations && message.citations.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-left text-xs">
              <span className="text-muted-foreground">{labels.sources}:</span>
              {[...new Set(message.citations.map((c) => c.title))].map((title) => (
                <Badge key={title} variant="secondary">
                  {title}
                </Badge>
              ))}
            </div>
          ) : null}
          {message.proposals?.map((proposal) => (
            <div key={proposal.id} className="text-left">
              <ProposalCard proposal={proposal} />
            </div>
          ))}
        </div>
      ))}
      {busy ? <p className="text-sm text-muted-foreground">{labels.thinking}</p> : null}
    </div>
  );
}
