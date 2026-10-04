// The AI agent pipeline as data: each step names the files it runs through.
// The admin console draws the diagram from this list, and trace-check.ts verifies every file exists.

export type StepId =
  | "request"
  | "identity"
  | "prompt"
  | "model"
  | "tool"
  | "proposal"
  | "citations"
  | "runlog"
  | "reply"
  | "confirm";

export type StepDef = { id: StepId; title: string; summary: string; files: string[] };

export const STEP_DEFS: StepDef[] = [
  {
    id: "request",
    title: "1. Chat request",
    summary: "The panel posts the message; the body is validated with Zod.",
    files: ["src/features/ai-agent/AiPanel.tsx", "src/app/api/ai/chat/route.ts", "src/lib/ai/chat-handler.ts"],
  },
  {
    id: "identity",
    title: "2. Identity from session",
    summary: "User and role come only from the signed-in session, never from the request.",
    files: ["src/lib/ai/actor.ts", "src/lib/auth/actor.ts"],
  },
  {
    id: "prompt",
    title: "3. Prompt and policy",
    summary: "Role-specific system prompt plus the reply policy loaded from the policy document.",
    files: ["src/lib/ai/domain/edu/prompts.ts", "src/lib/ai/domain/edu/policy.ts", "docs/AI-REPLY-POLICY.md"],
  },
  {
    id: "model",
    title: "4. Model call",
    summary: "The agent loop asks the model what to do next (max 6 rounds, 60 s timeout).",
    files: ["src/lib/ai/core/agent-loop.ts", "src/lib/ai/core/provider.ts", "src/lib/ai/domain/edu/mock-model.ts"],
  },
  {
    id: "tool",
    title: "5. Tool call",
    summary: "Read-only tools run with the actor injected by code; numbers and dates are computed in code.",
    files: ["src/lib/ai/domain/edu/tools.ts", "src/lib/ai/services.ts", "src/services/read.ts", "src/lib/ai/core/time.ts"],
  },
  {
    id: "proposal",
    title: "6. Proposal saved",
    summary: "Write intents become a pending proposal with a preview. Business data is unchanged.",
    files: ["src/lib/ai/core/proposals.ts", "src/lib/ai/core/prisma-proposal-store.ts", "src/lib/ai/domain/edu/proposal-types.ts"],
  },
  {
    id: "citations",
    title: "6b. Citations verified",
    summary: "Code checks each cited material exists and each quote is a substring of the source.",
    files: ["src/lib/ai/core/citations.ts"],
  },
  {
    id: "runlog",
    title: "7. Run logged",
    summary: "The run (tools, status, timings) is written to the AgentRun table.",
    files: ["src/lib/ai/core/runs.ts"],
  },
  {
    id: "reply",
    title: "8. Reply",
    summary: "The reply, proposal cards and verified citations return to the panel.",
    files: ["src/lib/ai/chat-handler.ts", "src/features/ai-agent/MessageList.tsx", "src/features/ai-agent/ProposalCard.tsx"],
  },
  {
    id: "confirm",
    title: "9. Teacher confirms",
    summary: "Atomic pending-to-confirmed, then the permission-checked write service runs at most once.",
    files: [
      "src/app/api/ai/proposals/[id]/confirm/route.ts",
      "src/lib/ai/core/proposals.ts",
      "src/lib/ai/domain/edu/proposal-types.ts",
      "src/services/write.ts",
    ],
  },
];

/** Extra files a specific tool touches, shown on top of the step's own list. */
export function filesForTool(name: string): string[] {
  if (name === "answerFromCourseMaterials") return ["src/lib/ai/core/citations.ts", "src/services/read.ts"];
  if (name === "getStudentMemory" || name === "proposeAddStudentNote") return ["src/lib/ai/core/memory.ts"];
  if (name === "getMyProfile") return ["src/lib/ai/core/profile.ts"];
  if (name.startsWith("propose")) return ["src/lib/ai/core/proposals.ts"];
  return ["src/services/read.ts"];
}
