# Kora: Remaining Development Roadmap

> Covers everything not built yet, in the order to build it. It follows the working rules in `CLAUDE.md` (one step at a time, plan first, verify, one commit per step) and the API contract.
> **Ownership:** the project owner now develops the core-product track (formerly Nick's) and the front end. The AI track stays in `src/features/ai-agent/**`, `src/lib/ai/**`, `src/app/api/ai/**` and `src/contracts/**`. Core steps are marked **[Core]**, AI steps **[AI]**. If one person does both, still keep them as separate commits so a core change never hides inside an AI change.
> Record the ownership change once in `docs/HANDOFF.md` and in the §2 table of `CLAUDE.md` (append-only note) so later sessions do not revert work.

## Status (updated 2026-10-04)

| Phase | Result |
|---|---|
| A1 restore pending proposals after reload | Done |
| A2 add students by name | Done (new `ADD_STUDENT` proposal type) |
| A3 run the 16 manual tests with the real model | **Open: needs the owner's `AI_API_KEY`; the list now has 20 items** |
| A4 demo model covers content entry, notes, trends | Done (lesson preparation needs a real model) |
| A5 story and demo script | Done (`docs/PROJECT-STORY.md`, `docs/DEMO-SCRIPT.md`) |
| B AI rescheduling | Done |
| C student leave requests | Done |
| D progress records | Done |
| E1 calendar, E2 students pages, E3 settings | Done |
| E4 registration and forgot password, E5 notifications, assignments, tuition | **Not started: need the owner's decision** |
| F hardening | Done except the real-model rehearsal and a Docker rebuild on the owner's machine |

## Current state (2026-10-04, before this round)

Done: sign-in, schedules, courses, materials, attendance and deductions, AI attendance, student materials Q&A with verified citations, AI course creation, AI scheduling with conflict checks, AI content entry, attendance trends, teacher-only student notes, lesson preparation, "who am I" and student lookup, live Agent Console, redesigned front end.

Contract facts that shape the plan: `RescheduleInput`, `SaveProgressInput` and `StudentRequestInput` already exist in `src/contracts/inputs.ts`, and `RESCHEDULE`, `PROGRESS_RECORD` and `STUDENT_REQUEST` already exist as proposal types. `rescheduleSession` exists in `src/services/write.ts`. There is **no** table or service for progress records or student requests. The contract is frozen, so only add to it (append rows to §14 and the change log; never rename or delete).

## Rules for every step

1. Plan first: list the files to add or change, then build.
2. Definition of done: `npx tsc --noEmit`, `npx eslint src prisma`, `npm run check:ai`, `npx next build`, then a browser run with one teacher and one student account. For anything that touches permissions, prove cross-account denial with two different accounts.
3. AI never writes business tables (audit grep must stay empty): `grep -rnE "prisma\.[a-zA-Z]+\.(create|update|delete|upsert)" src/lib/ai src/features src/app/api/ai` apart from `agentProposal`, `agentRun`, `agentMemory`.
4. Services are `fn(actor, input) => Promise<Result<T>>`, never throw, and identity comes only from the session.
5. English only for UI, errors, logs and commits. Commit trailers as in the repo history. No secrets in git.
6. Before every push: `git fetch origin main`, merge, re-run the checks.

## Phase A: quick wins (no schema change)

| Step | Track | What | Files | Done when |
|---|---|---|---|---|
| A1 | AI | Restore pending proposal cards after a page reload. On mount, `AiPanel` calls `GET /api/ai/proposals?status=pending` and shows the cards. | `src/features/ai-agent/AiPanel.tsx`, `MessageList.tsx` | Create a proposal, reload, the card is still there; confirm works; another teacher never sees it. |
| A2 | AI | Add students by name. The AI resolves the name with `findMyStudent`, then proposes with that student's email. No contract change. If the name is ambiguous or unknown, it asks. | `src/lib/ai/domain/edu/tools.ts`, `prompts.ts`, `mock-model.ts`, tests | "Add Jordan to Physics" gives a preview naming the email; ambiguous names ask a question. |
| A3 | AI | Run the 16 manual tests in `docs/AI-REPLY-POLICY.md` with the **real model** (`AI_MOCK=0`) and fix what fails. Record results in `docs/HANDOFF.md`. | policy doc, prompts | All 16 pass, or each failure has a fix or a documented limit. |
| A4 | AI | Extend the mock model to cover content entry, student notes, trends and lesson prep so the offline demo shows them. | `src/lib/ai/domain/edu/mock-model.ts`, `mock-check.ts` | Each flow produces the right proposal offline. |
| A5 | Docs | Update every `[UPDATE]` marker in `docs/PROJECT-STORY.md` to match the real demo. Write `docs/DEMO-SCRIPT.md` (3 to 5 minutes: sign-in, attendance proposal and confirm, materials Q&A with citation, access isolation, Agent Console). | `docs/` | The story claims only what the demo shows. |

## Phase B: AI rescheduling (service already exists)

| Step | Track | What | Done when |
|---|---|---|---|
| B1 | AI | Add the `proposeReschedule` tool and a `RESCHEDULE` proposal handler that calls `rescheduleSession`. Code converts the requested date and time; `checkConflicts` runs before the proposal exists and again at confirm. | "Move Oct 10 to Oct 11 at 4 PM" shows a preview; a clash blocks it with the reason; confirm changes the session once. |
| B2 | AI | Tests: `schedule-check` and a new `reschedule-check`; browser run including a conflict and a double confirm. | All pass; the double confirm changes nothing. |

## Phase C: student leave requests

Contract: "A student request creates a pending record only; it does not change the schedule or attendance."

| Step | Track | What | Files | Done when |
|---|---|---|---|---|
| C1 | Core | Add a `StudentRequest` model (id, sessionId, studentId, kind LEAVE or RESCHEDULE, note, preferredStartAt, status PENDING / APPROVED / DECLINED, timestamps) with a Prisma migration. Append the table to the contract's change log. | `prisma/schema.prisma`, `prisma/migrations/**` | `prisma migrate deploy` is clean on a fresh and an existing database. |
| C2 | Core | Services in `src/services/write.ts` and `read.ts`: `submitStudentRequest(actor, StudentRequestInput)` (STUDENT only, session must belong to the student's course, creates PENDING), `listStudentRequests(actor)` (student: own; teacher: those for their courses), `resolveStudentRequest(actor, { requestId, decision })` (TEACHER only, own course). Resolving never edits attendance or the schedule by itself. Append signatures to contract §14. | `src/services/**`, `docs/api-contract.md` | Service checks: cross-student and cross-teacher access denied; duplicate pending request is a `CONFLICT`. |
| C3 | Core | UI: a "Request leave" action on the student's upcoming session, a request list for the student, and a requests inbox for the teacher with Approve and Decline. | `src/app/(student)/**`, `src/app/(teacher)/**`, `src/components/**` | Student submits; teacher sees it; decision shows to both. |
| C4 | AI | Student tool `proposeStudentRequest` ("I need leave next Tuesday", the one write-style tool a student agent may have) and teacher read tool `listStudentRequests`. The student proposal still needs the student's own confirmation. Student memory must not enter this agent. | `tools.ts`, `proposal-types.ts`, `prompts.ts` | Student sentence gives a preview, confirm creates one pending request; a teacher asking "any leave requests?" sees it. |
| C5 | AI | Tests: `student-check`, new `request-check` (isolation, student agent has no memory access, prompt-injection text in the note cannot change tool calls). | | All pass. |

## Phase D: progress records

| Step | Track | What | Done when |
|---|---|---|---|
| D1 | Core | `ProgressRecord` model and migration; `saveProgressRecord(actor, SaveProgressInput)` (TEACHER, own session and enrolled student) and `listProgressRecords`. | Service checks cover isolation and validation. |
| D2 | Core | UI: progress tab on the teacher course page, read-only view for the student's own records. | Teacher saves and both sides can read the right records. |
| D3 | AI | `proposeProgressRecord`: the AI turns a teacher's sentence into goal, output, issue and next action as a draft; the teacher edits and confirms. Code never invents scores. | A sentence gives a draft preview; confirm saves once. |

## Phase E: borrow features from EduSync (choose per item)

Order by risk. Each item is a [Core] page that reads existing data unless noted; reuse the layout in `src/components/page.tsx` and `workspace-shell.tsx`; keep Kora fonts and colours.

| Step | Feature | Schema change | Notes |
|---|---|---|---|
| E1 | Calendar view (week and month) of the existing schedule | No | New `/teacher/calendar` and `/student/calendar`; data from `getTeacherSchedule` and `getStudentWorkspace`. |
| E2 | Students list and student detail for teachers | No | Uses `listMyStudents`, `listAttendance`, `listDeductions`. Teacher-only notes stay in the AI memory path; do not show them here. |
| E3 | Settings page (name, password) | No | New `updateMyProfile` and `changeMyPassword` services; hash with the existing bcrypt setup. |
| E4 | Registration and forgot password | Maybe | Registration needs rules (who may become a teacher); forgot password needs an email service. Decide before starting. |
| E5 | Notifications, assignments, tuition and lesson packs | Yes, new tables | Each is a full feature with its own migration, services, pages and tests. Only start one with the owner's explicit approval. |

When a new page exists, add matching read-only AI tools (for example calendar and student detail) in a separate [AI] commit so the assistant can answer questions about it.

## Phase F: hardening before submission

1. Replace any leftover demo text, remove `/ai-dev` from navigation if it is not needed.
2. Full pass with two teacher accounts and two student accounts: cross-account denial on every new service and page.
3. `docker compose down` and `docker compose up --build` from a clean checkout, then `db:seed` and `db:seed:demo`.
4. Rehearse the demo script once end to end on the real model and once on `AI_MOCK=1`.
5. Update both READMEs, `docs/ROADMAP-zachary.md` and `docs/HANDOFF.md`.

## Suggested order and sizing

1. A1, A2, A5 first (small, user-visible, and A5 unblocks the submission text).
2. A3, A4.
3. B (AI rescheduling).
4. C (leave requests) then D (progress records). Both need a migration: do them one at a time.
5. E1 to E3 if time allows; E4 and E5 only on explicit approval.
6. F last.

If the deadline is close, stop after A and B, then do F. That set is stable, needs no schema change, and covers the required demo line (sign-in, schedules, AI attendance, student materials Q&A, access isolation).

## Cut order if time runs short (cut from the bottom)

E5, E4, D, C, E3, E2, E1, B, A4. Never cut A5, F, or any access-isolation check.
