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
| Student page (courses and the next 30 days of sessions) | Done |
| Teacher course management, student enrollment, session scheduling, attendance and deductions | Done |
| Course units and materials (teacher editing; student reading) | Done |
| Session rescheduling (teacher UI, conflict checks and change history) | Done |
| Role-specific AI panel, chat API, read-only questions, verified material citations and proposal flows | Integrated; requires AI provider configuration for live model responses |
| Full multi-person AI showcase fixture (`prisma/seed-ai.ts`) | Done; `npm run db:seed:demo`, or `npx tsx prisma/seed-ai.ts --reset` for a clean slate |
| AI proposals and run log stored in the database (`AgentProposal`, `AgentRun`) | Done; only the AI's own tables are written |
| Scripted demo model (`AI_MOCK=1`) that drives the real tools with no network or key | Done |
| Vancouver calendar behavior after Nov 1, 2026 | Verified with current time-zone data; British Columbia keeps UTC-7 year-round |

Core teacher/student workflows, persistent AI proposals, role-specific tools and the showcase fixture are implemented. UI acceptance with a live language model still requires a configured `AI_API_KEY` and `AI_MODEL` in the local `.env` file.

## Features

Each AI feature follows the same pattern: the teacher says one sentence, the AI reads data, shows a preview, the teacher confirms, and a service function writes. Tier A is required, B is next, C is a bonus.

| # | Feature | Example request | Result | Tier / status |
|---|---|---|---|---|
| 1 | Schedule, student and attendance questions | "What classes do I have tomorrow?" | Read-only tools are available; response needs a configured model | A · Integrated |
| 2 | AI attendance | "Jordan attended math today; Sam is on leave" | `MARK_ATTENDANCE` preview, then attendance and deductions on confirm | A · Integrated; needs populated fixture data for the full demo |
| 3 | Student materials Q&A | (student) "What is the definition in chapter 2?" | Answer with verified citations, or "not found" | A · Integrated; needs populated fixture data for cited answers |
| 4 | AI course creation | "Create a weekend math group with Jordan and Sam" | `CREATE_COURSE` preview, then course and enrollments | B · Integrated |
| 5 | AI scheduling | "Schedule next Tuesday and Thursday, 60 minutes each" | `CREATE_SESSIONS` preview with per-session ✅/❌; conflicts block the proposal | B · Integrated; current Vancouver time-zone rules verified |
| 6 | AI content entry | Paste text: "Create the first unit and add this" | `ADD_CONTENT` preview, then unit and materials | B · Integrated; real database and confirmation verified |
| 7 | Attendance trends | "How is Jordan's attendance lately?" | Code-computed numbers; fewer than 3 sessions → "Insufficient data to identify a trend." | B · Integrated; threshold and rate verified |
| 8 | Student memory | "Remember Jordan is unavailable Tuesday and Thursday afternoons" | `ADD_STUDENT_NOTE` preview, then written to `AgentMemory` (teacher-only) | C · Integrated; role and course isolation verified |
| 9 | Memory-aware scheduling | "Schedule next week for math" | Same as #5, candidate times avoid remembered gaps | C · Integrated; conflicting preferences block proposal creation |
| 10 | Lesson preparation | "Help me prepare tomorrow's math class" | `ADD_CONTENT` preview with a handout draft and 5 exercises | C · Integrated; five-question output validated and requires confirmation |
| 11 | Rescheduling | "Move the Oct 10 class to Oct 11 at 4 PM" | Teacher can reschedule manually; AI `RESCHEDULE` proposal is not implemented | C · Manual workflow done; AI unavailable |
| 12 | Student leave request | (student) "I need to take leave next Tuesday" | `STUDENT_REQUEST` pending for the teacher; schedule unchanged | C · Not implemented |
| 13 | Tuition adjustment | "Add 3 sessions for Jordan" | Out of the current MVP; needs a new table, function and proposal type agreed in the contract | C · Out of scope |

