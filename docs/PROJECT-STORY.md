# Kora: Project Story

> Draft for the submission form. Sentences marked **[UPDATE]** describe work that is planned but not finished in the repository yet. Confirm or edit them before submitting so the story only claims what the demo actually shows.

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

Planned AI features, in priority order: attendance by sentence, student materials Q&A with verified citations, course creation, scheduling with conflict detection, material entry, attendance trends, and teacher-only student notes that help with scheduling. **[UPDATE: list only what is working in the demo.]**

## How we built it

**Stack:** Next.js (App Router) with strict TypeScript, Tailwind and shadcn/ui, PostgreSQL with Prisma, Auth.js email/password sign-in, Zod for validation, and Docker Compose so the whole thing runs locally with one command. The model is any OpenAI-compatible API (DeepSeek by default), called with plain `fetch`, with a mock mode for offline demos.

**Two tracks, one contract.** The work is split between two people. One owns the core product (database, sign-in, services, pages); the other owns the AI agent. We agreed on a written API contract first: every service function, input type, return type, error code and permission rule. Each side builds against the contract and neither edits the other's directories.

**Fake services first.** The AI track did not wait for the real services. We wrote in-memory services that follow the contract exactly, including permission checks, time-overlap conflict detection and the attendance and deduction rules, and ran the whole agent flow in a terminal against them. A single file decides whether the agent talks to the fake or the real services, so switching is one import change. A 38-assertion script checks that the fakes behave the way the contract says.

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

- A complete foundation: containerised app and database, a 12-table schema, idempotent demo seeding that refuses to run in production, role-based sign-in, read services with per-user isolation, and teacher and student schedule and course pages.
- A written contract that two people (and their coding assistants) could build against without stepping on each other.
- Fake services that behave like the real ones, with a repeatable check script covering access isolation, conflicts, attendance and rescheduling rules.
- **[UPDATE: add the headline demo result here, for example "an attendance proposal that previews, confirms once, and cannot be applied twice," once it works end to end.]**

## What we learned

- For AI products, the interesting engineering is the harness around the model: tool design, permissions, validation and confirmation matter more than the prompt.
- Writing the contract before the code removed most integration surprises.
- "Propose, then confirm" is a small idea that changes how much you can safely let an assistant do.

## What's next for Kora

- Finish the agent loop, proposals and the in-page assistant panel, then connect them to the real services.
- Student notes that stay teacher-only, lesson preparation, and attendance trends that refuse to guess when there is too little data.
- Manual forms for everything the AI can do, so the product works without it.
- Safe corrections to attendance after submission, and tuition adjustments.

## Built with

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL, Prisma, Auth.js, Zod, Docker, DeepSeek (OpenAI-compatible API).

Repository: https://github.com/ZacahryZhou/Kora
