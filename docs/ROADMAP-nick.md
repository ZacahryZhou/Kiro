# Nick Development Roadmap (Core Product) — Detailed

> Before starting, read `CLAUDE.md`, `docs/api-contract.md`, and `docs/HANDOFF.md`. Match all names and fields exactly to the contract.
> Rule: work on one roadmap substep at a time (for example, N1.2). Verify it before moving on. Give a plan before each step.
> Commit and push about every 30 minutes. If blocked for more than 30 minutes, or the same error remains after two attempts, stop and ask Zachary.
> Edit only your assigned directories (see §2 of `CLAUDE.md`). If a function or field is missing from the contract, request it in §14; do not invent it.
> Product goal: after signing in, teachers and students see their own schedules, courses, materials, and attendance; Zachary integrates the AI panel into the pages.

## Target directory structure (follow this layout)
```
prisma/schema.prisma  seed.ts
src/lib/db/prisma.ts                 Prisma singleton
src/lib/auth/                        Auth.js config, actor.ts (requireActor)
src/services/read.ts  write.ts       All service functions (return Result<T>)
src/services/helpers.ts              Shared time-overlap and access checks (optional)
src/app/login/page.tsx
src/app/(teacher)/layout.tsx         Teacher layout (add one <AiPanel/> line here)
src/app/(teacher)/teacher/page.tsx                Schedule
src/app/(teacher)/teacher/courses/page.tsx        Course list + course creation
src/app/(teacher)/teacher/courses/[id]/page.tsx   Course details (students/sessions/materials/attendance)
src/app/(student)/layout.tsx         Student layout (add one <AiPanel/> line here)
src/app/(student)/student/page.tsx                My courses and schedule
src/app/(student)/student/courses/[id]/page.tsx   Course materials
src/components/**                    Shared components
```

---

## N1 Get the project running (H0–1.5) — the easiest place to get stuck; Zachary should keep an eye on it

**N1.1 Create the project scaffold (20 min)**
- From the repository root, run `npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --no-turbopack` (keep existing files if prompted).
- Run `npx shadcn@latest init`, then add components: `npx shadcn@latest add button input label card table dialog select tabs badge textarea`.
- Install dependencies: `npm i prisma @prisma/client zod next-auth@beta bcryptjs` and `npm i -D @types/bcryptjs tsx`.
- Add scripts to `package.json`: `"db:seed": "tsx prisma/seed.ts"` and `"db:seed:demo": "tsx prisma/seed-ai.ts"`.
- Acceptance: `npm run dev` opens the default page at localhost:3000.
- Commit and push. **Install all package.json dependencies in this step** so other contributors do not need to change dependencies later.

**N1.2 Start Docker (30 min; most likely to block)**
- The repository includes `Dockerfile`, `docker-compose.yml`, and `.env.example`. Copy `.env.example` to `.env`.
- Start only the database first: `docker compose up db` (wait for "database system is ready").
- Then start the full stack: `docker compose up --build`.
- If blocked, share the full error with the AI. **If it is still blocked after 30 minutes, ask Zachary.**
- Acceptance: `npm run dev` opens the default page at localhost:3000.

**N1.3 Database schema (30 min)**
- Run `npx prisma init` and implement `schema.prisma` according to §2 of the contract: User, Course, Enrollment, Session, SessionChange, Attendance, Deduction, CourseUnit, Material, and **AgentRun, AgentProposal, AgentMemory** (create the last three tables only; no service functions).
- Use the enums in §1.3 of the contract; IDs use `@default(cuid())`; fields use `DateTime`; money uses `Int`.
- Unique constraints: Enrollment(courseId,studentId), Attendance(sessionId,studentId), Deduction(sessionId,studentId); add a Session index on (courseId,startAt).
- `npx prisma migrate dev --name init`
- Implement the Prisma singleton in `src/lib/db/prisma.ts`.
- Acceptance: `npm run dev` opens the default page at localhost:3000.
- Push immediately when complete and add a HANDOFF entry for Zachary (he needs the schema).