**Intended demo line:** feature 1 → 2 → 3 → access isolation, on the showcase fixture. It runs with a live model (`AI_API_KEY`, `AI_MODEL`) or, with no network or key, in the scripted demo mode (`AI_MOCK=1`), which understands a few plain requests and drives the same real tools, proposals, confirmation and database (it is not a language model, so it does not show how a real model chooses tools).

Manual forms are available for creating courses, enrolling students, scheduling sessions, recording attendance, managing materials, and rescheduling sessions, so core workflows also work without the AI.

## Tech stack

- **Frontend / backend:** Next.js (App Router), React, strict TypeScript
- **UI:** Tailwind CSS, shadcn/ui
- **Database:** PostgreSQL 17 with Prisma 6
- **Auth:** Auth.js (next-auth v5 beta), email + password, JWT sessions
- **Validation:** Zod
- **AI:** any OpenAI-compatible chat-completions API (DeepSeek by default), called with native `fetch` (no `openai` package); `AI_MOCK=1` runs a scripted demo model for offline demos
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
| `AI_ADMIN_EMAILS` | Comma-separated emails allowed to open the Agent Console in production (in development any teacher can) |
| `AI_MOCK` | `1` replaces the model with a scripted demo model (no network or key); it still uses the real tools and database |

### Useful commands

```bash
docker compose up --build            # start
docker compose down                  # stop
docker compose down -v               # stop and wipe the database
docker compose logs -f app           # follow app logs
docker compose exec app npm run db:seed   # seed accounts (idempotent)
docker compose exec app npx tsx prisma/seed-ai.ts --reset   # AI demo data from a clean slate
npx tsx src/lib/ai/dev/run-all.ts    # every offline AI check, one summary
npx tsc --noEmit                     # type check
npm run lint                         # lint
```

The baseline seed creates two accounts only. Run the AI showcase fixture as a second step to create the multi-person course, attendance, material, conflict and teacher-memory data.

### Clean-environment check

`docker compose down -v` → `docker compose up --build` → `docker compose exec app npm run db:seed` → `docker compose exec app npm run db:seed:demo` → sign in.

Run all offline AI checks (fake services, no key) with `npx tsx src/lib/ai/dev/run-all.ts`, or the shorter `npm run check:ai`. Run `NODE_ENV=development npx tsx src/lib/ai/dev/real-services-check.ts` inside the app container for real-database acceptance checks.

## Demo accounts and seed data

`npm run db:seed` creates exactly two baseline accounts and no courses. Their shared demonstration password is stored in `prisma/seed.ts` only. Re-seeding removes the older seed-only accounts when no data is linked to them.

| Role | Name | Email |
|---|---|---|
| Teacher | Demo Teacher | `t@example.test` |
| Student | Demo Student | `s@example.test` |

The multi-person acceptance personas below (Alex Morgan, Taylor Chen, Jordan Lee, Sam Patel, Casey Kim) are separate from the two baseline logins. `npm run db:seed:demo` provisions them with the demonstration password:

- **Course A, "Grade 8 Math Small Group"** (Alex; Jordan and Sam): two units with materials containing verifiable facts, deliberately **without** the quadratic vertex formula, to test the "not found" answer.
- **Course B, "Grade 8 Physics 1:1"** (Alex; Jordan): one session overlaps Course A next Tuesday at 4 PM, to test conflict detection.
- **Course C, "Grade 10 English 1:1"** (Taylor; Casey): used to prove Alex's AI cannot see Casey.
- Completed sessions with attendance and deductions, plus scheduled sessions this week and next.
- `AgentMemory` examples: Jordan unavailable Tuesday and Thursday afternoons; Sam struggles with functions.

The baseline account seed and AI fixture seed are idempotent and refuse to run when `NODE_ENV=production`. The five AI personas use `t+alex@example.test`, `t+taylor@example.test`, `s+jordan@example.test`, `s+sam@example.test` and `s+casey@example.test`.

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

