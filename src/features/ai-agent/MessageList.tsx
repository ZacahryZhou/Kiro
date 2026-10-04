"use client";

import { useEffect, useRef } from "react";
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
};

export function MessageList({ messages, busy }: { messages: PanelMessage[]; busy: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" }); // keep the newest message in view
  }, [messages, busy]);

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-live="polite" aria-label={labels.title}>
      {messages.map((message) => (
        <div key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
          <p className="mb-0.5 text-xs text-muted-foreground">
            {message.role === "user" ? labels.you : labels.assistant}
          </p>
          <p
            className={`inline-block max-w-full whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
              message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            {message.content}
          </p>
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
      <div ref={end} />
    </div>
  );
}