**N1.4 Seed accounts (15 min)**
- In `prisma/seed.ts`, create the two contract teachers and three students with `@example.test` emails. Use bcrypt hashes; keep the password only in the seed file.
- Make the seed idempotent with upsert. Exit immediately when `NODE_ENV=production`.
- Acceptance: `npm run dev` opens the default page at localhost:3000.

**N1.5 Sign-in (40 min)**
- Auth.js email/password credentials; include userId and role in the session.
- In `src/lib/auth/actor.ts`, `requireActor()` reads `{userId, role}` from the session and redirects or returns UNAUTHENTICATED when signed out.
- `/login` page: email, password, sign-in button, and English error messages.
- Redirect after sign-in: TEACHER → `/teacher`, STUDENT → `/student`; deny access to the other role's area.
- Acceptance: `npm run dev` opens the default page at localhost:3000.
- **After all N1 steps are complete, push and notify Zachary in HANDOFF.**

---

## N2 Read-only functions and schedule pages (1.5–3)

**N2.1 Read services (`src/services/read.ts`)** — all return `Result<T>`; import types from `src/contracts/views.ts` (Zachary will push it; until then, define contract-matching types in this file and consolidate later).
- `listMyCourses(actor)`: teachers get their courses; students get courses they joined; return CourseView[] including teacherName and studentCount.
- `getTeacherSchedule(actor, {from,to,courseId?})`: teachers only; own courses only; sort by startAt ascending; limit 200.
- `listMyStudents(actor, {courseId})`: teacher only, and the course must belong to them; otherwise FORBIDDEN.
- `getCourseMaterials(actor, {courseId})`: teachers get their own courses; students get enrolled courses; return units and materials ordered by order.
- `getStudentWorkspace(actor, {from,to})`: student only; return only their courses, sessions, and attendance.
- Access rule: unauthorized requests always return FORBIDDEN without revealing other users' data.
- Acceptance: `npm run dev` opens the default page at localhost:3000.

**N2.2 Teacher schedule page `/teacher`**
- Top controls: switch between this week and next week. Group sessions by date and show time (in `APP_TZ`), course name, and status badge (Scheduled/Rescheduled/Cancelled/Completed).
- Each session links to `/teacher/courses/[id]`.
- Empty-state message: "No sessions yet. Ask the AI assistant to create a course."
- Acceptance: `npm run dev` opens the default page at localhost:3000.

**N2.3 Student page `/student`**
- Show the student's courses and upcoming sessions; course links open `/student/courses/[id]`.
- Acceptance: `npm run dev` opens the default page at localhost:3000.

**N2.4 Teacher course detail skeleton `/teacher/courses/[id]`**
- Use tabs: Students / Sessions / Materials / Attendance. Initially implement read-only Students and Sessions tabs; show placeholders in the others.

- **After N2 is complete, push and add a HANDOFF entry (H3 checkpoint: Zachary replaces fake read services with these real services).**

---

## N3 Course creation, enrollment, and scheduling (3–5)

**N3.1 Write service functions (`src/services/write.ts`)**
- `createCourse(actor, CreateCourseInput)` → `{courseId}`: teacher only; validate inputs with Zod from `src/contracts/inputs.ts`.
- `addExistingStudentToCourse(actor, {courseId,email})` → `{enrollmentId, alreadyJoined}`: if no student account matches, return NOT_FOUND with "No student account is registered with this email."; if already enrolled, return `alreadyJoined:true` without duplicates.
- Conflict helper: intervals overlap when start < other end and end > other start. Check all sessions for the teacher and sessions in other courses for students enrolled in the target course.
- `checkConflicts(actor, input)` (in read.ts) → ConflictView[].
- `createSessions(actor, CreateSessionsInput)`: check every session, including overlaps within the batch. If any conflict exists, write none and return `CONFLICT` with `details: ConflictView[]`. Write all sessions in a transaction only when every check passes; new status is SCHEDULED.
- Acceptance: `npm run dev` opens the default page at localhost:3000.

