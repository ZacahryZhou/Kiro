# Kora: Project Story

> Text for the submission form. It describes what the repository does today and what the demo shows; the one thing it cannot show on its own is the live language model, which needs your own `AI_API_KEY` (the scripted demo mode needs none).

## Inspiration

Small tutoring providers (one-to-one lessons and small classes) run on spreadsheets, chat threads and memory. A teacher finishes a lesson and then has to open a schedule, mark who came, work out whose lesson balance goes down, and find a new slot for the student who was on leave, all without double-booking anyone. None of it is hard, but all of it is repetitive, and a single slip means a wrong charge or a student who turns up to an empty room.

AI assistants look like the obvious fix: just tell the assistant "Jordan came today, Sam is on leave." But the moment an assistant can write to a real schedule or a real lesson balance, trust becomes the problem. A model that misreads a name can charge the wrong family. We wanted to see how far an AI-first product could go while making it structurally impossible for the AI to change anything the teacher has not approved.

## What it does

Kora is a teaching collaboration platform for small tutoring providers. Teachers and students sign in and see their own schedules, courses, materials and attendance. On top of that sits an AI agent that understands natural language.

The rule that defines the product: **the AI never writes business data on its own.** Every teacher write follows the same path:

1. The teacher says one sentence, for example "Jordan attended math today; Sam is on leave."
2. The AI reads the relevant data through read-only functions and saves a **proposal**.
3. The page shows a preview of exactly what would happen, and nothing has changed yet.
4. The teacher clicks Confirm, and only then does an ordinary, permission-checked service function write the attendance and the lesson deduction.

Students get a different, smaller agent. It can only read their own workspace and answer questions from their course materials, and every answer carries citations that code has verified against the source text. If the materials do not contain the answer, it says so instead of guessing.

What the assistant can do today, all with the same preview-then-confirm rule:

- **Attendance by sentence**, with lesson deductions calculated by code.
- **Verified answers from course materials** for students: every citation is checked against the source text, or the assistant says it could not find the answer.
- **Course creation, scheduling and rescheduling**, with conflict checks before a proposal exists and again at confirmation. A clash writes nothing and is explained.
- **Adding students to a course**, **course content entry**, **progress records** drafted from the teacher's own words, **attendance trends** that refuse to guess with fewer than three records, and **teacher-only student notes** that help with scheduling.
- **Student leave requests**: a student asks in plain language, confirms the preview, and the teacher sees a pending request. It never edits the schedule or attendance by itself.

Around the assistant is a normal product: sign-in, weekly schedule and month calendar, courses, materials, attendance, a Requests inbox, a Students page, account settings, and a live Agent Console that shows each step of the agent and the files it uses.

## How we built it

**Stack:** Next.js (App Router) with strict TypeScript, Tailwind and shadcn/ui, PostgreSQL with Prisma, Auth.js email/password sign-in, Zod for validation, and Docker Compose so the whole thing runs locally with one command. The model is any OpenAI-compatible API (DeepSeek by default), called with plain `fetch`, with a mock mode for offline demos.

**Two tracks, one contract.** The work is split between two people. One owns the core product (database, sign-in, services, pages); the other owns the AI agent. We agreed on a written API contract first: every service function, input type, return type, error code and permission rule. Each side builds against the contract and neither edits the other's directories.

**Fake services first.** The AI track did not wait for the real services. We wrote in-memory services that follow the contract exactly, including permission checks, time-overlap conflict detection and the attendance and deduction rules, and ran the whole agent flow in a terminal against them. A single file decides whether the agent talks to the fake or the real services, so switching is one import change. Scripts check that the fakes behave the way the contract says, and a second set runs the same flows against the real database.

**Trust is enforced by design, not by prompts:**
- Identity comes only from the signed-in session. No function accepts a user ID or role from the browser or from the model.
- The AI may only call read-only functions and write its own proposal, run and memory tables. It cannot touch business tables.
- Confirmation is an atomic status change plus database unique constraints, so clicking Confirm twice cannot deduct twice.
- Code does the arithmetic: deductions, attendance rates, and date and time-zone conversion (including daylight saving). The model only interprets intent and writes text.
- Student messages and course materials are treated as untrusted text, so instructions hidden inside them cannot change what the agent does.
- Scheduling checks conflicts twice, before the proposal exists and again at confirmation. A batch with any conflict writes nothing, and the teacher is told why.

## Challenges we ran into

- **Making an AI product that is safe to trust.** The hard part was not getting the model to act, it was deciding what it must never be able to do, and then arranging the code so those things are impossible rather than discouraged.
- **Building two halves in parallel.** The agent depends on services that did not exist yet. The contract plus fake services let both sides move independently, but they only work if the fakes are exact, so we tested them against the contract's rules.
- **Time zones.** "Thursday at 4 PM" means different UTC times either side of the autumn clock change. We convert in code and verified the conversion across both offsets.
- **Keeping documents honest.** Contract and handbook details drifted between languages and versions, so we reconciled them and recorded assumptions in a shared handoff log instead of guessing.

## Accomplishments that we're proud of

- A complete product around the AI: containerised app and database, a 14-table schema with migrations, idempotent demo seeding that refuses to run in production, role-based sign-in, per-user isolation on every read and write, and teacher and student workspaces.
- A written contract that two people (and their coding assistants) could build against without stepping on each other.
- Fake services that behave like the real ones, with a repeatable check script covering access isolation, conflicts, attendance and rescheduling rules.
- The headline result: a teacher says one sentence, sees a preview, and confirms once. Confirming twice or in parallel writes once, and the real-database checks (54 of them, plus 400 offline checks) prove it, along with cross-account denial for every new feature.
- A live Agent Console that makes the agent legible: each step lights up, and so does every file it touches.

## What we learned

- For AI products, the interesting engineering is the harness around the model: tool design, permissions, validation and confirmation matter more than the prompt.
- Writing the contract before the code removed most integration surprises.
- "Propose, then confirm" is a small idea that changes how much you can safely let an assistant do.

## What's next for Kora

- Self-service registration, password reset by email, and notifications.
- Assignments and lesson-pack balances (tuition changes were left out on purpose until they can follow the same confirm-first rule).
- Safe corrections to attendance after submission.
- A broader trial with real tutors and a live-model evaluation of the assistant's wording.

## Built with

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL, Prisma, Auth.js, Zod, Docker, DeepSeek (OpenAI-compatible API).

Repository: https://github.com/ZacahryZhou/Kora
