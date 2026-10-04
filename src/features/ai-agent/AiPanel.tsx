"use client";

import type { Role } from "@/contracts";
import { ChatWorkspace } from "./ChatWorkspace";

/**
 * The assistant shown inline on a page: the Agent Console and dev page (no course), or a course page
 * (with `course`, a separate assistant whose chats and tools are limited to that course). The workspace
 * pages' general assistant is the centred pop-up in AiLauncher.
 */
export function AiPanel({ role, course }: { role: Role; course?: { id: string; name: string } }) {
  return <ChatWorkspace role={role} variant="inline" course={course} />;
}