Teacher tools, read-only: `getTeacherSchedule`, `listMyCourses`, `listMyStudents`, `listAttendance`, `listDeductions`, `checkConflicts`, `getCourseMaterials`, `getAttendanceTrends`, `getStudentMemory`. Teacher tools that only prepare a pending proposal: `proposeMarkAttendance`, `proposeCreateCourse`, `proposeCreateSessions`, `proposeAddContent`, `proposeAddStudentNote`, `proposeLessonPrep`. Student tools, read-only: `getStudentWorkspace`, `answerFromCourseMaterials`.

The behaviour rules both agents follow are written in `docs/AI-REPLY-POLICY.md` (section 0 is loaded into their instructions at run time).

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

Of these, `CREATE_COURSE`, `CREATE_SESSIONS`, `ADD_CONTENT`, `MARK_ATTENDANCE` and `ADD_STUDENT_NOTE` are built; `RESCHEDULE`, `PROGRESS_RECORD` and `STUDENT_REQUEST` are defined in the contract but have no AI tool yet (rescheduling is available in the teacher UI).

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

### Live Agent Console (admin)

Open `/admin/agent` (signed in as an allowed user) to watch the agent work in real time. The page draws the whole pipeline (request, identity, prompt and policy, model call, tool call, proposal or citation check, run log, reply, and teacher confirmation). While a run is in progress the current step is highlighted amber, finished steps turn green, failed ones red, and the **files each step uses are highlighted in the file list** (amber for the running step, green for files touched earlier in the run). An embedded chat panel lets you send a message and see it light up; **Replay** re-animates any earlier run step by step.

- Data comes from `GET /api/ai/trace/stream` (server-sent events). It returns 403 to anyone who is not allowed.
- Access: in development any teacher; otherwise only emails listed in `AI_ADMIN_EMAILS`. Students never.
- Events hold step names, tool names, timings and the role only. Message text, tool arguments, results and user ids are never recorded, and the buffer keeps the latest 300 events in memory.
- The step-to-file mapping lives in `src/lib/ai/trace/steps.ts`; `trace-check.ts` verifies every listed file exists.

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

## Interface

The workspace uses one shared layout: a left sidebar (Schedule and Courses for teachers, My learning for students, plus the Agent console for allowed admins), a header with the signed-in name and role, and a floating **Ask Kora AI** button that opens the assistant. The panel stays mounted while closed, so the conversation and any pending proposal cards survive closing and reopening. On phones the sidebar becomes a top bar with a horizontal menu.

- `/` shows a landing page to signed-out visitors and redirects signed-in users to their workspace.
- `/login` is a split layout with a product preview. Teacher pages show weekly stats; student pages show courses, upcoming sessions and attendance at a glance.
- Shared building blocks live in `src/components/page.tsx` (page header, stat card, empty state, error alert), `brand.tsx`, `sidebar-nav.tsx` and `workspace-shell.tsx`. Fonts and colours are unchanged.

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
prisma/               schema.prisma, migrations, seed.ts, seed-ai.ts (AI demo data, `--reset` supported)
src/contracts/        shared result, view, input, and proposal types (AI track)
src/app/              login, forbidden, role workspaces, course routes, api/auth, api/ai
src/components/       workspace-shell, course forms, login-form, ui/ (shadcn)
src/features/ai-agent/ AiPanel, ProposalCard, MessageList
src/lib/auth/         Auth.js config, requireActor / requireRole
src/lib/db/           Prisma singleton
src/lib/time.ts       APP_TZ week ranges and formatting
src/services/         read.ts and write.ts business services
src/lib/ai/           provider, agent loop, education tools, proposal flows and checks
docs/                 contract, roadmaps, handoff log, prompts, checklist
docs/zachary/         original Chinese working documents (reference only)
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
| N2 | Read services, teacher schedule, student page, teacher course details **(done)** |
| N3 | Course, enrollment, scheduling services and manual forms **(done)** |
| N4 | Attendance, deductions, read views and attendance UI **(done)** |
| N5 | Course materials, rescheduling and AI panel in both role layouts **(done)** |
| N6 | README/status polish and isolated clean-environment check **(core complete; AI scenarios remain open)** |