**N3.2 Manual forms (basic entry points outside AI)**
- `/teacher/courses`: course list and a "Create course" dialog (name, subject, type, location, description, price per session).
- Course detail Students tab: email input and an "Add student" button with English error messages.
- Course detail Sessions tab: batch-scheduling form (date, start time, duration, number of weeks); show conflicts and do not submit when conflicts exist.
- Acceptance: `npm run dev` opens the default page at localhost:3000.

- **After N3 is complete, push and notify Zachary in HANDOFF.**

---

## N4 Attendance and lesson deductions (5–6.5)

**N4.1 `confirmAttendance` (follow contract §6.1 exactly)**
- Teacher only; the session must belong to their course. Status must be SCHEDULED or RESCHEDULED.
- `records` must cover **every enrolled student**. Missing students return VALIDATION: "Attendance is still missing for N students."
- Transaction: write Attendance; create one Deduction for PRESENT/ABSENT (amount = course price per session, reason = status); create none for LEAVE; set the session to COMPLETED; write one SessionChange.
- Repeated identical calls return the existing result without duplicate records. A different status after completion returns CONFLICT: "Attendance has been submitted and cannot be changed yet."
- `listAttendance` and `listDeductions` (read.ts): teachers see their own courses; students see only their own records.
- Acceptance: `npm run dev` opens the default page at localhost:3000.

**N4.2 Attendance UI**
- In the course detail Sessions tab, add a "Mark attendance" action for scheduled sessions. List every student and offer Present / Leave / Absent choices.
- Attendance tab: show each student's status and deduction by session.
- Student page: show the student's attendance records.
- Acceptance: `npm run dev` opens the default page at localhost:3000.

- **After N4 is complete, push and add a HANDOFF entry (H6 checkpoint: Zachary replaces fake write services with real services).**

---

## N5 Materials, rescheduling, and AI entry points (6.5–8)

**N5.1 Course materials**
- `createCourseUnit(actor, {courseId,title,order?})` and `addMaterial(actor, {unitId,title,kind,content?,url?})`: teachers may only manage their own courses.
- Course detail Materials tab: create units and add text materials (title + body) or links.
- `/student/courses/[id]`: students can read all units and full material text.
- Acceptance: `npm run dev` opens the default page at localhost:3000.

**N5.2 Rescheduling (may be downgraded)**
- `rescheduleSession(actor, {sessionId,newStartAt})`: check conflicts excluding the current session; conflicts return CONFLICT without changes; success stores originalStartAt, updates startAt, sets RESCHEDULED, and writes SessionChange. No deduction is created.
- Add a "Reschedule" action and new-time picker beside each session.
- Acceptance: `npm run dev` opens the default page at localhost:3000.

**N5.3 AI entry point (wait until Zachary confirms the component is ready)**
- Add one line each to `(teacher)/layout.tsx` and `(student)/layout.tsx`: `<AiPanel role="TEACHER" />` / `<AiPanel role="STUDENT" />` (from `src/features/ai-agent`).
- Placement: right-side drawer or bottom of the page. After confirmation, the page must refresh and show new data (`router.refresh()` is handled inside AiPanel).
- Acceptance: `npm run dev` opens the default page at localhost:3000.

---

## N6 Final polish (after step 8)
- UI polish: consistent English copy, empty states, error messages, and a usable mobile layout.
- `README.md`: project overview, local startup instructions (`docker compose up --build`), and demo account emails (no passwords).
- Clean-environment check: `docker compose down -v` to remove data → `docker compose up --build` → `npm run db:seed` → verify sign-in.
- Before the demo, run acceptance scenarios 1–5 in §13 of the contract.

---

## What to cut if time is limited
- Cut in this order: N5.2 rescheduling → N6 polish → simplify N3.2 batch scheduling to one session at a time.
- **Do not cut:** N1 sign-in, N2 read-only pages, N3.1 course/enrollment/scheduling services, N4 attendance/deductions, N5.1 materials, or N5.3 AI entry point.
- Manual forms can be reduced to just "Create Course" and "Take Attendance"; let AI proposals handle the rest.
