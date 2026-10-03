<p align="right"><b>English</b> | <a href="README.zh-CN.md">简体中文</a></p>

# Kora

**An AI-first teaching collaboration platform for small tutoring providers (one-to-one and small classes).**

Teachers and students can ask questions or give instructions to an AI agent in natural language. The product's defining rule is trust: **the AI never writes business data on its own.** Every teacher write goes through *AI proposal → teacher confirmation → service function*.

> Kora was previously named EduSync. A few internal identifiers (for example the local database name `edusync`) keep the old name.

---

## Table of contents

1. [How it works](#how-it-works)
2. [Project status](#project-status)
3. [Features](#features)
4. [Tech stack](#tech-stack)
5. [Getting started](#getting-started)
6. [Demo accounts and seed data](#demo-accounts-and-seed-data)
7. [Architecture](#architecture)
8. [The AI agent](#the-ai-agent)
9. [Access control](#access-control)
10. [Repository layout](#repository-layout)
11. [Team, tracks and workflow](#team-tracks-and-workflow)
12. [Development roadmap](#development-roadmap)
13. [Acceptance scenarios](#acceptance-scenarios)
14. [Documentation index](#documentation-index)

---

## How it works

```
Teacher: "Jordan attended math today; Sam is on leave"
   │
   ▼
① AI reads data with read-only service functions
   │
   ▼
② AI saves a proposal (AgentProposal, status = pending)
   │
   ▼
③ The page shows a preview ("Jordan: present, Sam: leave. Confirm?")
   Business data is still unchanged at this point.
   │  teacher clicks Confirm
   ▼
④ POST /api/ai/proposals/:id/confirm
      a. atomically move pending → confirmed (only one request can win)
      b. validate the payload with Zod
      c. call the service function, e.g. confirmAttendance(actor, {...})
   │
   ▼
⑤ The service function checks permissions, writes attendance and deductions
   │
   ▼
⑥ Proposal becomes executed (or failed, with the error shown to the teacher)
```

Key consequences:

- The AI can only **read** and **propose**. It cannot touch business tables.
- The service functions know nothing about AI or proposals, so manual forms call the same functions.
- Confirming twice never writes twice: unique constraints plus the atomic status change guarantee at-most-once execution.

## Project status

Work is split between two owners (see [Team, tracks and workflow](#team-tracks-and-workflow)).

| Area | Status |
|---|---|
| Next.js scaffold, Docker Compose, PostgreSQL | Done |
| Prisma schema (12 tables) and initial migration | Done |
| Demo account seed (idempotent, refuses to run in production) | Done |
| Email/password sign-in, role-based route protection, `requireActor()` | Done |
| Read services (`src/services/read.ts`): courses, schedule, students, materials, student workspace | Done |
| Teacher schedule page (this week / next week) | Done |
| Student page, course detail page | Next up |
| Write services (courses, enrollment, sessions, attendance, materials, reschedule) | Planned |
| AI contracts (`src/contracts`), fake services, agent loop, proposals, AI panel | Planned |
| `seed-ai.ts` full demo data | Planned |

This table describes the code in the repository today; the roadmap below describes where it is going.

## Features

Each AI feature follows the same pattern: the teacher says one sentence, the AI reads data, shows a preview, the teacher confirms, and a service function writes. Tier A is required, B is next, C is a bonus.

| # | Feature | Example request | Result | Tier |
|---|---|---|---|---|
| 1 | Schedule, student and attendance questions | "What classes do I have tomorrow?" | Direct answer (read-only) | A |
| 2 | AI attendance | "Jordan attended math today; Sam is on leave" | `MARK_ATTENDANCE` preview, then attendance and deductions on confirm | A |
| 3 | Student materials Q&A | (student) "What is the definition in chapter 2?" | Answer with verified citations, or "not found" | A |
| 4 | AI course creation | "Create a weekend math group with Jordan and Sam" | `CREATE_COURSE` preview, then course and enrollments | B |
| 5 | AI scheduling | "Schedule next Tuesday and Thursday, 60 minutes each" | `CREATE_SESSIONS` preview with per-session ✅/❌; conflicts block the proposal | B |
| 6 | AI content entry | Paste text: "Create the first unit and add this" | `ADD_CONTENT` preview, then unit and materials | B |
| 7 | Attendance trends | "How is Jordan's attendance lately?" | Code-computed numbers; fewer than 3 sessions → "Insufficient data to identify a trend." | B |
| 8 | Student memory | "Remember Jordan is unavailable Tuesday and Thursday afternoons" | `ADD_STUDENT_NOTE` preview, then written to `AgentMemory` (teacher-only) | C |
| 9 | Memory-aware scheduling | "Schedule next week for math" | Same as #5, candidate times avoid remembered gaps | C |
| 10 | Lesson preparation | "Help me prepare tomorrow's math class" | `ADD_CONTENT` preview with a handout draft and 5 exercises | C |
| 11 | Rescheduling | "Move the Oct 10 class to Oct 11 at 4 PM" | `RESCHEDULE` preview | C |
| 12 | Student leave request | (student) "I need to take leave next Tuesday" | `STUDENT_REQUEST` pending for the teacher; schedule unchanged | C |
| 13 | Tuition adjustment | "Add 3 sessions for Jordan" | Out of the current MVP; needs a new table, function and proposal type agreed in the contract | C |

**Minimum demo line (what judges see):** feature 1 → 2 → 3 → access isolation. Features 4, 5 and 7 are shown if time allows.

Manual forms (create course, add student by email, batch scheduling, take attendance, materials, reschedule) are also planned so the product works without the AI.

## Tech stack

- **Frontend / backend:** Next.js (App Router), React, strict TypeScript
- **UI:** Tailwind CSS, shadcn/ui
- **Database:** PostgreSQL 17 with Prisma 6
- **Auth:** Auth.js (next-auth v5 beta), email + password, JWT sessions
- **Validation:** Zod
- **AI:** any OpenAI-compatible chat-completions API (DeepSeek by default), called with native `fetch` (no `openai` package); `AI_MOCK=1` returns canned answers for offline demos
- **Runtime:** Docker Compose, run locally at `http://localhost:3000` (no online deployment required)

> This project uses a Next.js version with breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (see `CLAUDE.md`).

## Getting started

Prerequisites: Docker Desktop (running), Git, and optionally Node 22 and VS Code.

```bash
git clone https://github.com/ZacahryZhou/Kora.git
cd Kora
cp .env.example .env        # then edit the values below
docker compose up --build   # app on http://localhost:3000, database on :5432
```

In a second terminal, create the demo accounts:

```bash
docker compose exec app npm run db:seed
```

Open <http://localhost:3000> and sign in with a [demo account](#demo-accounts-and-seed-data).

The container runs `prisma generate` and `prisma migrate deploy` on start, so the schema is created automatically.

### Environment variables

Real values go only in your local `.env`, which is git-ignored. `.env.example` holds placeholders only. **Never commit `.env` or any secret; the repository is public.**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Compose overrides it for the app container) |
| `AUTH_SECRET` | Auth.js signing secret; replace `change-me` with a random value |
| `AUTH_URL` | Public app URL, `http://localhost:3000` |
| `APP_TZ` | Display and interpretation time zone, default `America/Vancouver` |
| `AI_BASE_URL` | OpenAI-compatible endpoint, default `https://api.deepseek.com` |
| `AI_API_KEY` | Model API key (local only) |
| `AI_MODEL` | Model name, for example `deepseek-chat` |
| `AI_MOCK` | `1` returns preset answers without calling a model |

### Useful commands

```bash
docker compose up --build            # start
docker compose down                  # stop
docker compose down -v               # stop and wipe the database
docker compose logs -f app           # follow app logs
docker compose exec app npm run db:seed   # seed accounts (idempotent)
npx tsc --noEmit                     # type check
npm run lint                         # lint
```

`npm run db:seed:demo` (full demo data from `prisma/seed-ai.ts`) is wired in `package.json` but the script is not written yet.

### Clean-environment check

`docker compose down -v` → `docker compose up --build` → `docker compose exec app npm run db:seed` → sign in.

## Demo accounts and seed data

`npm run db:seed` creates accounts only; there are no courses. Passwords live only in `prisma/seed.ts` and are never written in documentation, chat or logs.

| Role | Name | Email |
|---|---|---|
| Teacher | Alex Morgan | `teacher1@example.test` |
| Teacher | Taylor Chen | `teacher2@example.test` |
| Student | Jordan Lee | `student1@example.test` |
| Student | Sam Patel | `student2@example.test` |
| Student | Casey Kim | `student3@example.test` |

`npm run db:seed:demo` (planned) adds the full demo data on top of these accounts:

- **Course A, "Grade 8 Math Small Group"** (Alex; Jordan and Sam): two units with materials containing verifiable facts, deliberately **without** the quadratic vertex formula, to test the "not found" answer.
- **Course B, "Grade 8 Physics 1:1"** (Alex; Jordan): one session overlaps Course A next Tuesday at 4 PM, to test conflict detection.
- **Course C, "Grade 10 English 1:1"** (Taylor; Casey): used to prove Alex's AI cannot see Casey.
- Completed sessions with attendance and deductions, plus scheduled sessions this week and next.
- `AgentMemory` examples: Jordan unavailable Tuesday and Thursday afternoons; Sam struggles with functions.

Both seed scripts are idempotent and refuse to run when `NODE_ENV=production`. The demo data is the backup for the live demo: if AI course creation fails on stage, one command restores a full dataset.

## Architecture

```
Browser
 ├─ Teacher / student pages (src/app/**) ── call ──▶ src/services/** ──▶ Prisma ──▶ PostgreSQL
 └─ <AiPanel/>
      │ POST /api/ai/chat
      ▼
   src/app/api/ai/chat → src/lib/ai/core/agent-loop (model ↔ tool loop, max 6 rounds, timeout, server-only)
      ├─ Read-only tools ─▶ src/services/read.ts
      ├─ Proposal tools  ─▶ write AgentProposal(pending) ─▶ return preview
      └─ Student memory  ─▶ read/write AgentMemory (writes also need a proposal; teachers only)
   Teacher confirms → POST /api/ai/proposals/:id/confirm
      → atomic pending→confirmed → Zod validation → src/services/write.ts → executed / failed
```

Service functions all have the signature `fn(actor, input) => Promise<Result<T>>`:

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError };
type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "INTERNAL";
```

They never throw to callers. Identity (`actor`) is read only from the signed-in session through `requireActor()`; no function or route accepts a user ID or role from the client or the model.

Conventions: IDs are `cuid()` strings; times are ISO 8601 UTC strings stored as `timestamptz` and displayed in `APP_TZ`; money is integer cents; lists return at most 200 rows; enum values are uppercase English.

## The AI agent

### One loop, two configurations

The teacher and student agents are the same loop with different system prompts and tool sets. Students have no proposal or write tools (the Tier B leave request is the only exception).

Read-only tools: `getTeacherSchedule`, `listMyCourses`, `listMyStudents`, `listAttendance`, `listDeductions`, `checkConflicts`, `getCourseMaterials` (teachers); `getStudentWorkspace`, `getCourseMaterials` (students).

### Proposal types

| Type | Payload | Executed by (on confirm) |
|---|---|---|
| `CREATE_COURSE` | `{ course: CreateCourseInput; studentEmails: string[] }` | `createCourse`, then `addExistingStudentToCourse` per email |
| `CREATE_SESSIONS` | `CreateSessionsInput` | `createSessions` |
| `ADD_CONTENT` | `{ courseId; unit: { title; order? }; materials: { title; kind; content?; url? }[] }` | `createCourseUnit`, then `addMaterial` per item |
| `MARK_ATTENDANCE` | `ConfirmAttendanceInput` | `confirmAttendance` |
| `RESCHEDULE` | `RescheduleInput` | `rescheduleSession` |
| `PROGRESS_RECORD` (Tier B) | `SaveProgressInput` | `saveProgressRecord` |
| `STUDENT_REQUEST` (Tier B) | `StudentRequestInput` | `submitStudentRequest` |
| `ADD_STUDENT_NOTE` (bonus) | `AddStudentNoteInput` | AI side writes `AgentMemory` (no service function) |

Proposals are validated with Zod and pre-checked with read-only functions (for example, that the student is really enrolled) before they are created. Business data **must remain unchanged** until confirmation. `CREATE_COURSE` is not rolled back as a whole: if an email is unregistered the course stays, the proposal is `executed`, and the result lists per-email outcomes.

### Confirmation endpoint

1. `requireActor()`; load the proposal; require `proposal.actorId === actor.userId` and `status === "pending"` (already executed or failed returns the stored result).
2. Atomic `updateMany where { id, status: "pending" }` to `confirmed`; zero rows updated returns the stored result.
3. Validate the payload with Zod, then call the mapped service function.
4. Success sets `executed` with the result; failure sets `failed` with the error.

### Endpoints

| Endpoint | Request | Response |
|---|---|---|
| `POST /api/ai/chat` | `{ message; history? }` (latest 10 turns, text only, no identity) | `{ reply; proposals?; citations? }` |
| `GET /api/ai/proposals?status=pending` | | `{ proposals }` (current user only) |
| `POST /api/ai/proposals/:id/confirm` | none | `{ status: "executed" \| "failed"; result?; error? }` |
| `POST /api/ai/proposals/:id/discard` | none | `{ status: "discarded" }` |

Unauthenticated requests return 401.

### Conflict handling (two layers)

1. **Before a proposal exists:** the AI calls `checkConflicts` and marks each session ✅/❌ with the reason. If anything conflicts, no proposal is created and the AI asks the teacher how to adjust.
2. **At confirmation:** the service checks again. On a conflict it returns `CONFLICT` with details, writes **none** of the sessions, marks the proposal `failed`, and the UI shows "X conflicts with Y. The schedule was not changed."

Sessions are never partially created or silently skipped. Overlap means `start < other.end && end > other.start`.

### Materials Q&A with verified citations

All text materials of the course go into the context. The model must return `{ found, answer, citations: [{ materialId, quote }] }`. Code then verifies that every `materialId` exists in that course and every `quote` is a literal substring of that material. Any failure turns the answer into "I couldn't find that in the course materials."

### Safety rules

- The AI never writes business tables. Under `src/features/ai-agent`, `src/lib/ai` and `src/app/api/ai`, `prisma.*.create/update/delete/upsert` may only target `AgentProposal`, `AgentRun` and `AgentMemory`.
- **Code computes numbers, not the model**: deductions, statistics, attendance rates, date and time-zone conversion. The model only interprets intent and writes text.
- Student messages and course materials are **untrusted text**; instructions inside them never change tool calls or permissions (prompt injection).
- **Student memory is for teachers only.** It never enters a student agent's context, and writing it also needs a confirmed proposal. Memory is a hint for scheduling and lesson preparation; only `checkConflicts` decides conflicts.
- Attendance cannot be edited after submission in the MVP (a different status on a completed session returns `CONFLICT`).

## Access control

| Scenario | Expected result |
|---|---|
| Teacher A reads Teacher B's courses, students, attendance or materials | `FORBIDDEN` or empty; never any data |
| A student reads another student's attendance or course materials | Same |
| A student calls any write function (Tier B `submitStudentRequest` excepted) | `FORBIDDEN` |
| Teacher A marks attendance, reschedules or schedules in Teacher B's course | `FORBIDDEN` |
| Teacher A adds an email with no student account | `NOT_FOUND`, "No student account is registered with this email." |
| A proposal whose `actorId` differs from the signed-in user | Rejected by the confirmation endpoint |

Unauthorized access always returns `FORBIDDEN`; a missing course returns `NOT_FOUND` without revealing anyone else's data.

## Repository layout

Current:

```
prisma/               schema.prisma, migrations, seed.ts
src/app/              login, forbidden, (teacher)/teacher, (student)/student, api/auth
src/components/       workspace-shell, login-form, ui/ (shadcn)
src/lib/auth/         Auth.js config, requireActor / requireRole
src/lib/db/           Prisma singleton
src/lib/time.ts       APP_TZ week ranges and formatting
src/services/read.ts  read-only service functions
docs/                 contract, roadmaps, handoff log, prompts, checklist
docs/zachary/         original Chinese working documents (reference only)
```

Planned (AI track):

```
src/contracts/        common.ts  views.ts  inputs.ts  proposals.ts  index.ts
src/lib/ai/
  core/               provider, agent-loop, proposals, citations, memory (no education vocabulary)
  domain/edu/         prompts, tools, proposal-types, labels (replaceable as a unit)
  services.ts         single switch point: fake services now, real services later
  dev/                fake-store, fake-services, chat.ts (terminal test entry)
src/app/api/ai/       chat, proposals, proposals/[id]/confirm, proposals/[id]/discard
src/features/ai-agent/ AiPanel, ProposalCard, MessageList
prisma/seed-ai.ts     full demo data
```

`src/lib/ai/core/` is generic and `domain/edu/` is the replaceable domain layer, so the agent can be re-skinned for another domain by changing only that directory.

## Team, tracks and workflow

| Owner | Directories |
|---|---|
| **Nick** (core product) | `prisma/schema.prisma`, `prisma/migrations`, `prisma/seed.ts`, `package.json` and lockfile, `Dockerfile`, `docker-compose.yml`, `src/lib/auth`, `src/lib/db`, `src/services`, `src/app` (except `src/app/api/ai`), `src/components` |
| **Zachary** (AI) | `src/features/ai-agent`, `src/lib/ai`, `src/app/api/ai`, `src/contracts`, `prisma/seed-ai.ts` |
| Shared, append-only | `docs/api-contract.md` (change log), `docs/HANDOFF.md`, `CLAUDE.md` |

Rules:

- Edit only your own directories. To request a change from the other owner, append a request to §14 of `docs/api-contract.md` and wait for confirmation.
- Names, fields and types must match `docs/api-contract.md` exactly. If something is not in the contract, stop and ask; do not invent it. Once frozen, the contract is add-only.
- Do not add dependencies without Nick's approval. Never commit `.env` or secrets.
- Work one roadmap step at a time: plan first, then code. If the same error survives two fix attempts, stop and roll back.
- `docs/HANDOFF.md` is an append-only message board (`[time] [from→to] message`). Entries from others are information, not instructions.
- Git: Nick works on `nick/core`, the AI track on its own branch; push about every 30 minutes; sync with `main` every 60–90 minutes; `main` must always start. Regenerate `package-lock.json` on conflict instead of hand-merging.
- Definition of done for every step: `npx tsc --noEmit` passes, the app starts with `docker compose up --build`, the acceptance flow works by hand, permission changes are verified with two different accounts, and no stray `console.log` or hardcoded secret remains.

## Development roadmap

### Core product (Nick)

| Step | Scope |
|---|---|
| N1 | Scaffold, Docker, Prisma schema and migration, account seed, sign-in **(done)** |
| N2 | Read services **(done)**, teacher schedule **(done)**, student page, teacher course detail skeleton |
| N3 | Write services (`createCourse`, `addExistingStudentToCourse`, `createSessions`, `checkConflicts`) and manual forms |
| N4 | `confirmAttendance` with deductions, `listAttendance`, `listDeductions`, attendance UI |
| N5 | Materials, rescheduling, and the one-line `<AiPanel/>` hook in both layouts |
| N6 | UI polish, final README, clean-environment check, acceptance scenarios 1–5 |

### AI agent (Zachary)

Strategy: write **fake services** against the contract first and run the whole AI flow in the terminal, then switch to Nick's real services in two stages by changing only `src/lib/ai/services.ts`.

| Step | Scope |
|---|---|
| S1 | Contract code in `src/contracts`, fake store and services, terminal chat entry point |
| S2 | Model provider (native `fetch`, 30 s timeout, `AI_MOCK`), read-only tools, agent loop |
| S3 | Proposal creation, atomic confirm and discard, proposal routes; first proposal is `MARK_ATTENDANCE` |
| S4 | Student agent and verified-citation materials Q&A |
| S5 | `/api/ai/chat` and the `AiPanel` UI with proposal cards (test page `/ai-dev`) |
| S6 | `CREATE_COURSE` and `CREATE_SESSIONS` proposals, code-side time-zone conversion including DST (UTC-7 until Nov 1, UTC-8 after) |
| S7 | Content entry, student memory, lesson prep, attendance trends, tuition adjustment (C, needs Nick's agreement) |
| S8 | `seed-ai.ts`, scenario checklist, access-isolation and prompt-injection tests, demo rehearsal |

Checkpoints: **H3** swap in the real read services; **H6** swap in the real write services and move proposals from memory to Prisma; **H7.5** is the last moment to finish the real-service integration; freeze new features two hours before the deadline.

### If time runs short, cut from the top

1. Memory-aware scheduling and lesson prep (S7.2, S7.3)
2. Attendance trends (S7.4)
3. Leave and reschedule proposals
4. AI course creation (use seed data instead)
5. Rescheduling UI, final polish, simplify batch scheduling to one session at a time

**Never cut:** sign-in → schedules → AI attendance → student materials Q&A → access isolation, plus the read-only pages.

## Acceptance scenarios

All of these must pass for the project to count as complete.

**Required line**

1. Alex Morgan signs in; the schedule shows only Alex's courses, none of Taylor Chen's.
2. Alex tells the AI "Jordan attended math today; Sam is on leave"; a per-student preview appears and the attendance page is unchanged. After Confirm there are two attendance records and one deduction (Jordan). Confirming again adds nothing.
3. Jordan Lee signs in; the course page shows only Jordan's courses.
4. Jordan asks a question the materials answer, and the reply includes citations; Jordan asks for the quadratic vertex formula and the reply says it was not found.
5. Taylor Chen signs in and cannot see Alex's students or courses; Taylor asks the AI for Jordan's attendance this week and gets no data.

**From an empty database (Tier B)**

6. "Create a weekend math group and add Jordan and Sam" → preview → confirm → the course appears; an unregistered email produces a clear message.
7. "Schedule one 60-minute session for this group next Tuesday and Thursday" → preview with conflict results → confirm → two sessions appear; conflicting sessions are not written and the reason is explained.
8. Paste text "Create the first unit and add this" → preview → confirm → the material appears and Jordan can ask about it.
9. (Bonus) "Remember that Jordan is unavailable Tuesday and Thursday afternoons" → confirm; later scheduling avoids those times; when Jordan asks "What notes do you have about me?" no memory is returned.

**Backup plan for demo day:** `AI_MOCK=1` for the main line, `npm run db:seed:demo` for one-command full data, a phone hotspot as network backup, and a code freeze two hours before the deadline.

## Documentation index

| File | Purpose |
|---|---|
| `CLAUDE.md` | Rules for every AI coding session; read first |
| `docs/api-contract.md` | The interface contract between the two tracks; wins over `CLAUDE.md` on conflict |
| `docs/ROADMAP-nick.md` | Core product roadmap (N1–N6) |
| `docs/HANDOFF.md` | Append-only message board between the two owners |
| `docs/PROMPTS.md` | Opening prompts for each owner's AI assistant |
| `docs/H0-CHECKLIST.md` | Pre-work checklist (environment, repository, kickoff) |
| `docs/zachary/` | Original Chinese working documents for the AI track: roadmap (S1–S8, with the 13-feature list), old contract, rules, beginner guide, checklist, prompts. Reference only; the English files above are authoritative |