### AI agent (Zachary)

Strategy: write **fake services** against the contract first and run the whole AI flow in the terminal, then switch to Nick's real services in two stages by changing only `src/lib/ai/services.ts`.

| Step | Scope |
|---|---|
| S1–S3 | Contracts, fake services, provider, agent loop and proposal routes **(done)** |
| S4 | Student agent and verified-citation materials Q&A **(done)** |
| S5 | `/api/ai/chat` and `AiPanel` with proposal cards; panel mounted in both workspaces **(done)** |
| S6 | `CREATE_COURSE` and `CREATE_SESSIONS` proposals **(done; calendar checks updated for permanent UTC-7 in Vancouver)** |
| S7 | Content entry, teacher-private student memory, memory-aware scheduling, lesson prep and attendance trends **(implemented; manually rehearse the live model path)** |
| S8 | Idempotent multi-person `seed-ai.ts` fixture (with `--reset`), scripted demo model, real-service and browser acceptance checks **(implemented; final live-model rehearsal awaits local API credentials/model)** |

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

1. Alex Morgan signs in (once the AI fixtures are seeded); the schedule shows only Alex's courses, none of Taylor Chen's.
2. Alex tells the AI "Jordan attended math today; Sam is on leave"; a per-student preview appears and the attendance page is unchanged. After Confirm there are two attendance records and one deduction (Jordan). Confirming again adds nothing.
3. Jordan Lee signs in; the course page shows only Jordan's courses.
4. Jordan asks a question the materials answer, and the reply includes citations; Jordan asks for the quadratic vertex formula and the reply says it was not found.
5. Taylor Chen signs in and cannot see Alex's students or courses; Taylor asks the AI for Jordan's attendance this week and gets no data.

**From an empty database (Tier B)**

6. "Create a weekend math group and add Jordan and Sam" (students are added by email, so the assistant asks for the emails) → preview → confirm → the course appears; an unregistered email produces a clear message.
7. "Schedule one 60-minute session for this group next Tuesday and Thursday" → preview with conflict results → confirm → two sessions appear; conflicting sessions are not written and the reason is explained.
8. Paste text "Create the first unit and add this" → preview → confirm → the material appears and Jordan can ask about it.
9. (Bonus) "Remember that Jordan is unavailable Tuesday and Thursday afternoons" → confirm; later scheduling avoids those times; when Jordan asks "What notes do you have about me?" no memory is returned.

**Demo readiness:** with `AI_MOCK=1` the scripted demo model runs the main line (attendance proposal and confirmation, course creation, scheduling with conflicts, lookups, and materials Q&A with verified citations) on the real database, with no network. To show a real language model choosing tools, set `AI_API_KEY` and `AI_MODEL` in the local `.env`. Run both seed commands above first, and `npx tsx prisma/seed-ai.ts --reset` to repeat a demo from a clean slate. Tuition adjustments and student-submitted leave requests remain outside the accepted core flow; rescheduling is available through the teacher UI.

## Documentation index

| File | Purpose |
|---|---|
| `CLAUDE.md` | Rules for every AI coding session; read first |
| `docs/api-contract.md` | The interface contract between the two tracks; wins over `CLAUDE.md` on conflict |
| `docs/AI-REPLY-POLICY.md` | The reply rules loaded into teacher and student AI prompts |
| `docs/ROADMAP-nick.md` | Core product roadmap (N1–N6) |
| `docs/HANDOFF.md` | Append-only message board between the two owners |
| `docs/PROMPTS.md` | Opening prompts for each owner's AI assistant |
| `docs/H0-CHECKLIST.md` | Pre-work checklist (environment, repository, kickoff) |
| `docs/zachary/` | Original Chinese working documents for the AI track: roadmap (S1–S8, with the 13-feature list), old contract, rules, beginner guide, checklist, prompts. Reference only; the English files above are authoritative |
