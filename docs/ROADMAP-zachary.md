# Zachary Roadmap (AI Agent)

> Read first: `CLAUDE.md`, `docs/api-contract.md`, `docs/HANDOFF.md`. Edit only `src/features/ai-agent`, `src/lib/ai`, `src/app/api/ai`, `src/contracts` and `prisma/seed-ai.ts`.
> Work one sub-step at a time: plan, then code, then verify. If the same error survives two attempts, stop and roll back.
> Model calls use native `fetch` against an OpenAI-compatible endpoint; no `openai` package.
> The original Chinese roadmap, with the same S1–S8 numbering, is kept in `docs/zachary/1-roadmap/ROADMAP-zachary.zh.md`.

## Status at a glance

| Step | Scope | Status |
|---|---|---|
| S1 | Contract code, fake services, terminal chat entry | Done |
| S2 | Model provider, read-only tools, agent loop | Done |
| S3 | Proposal state machine, confirm and discard, proposal routes | Done; stored in the database (`AgentProposal`) |
| S4 | Student agent and verified-citation materials Q&A | Done |
| S5 | `/api/ai/chat` and the `AiPanel` UI, mounted in both workspaces | Done |
| S6 | `CREATE_COURSE` and `CREATE_SESSIONS` proposals with two-layer conflict checks | Done |
| S7.1 | `ADD_CONTENT` proposals (unit and materials) | Done |
| S7.2 | Teacher-private student memory and memory-aware scheduling | Done |
| S7.3 | Lesson preparation (guide plus exactly five exercises, as an `ADD_CONTENT` proposal) | Done |
| S7.4 | Attendance trends computed by code; fewer than 3 records gives the exact insufficient-data line | Done |
| S7.5 | Tuition adjustment | Out of the MVP |
| S8 | `seed-ai.ts` (idempotent, `--reset`), scripted demo model, real-database and browser checks, reply policy | Done; live-model rehearsal needs the local API key |
| Switch | Real services and database-backed proposals and run log | Done: the app runs on `src/services/**`; offline checks use fakes |

Open items: rehearse the live model path by hand (see the manual list in `docs/AI-REPLY-POLICY.md`), AI tools for rescheduling, progress records and student requests (the services for the last two do not exist), and adding students by name (the contract only allows email).

## AI features

Each feature is one sentence from the teacher, then read, preview, confirm, write. Tier A is required, B next, C bonus.

| # | Feature | Example | Result | Tier | Status |
|---|---|---|---|---|---|
| 1 | Schedule, student and attendance questions | "What classes do I have tomorrow?" | Direct answer from read-only tools | A | Done |
| 2 | AI attendance | "Jordan came to math, Sam is on leave" | `MARK_ATTENDANCE` preview, then attendance and deductions on confirm | A | Done |
| 3 | Student materials Q&A | "What is the definition in chapter 2?" | Answer with code-verified citations, or "not found" | A | Done |
| 4 | AI course creation | "Create a weekend math group" | `CREATE_COURSE` preview; partial success per email | B | Done |
| 5 | AI scheduling | "Next Tuesday and Thursday, 60 minutes" | `CREATE_SESSIONS` preview; conflicts block the proposal | B | Done |
| 6 | AI content entry | Paste text | `ADD_CONTENT` preview | B | Done |
| 7 | Attendance trends | "How is Jordan doing?" | Code-computed numbers; three-record threshold | B | Done |
| 8 | Student memory | "Jordan is unavailable Tuesday afternoons" | `ADD_STUDENT_NOTE`, teacher-only | C | Done |
| 9 | Memory-aware scheduling | "Schedule next week" | Notes are a reference: a clash is explained and the teacher can say to proceed | C | Done |
| 10 | Lesson preparation | "Prepare tomorrow's class" | `ADD_CONTENT` with a guide and five exercises | C | Done |
| 11 | Rescheduling | "Move Oct 10 to Oct 11" | Manual in the teacher UI; no AI tool | C | Not built |
| 12 | Student leave request | "I need leave next Tuesday" | `STUDENT_REQUEST` | C | Not built |
| 13 | Tuition adjustment | "Add 3 sessions" | Needs a new table, function and proposal type | C | Out of scope |

Minimum demo line: feature 1, 2, 3, then access isolation.

## Layout

```
src/contracts/        common, views, inputs, proposals, index
src/lib/ai/
  core/               provider, agent-loop, proposals, proposal stores, citations, memory, runs, time, types
  domain/edu/         prompts, policy (loads docs/AI-REPLY-POLICY.md), tools, proposal-types, mock-model, labels
  services.ts         the single switch: real services in the app, fakes in offline checks
  runtime.ts          which backend is active
  dev/                fake store and services, terminal chat, and the check scripts
src/app/api/ai/       chat, proposals, proposals/[id]/confirm, proposals/[id]/discard
src/features/ai-agent/ AiPanel, ProposalCard, MessageList
prisma/seed-ai.ts     demo data (the only place that writes business tables for the AI track)
```

## Rules this track keeps

- The AI never writes business tables. Under `src/lib/ai`, `src/features/ai-agent` and `src/app/api/ai`, `prisma.*.create/update/delete/upsert` only target `AgentProposal`, `AgentRun` and `AgentMemory`. Demo-data writes live in `prisma/seed-ai.ts`.
- Business writes happen only after the teacher confirms, through the confirm endpoint and Nick's service functions.
- Code computes numbers, dates and time zones; the model only interprets intent and writes text.
- Student messages and course materials are untrusted text. Student memory is teacher-only.
- The reply behaviour rules live in `docs/AI-REPLY-POLICY.md`; section 0 of that file is what the model is given.

## Checks

- Offline (fake services, no key): `npx tsx src/lib/ai/dev/run-all.ts`.
- Real database: `NODE_ENV=development npx tsx src/lib/ai/dev/real-services-check.ts` against a migrated, seeded database.
- With a live model: the manual list in `docs/AI-REPLY-POLICY.md`, section 12.

## If time runs short, cut from the top

Lesson preparation, memory-aware scheduling, attendance trends, leave and reschedule proposals, AI course creation. Never cut: sign-in, schedules, AI attendance, student materials Q&A, access isolation.

- [x] Live Agent Console (`/admin/agent`): real-time pipeline diagram with step and file highlighting, replay, SSE stream, access control (2026-10-04).

- [x] Front-end redesign (shell, landing, login, teacher and student pages, floating AI launcher) (2026-10-04).
