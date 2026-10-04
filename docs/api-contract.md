# EduSync API Contract v0.4 (includes AgentMemory; review with Nick during H0–1, then freeze)

> Source: PRD v1.4 AI-focused revision 4. This file lives at `docs/api-contract.md`.
> **After the contract is frozen, only add to it.** To request an addition, first record it in §14 (Change Log), get confirmation from the other owner, then have the owner implement it.
> Items marked ★ are **defaults**. They may be changed during H0 discussion; freeze the contract after that discussion.

---

## 0. Global rules
1. **actor comes only from the sign-in session:** `requireActor()` (Nick, `src/lib/auth/actor.ts`). No function or route accepts userId / role from the client or model.
2. **AI may call read-only functions and write AgentProposal only.** Business data is written only after the teacher confirms, when Zachary's confirmation endpoint calls Nick's write function.
3. **Nick's service functions do not access AgentProposal.** Manual forms and the AI confirmation endpoint call the same service functions.
4. All service functions return `Result<T>` and **never throw to callers**.
5. Store secrets only in `.env`.

## 1. General conventions

### 1.1 Types (`src/contracts/common.ts`)
```ts
export type Role = "TEACHER" | "STUDENT";
export type Actor = { userId: string; role: Role };
export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "INTERNAL";
export type ServiceError = { code: ErrorCode; message: string; details?: unknown }; // English message, safe to display
export type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError };
```
### 1.2 IDs, time, and money
- ★ **IDs:** strings (Prisma `cuid()`), never numbers.
- ★ **Time:** all API values are **ISO 8601 UTC strings** (for example, `"2026-10-08T23:00:00.000Z"`). Store UTC in the database.
- ★ **Time zone:** default to `America/Vancouver` (`APP_TZ`). Convert page display and AI interpretation of phrases such as "Thursday at 4 PM" using this zone; **AI proposals must store the converted UTC time**.
- **Money:** integer cents (`pricePerSessionCents`), never decimals.
- ★ **List limit:** each read function returns at most 200 records; no pagination.
- **Enum values are uppercase English.** Display them in English in the UI.

### 1.3 Enums
```
Role: TEACHER | STUDENT
CourseType: ONE_ON_ONE | SMALL_CLASS
SessionStatus: SCHEDULED | RESCHEDULED | CANCELLED | COMPLETED
AttendanceStatus: PRESENT | LEAVE | ABSENT
MaterialKind: TEXT | LINK
MemoryKind: AVAILABILITY | NOTE
ProposalStatus: pending | confirmed | executed | failed | discarded
ProposalType: CREATE_COURSE | CREATE_SESSIONS | ADD_CONTENT | MARK_ATTENDANCE | RESCHEDULE | PROGRESS_RECORD | STUDENT_REQUEST | ADD_STUDENT_NOTE
```

---

## 2. Database tables (Nick implements `schema.prisma`)
(Fields follow v0.1, with these additional constraints.)
- User: unique email; role; passwordHash (Auth.js credentials sign-in).
- Course: teacherId, name, subject, type, optional location and description, pricePerSessionCents (default 0).
- Enrollment: **unique (courseId, studentId)**.
- Session: courseId, startAt, durationMin, optional location/linkUrl, status, optional originalStartAt. **Index (courseId, startAt).**
- SessionChange: sessionId, changedById, fromStatus, toStatus, optional oldStartAt/newStartAt, createdAt.
- Attendance: **unique (sessionId, studentId)**; status; markedById; markedAt.
- Deduction: **unique (sessionId, studentId)**; courseId; amountCents; reason (PRESENT|ABSENT); createdAt.
- CourseUnit: courseId, title, order.
- Material: unitId, title, kind, optional content/url (TEXT requires content; LINK requires url).
- AgentRun: actorId, role, intentSummary, toolCalls (Json), status (OK|ERROR), optional error, createdAt.
- AgentProposal: type, actorId, optional courseId, payload (Json), summary (a one-line UI message), status, optional result (Json), error, createdAt, confirmedAt, executedAt.
- **AgentMemory** (Nick creates the table and migration only; **no service functions**. Zachary's AI code owns all reads and writes): id, courseId, studentId, teacherId, kind (AVAILABILITY|NOTE), content (string, max 500 characters), createdAt. Index (teacherId, studentId). Visible to teachers only; no student endpoint may return it.
- Deletion policy: ★ The MVP has no deletion feature (no cascade-delete design).

---

## 3. View types (place in `src/contracts/views.ts`; shared by Nick's functions/pages and Zachary's AI)
```ts
export type CourseView = {
  id: string; name: string; subject: string; type: "ONE_ON_ONE"|"SMALL_CLASS";
  location?: string; description?: string; teacherName: string; studentCount: number;
};
export type SessionView = {
  id: string; courseId: string; courseName: string;
  startAt: string; durationMin: number; location?: string; linkUrl?: string;
  status: "SCHEDULED"|"RESCHEDULED"|"CANCELLED"|"COMPLETED"; originalStartAt?: string;
};
export type StudentView = { id: string; name: string; email: string };
export type AttendanceView = {
  id: string; sessionId: string; courseId: string; sessionStartAt: string;
  studentId: string; studentName: string; status: "PRESENT"|"LEAVE"|"ABSENT"; markedAt: string;
};
export type DeductionView = {
  id: string; sessionId: string; courseId: string; studentId: string; studentName: string;
  amountCents: number; reason: "PRESENT"|"ABSENT"; createdAt: string;
};
export type MaterialView = { id: string; unitId: string; title: string; kind: "TEXT"|"LINK"; content?: string; url?: string };
export type UnitView = { id: string; courseId: string; title: string; order: number; materials: MaterialView[] };
export type ConflictView = { sessionId: string; courseName: string; startAt: string; durationMin: number; withStudentId?: string };
```

---

## 4. Input types (`src/contracts/inputs.ts`, Zod; shared by forms and AI)
```ts
const id = z.string().min(1);
const utc = z.string().datetime();           // ISO UTC

export const CreateCourseInput = z.object({
  name: z.string().min(1).max(80), subject: z.string().min(1).max(40),
  type: z.enum(["ONE_ON_ONE","SMALL_CLASS"]),
  location: z.string().max(120).optional(), description: z.string().max(500).optional(),
  pricePerSessionCents: z.number().int().nonnegative().default(0),
});
export const AddStudentInput = z.object({ courseId: id, email: z.string().email() });
export const CreateSessionsInput = z.object({
  courseId: id,
  sessions: z.array(z.object({
    startAt: utc, durationMin: z.number().int().min(15).max(480),
    location: z.string().max(120).optional(), linkUrl: z.string().url().optional(),
  })).min(1).max(30),
});
export const CreateUnitInput = z.object({ courseId: id, title: z.string().min(1).max(80), order: z.number().int().optional() });
export const AddMaterialInput = z.object({
  unitId: id, title: z.string().min(1).max(80), kind: z.enum(["TEXT","LINK"]),
  content: z.string().max(20000).optional(), url: z.string().url().optional(),
}).refine(v => (v.kind==="TEXT" ? !!v.content : !!v.url), "TEXT requires content; LINK requires a URL");
export const ConfirmAttendanceInput = z.object({
  sessionId: id,
  records: z.array(z.object({ studentId: id, status: z.enum(["PRESENT","LEAVE","ABSENT"]) })).min(1),
});
export const RescheduleInput = z.object({ sessionId: id, newStartAt: utc });
export const CheckConflictsInput = z.object({
  courseId: id, startAt: utc, durationMin: z.number().int().positive(), excludeSessionId: id.optional(),
});
// Tier B
export const SaveProgressInput = z.object({
  sessionId: id, studentId: id, goal: z.string().min(1), output: z.string().min(1),
  issue: z.string().optional(), nextAction: z.enum(["PRACTICE","REVIEW","EXTRA_MATERIAL","RECAP_NEXT"]), note: z.string().optional(),
});
export const AddStudentNoteInput = z.object({
  courseId: id, studentId: id, kind: z.enum(["AVAILABILITY","NOTE"]), content: z.string().min(1).max(500),
});
export const StudentRequestInput = z.object({
  sessionId: id, kind: z.enum(["LEAVE","RESCHEDULE"]), note: z.string().max(300).optional(), preferredStartAt: utc.optional(),
});
```

---

## 5. Read functions (Nick implements; AI may call directly) — `src/services/read.ts`
| Function | Input | Returned `data` | Access / rules |
|---|---|---|---|
| `listMyCourses(actor)` ★new | — | `{ courses: CourseView[] }` | Teachers: own courses; students: enrolled courses |
| `getTeacherSchedule(actor,{from,to,courseId?})` | UTC range | `{ sessions: SessionView[] }`, ordered by startAt | TEACHER only; own courses only; includes all session statuses for display |
| `listMyStudents(actor,{courseId})` | | `{ students: StudentView[] }` | TEACHER only, and the course must belong to them |
| `listAttendance(actor,{courseId?,sessionId?,studentId?,from?,to?,status?})` | | `{ records: AttendanceView[] }` | Teachers: within own courses; students: **own records only** (ignore supplied studentId) |
| `listDeductions(actor,{courseId?,sessionId?,studentId?})` | | `{ records: DeductionView[] }` | Same as above |
| `getCourseMaterials(actor,{courseId})` | | `{ units: UnitView[] }`, ordered by order | Teachers: own courses; students: enrolled courses; otherwise FORBIDDEN |
| `checkConflicts(actor,CheckConflictsInput)` | | `{ conflicts: ConflictView[] }` | TEACHER only; check overlaps across the teacher's courses and other courses attended by students enrolled in this course |
| `getStudentWorkspace(actor,{from,to})` | | `{ courses: CourseView[]; sessions: SessionView[]; attendance: AttendanceView[] }` | STUDENT only; current student's data only |

Rule: unauthorized access **always returns `FORBIDDEN`** (a nonexistent course returns NOT_FOUND, but messages must not reveal another user's data).

---

## 6. Write functions (Nick implements; shared by forms and AI confirmation) — `src/services/write.ts`
| Function | Input | `data` | Rules and idempotency |
|---|---|---|---|
| `createCourse(actor, CreateCourseInput)` | | `{ courseId }` | TEACHER only; ★ a teacher may create courses with duplicate names |
| `addExistingStudentToCourse(actor, AddStudentInput)` | | `{ enrollmentId; alreadyJoined: boolean }` | Course must belong to the teacher; email must match a role=STUDENT account, otherwise `NOT_FOUND` (message: "No student account is registered with this email."); if already enrolled, return `alreadyJoined:true` |
| `createSessions(actor, CreateSessionsInput)` | | `{ sessionIds: string[] }` | Check conflicts for **every session**, including conflicts within the batch. If any conflict exists, write nothing and return `CONFLICT` with `details: ConflictView[]`. If all pass, write in a transaction with status SCHEDULED. |
| `createCourseUnit(actor, CreateUnitInput)` | | `{ unitId }` | Course must belong to the teacher; default order is current max + 1 |
| `addMaterial(actor, AddMaterialInput)` | | `{ materialId }` | The unit's course must belong to the teacher |
| `confirmAttendance(actor, ConfirmAttendanceInput)` | | `{ attendance: AttendanceView[]; deductions: DeductionView[]; sessionStatus }` | See §6.1 |
| `rescheduleSession(actor, RescheduleInput)` | | `{ sessionId; oldStartAt; newStartAt }` | See §6.2 |
| Tier B: `saveProgressRecord(actor, SaveProgressInput)` / `submitStudentRequest(actor, StudentRequestInput)` | | | A student request creates a pending record only; it does not change the schedule or attendance |

### 6.1 Exact `confirmAttendance` rules ★
1. TEACHER only, and the session must belong to one of their courses.
2. `session.status` must be `SCHEDULED` or `RESCHEDULED`; otherwise return `CONFLICT` ("This session is already completed or cancelled.").
3. Every studentId in `records` must be an **enrolled** student in the course, or the whole request returns `VALIDATION`. ★ Records must cover every enrolled student; missing students return `VALIDATION` ("Attendance is still missing for N students.").
4. In one transaction: write Attendance (unique (sessionId, studentId)); write one Deduction for each `PRESENT` or `ABSENT` record (amount = course.pricePerSessionCents, reason = corresponding status); do not write a deduction for `LEAVE`; then set session.status to `COMPLETED` and write one SessionChange.
5. **Repeated call:** if the session is already COMPLETED and Attendance exists, return the existing result (`ok:true`) without writing or deducting again.
6. ★ **Editing attendance after submission** (for example, changing absent to leave) is **not supported in the MVP**. Submitting different statuses for a completed session returns `CONFLICT` ("Attendance has been submitted and cannot be changed yet."). Corrections are P1.

### 6.2 Exact `rescheduleSession` rules ★
1. TEACHER only, and the session must belong to one of their courses.
2. Check conflicts for the new time, excluding the session itself. If a conflict exists, return `CONFLICT` with `details` and write nothing.
3. If there is no conflict, set `originalStartAt` to the old `startAt` only if empty; set `startAt = newStartAt` and status to `RESCHEDULED`; write SessionChange.
4. Rescheduling **does not** create a deduction.


### 6.3 Two-stage conflict handling ★ (confirmed: reject the entire batch and explain why)
- **Stage 1 (before proposal creation):** AI calls `checkConflicts` and marks each session in the preview ✅/❌ with the reason (for example, "Oct 14 at 4:00 PM conflicts with Grade 8 Physics 1:1 (Jordan Lee)"). If there is a conflict, **do not create a proposal**; ask the teacher how to adjust it.
- **Stage 2 (on confirmation):** the service function checks again. If a conflict is found, return `CONFLICT` with `details: ConflictView[]`, **write none of the sessions**, mark the proposal `failed`, and show "X conflicts with Y. The schedule was not changed."
- Never partially create sessions or silently skip conflicting sessions.

---

## 7. Access-control matrix (verify each row during testing)
| Scenario | Expected result |
|---|---|
| Teacher A reads Teacher B's courses/students/attendance/materials |
| Student reads another student's attendance or course materials |
| Student calls any write function
| Teacher A marks attendance, reschedules, or schedules a session for Teacher B's course |
| Teacher A adds an email with no registered account to a course |
| Proposal actorId differs from the signed-in user |

---

## 8. Proposal types (Zachary, `src/contracts/proposals.ts`)
| Type | Payload | Confirmation call | Example `summary` |
|---|---|---|---|
| CREATE_COURSE |
| CREATE_SESSIONS |
| ADD_CONTENT |
| MARK_ATTENDANCE |
| RESCHEDULE |
| PROGRESS_RECORD (Tier B) |
| STUDENT_REQUEST (Tier B) |
| ADD_STUDENT_NOTE (optional) |
| ADD_STUDENT (added in v0.6) |

When **creating a proposal**, validate it with the matching Zod schema and preflight with read-only functions such as `checkConflicts` / `listMyStudents` (for example, verify that a student is enrolled in the course). If validation fails, do not create the proposal; have the AI ask the teacher for clarification.

Student memory rule: only teacher Agents may read AgentMemory; it must **never enter a student Agent's context**. Treat it only as a reference for scheduling and lesson preparation; `checkConflicts` always determines whether a conflict exists.

★ `CREATE_COURSE` is **not rolled back as a whole** during confirmation: the course remains created if an email is unregistered. Return partial success with per-email results, set status to `executed`, and list failures in `result`.

---

## 9. Your API endpoints (Zachary, `src/app/api/ai/**`)
All endpoints return JSON. Unauthenticated requests return 401.

| Endpoint | Request | Response |
|---|---|---|
| `POST /api/ai/chat` | `{ message: string; history?: {role:"user"|"assistant"; content:string}[] }` (★ the client sends the latest 10 history items as conversation context only; they contain no identity information) | `{ reply: string; proposals?: ProposalView[]; citations?: Citation[] }` |
| `GET /api/ai/proposals?status=pending` | | `{ proposals: ProposalView[] }` (current user only) |
| `POST /api/ai/proposals/:id/confirm` | no body | `{ status: "executed"|"failed"; result?: unknown; error?: ServiceError }` |
| `POST /api/ai/proposals/:id/discard` | no body | `{ status: "discarded" }` |

```ts
type ProposalView = { id: string; type: ProposalType; summary: string; payload: unknown; status: ProposalStatus; createdAt: string };
type Citation = { materialId: string; unitId: string; title: string; quote: string };
```
**Confirmation endpoint flow** (guarantees at-most-once execution):
1. Call `requireActor()`; load the proposal and verify `proposal.actorId === actor.userId` and `status === "pending"`. If it is already executed/failed, return the existing result.
2. Atomically update `pending → confirmed` (`updateMany where {id, status:"pending"}`). If zero rows were updated, return the existing result.
3. Validate the payload with Zod, then call the service function defined in §8.
4. On success, set status to `executed` and return result; on failure, set status to `failed` and return error.

---

## 10. Integrating the AI panel (ownership boundaries)
- Zachary exports `<AiPanel role="TEACHER" | "STUDENT" />` from `src/features/ai-agent/index.ts`.
- **Nick adds one line to each teacher/student layout** (`src/app/(teacher)/layout.tsx` and `(student)/layout.tsx`) to reference the panel. Nick chooses the placement (right-side drawer or page bottom) and does not otherwise edit `features/ai-agent`.
- Nick-owned routes: `/login`, `/teacher` (schedule), `/teacher/courses/[id]` (students, materials, attendance), `/student` (courses), and `/student/courses/[id]` (materials).
- The proposal confirmation UI lives inside `<AiPanel />` (Zachary). After teacher confirmation, AiPanel calls `router.refresh()` so the schedule shows the new data.

---

## 11. Seed data (specific examples)
**`prisma/seed.ts` (Nick)** — `npm run db:seed` creates accounts only; no courses:
| Role | Name | Email |
|---|---|---|
| TEACHER | Alex Morgan |
| TEACHER | Taylor Chen |
| STUDENT | Jordan Lee |
| STUDENT | Sam Patel |
| STUDENT | Casey Kim |
Keep the demo password in the seed file (never in docs or chat).

**`prisma/seed-ai.ts` (Zachary)** — `npm run db:seed:demo` adds the following data to those accounts for demo recovery and integration testing:
- Course A, "Grade 8 Math Small Group" (Alex Morgan; Jordan Lee and Sam Patel): two units; materials contain **verifiable facts** for citations and deliberately **omit** the quadratic vertex formula to test the "not found" response.
- Course B, "Grade 8 Physics 1:1" (Alex Morgan; Jordan Lee): one session overlaps Course A next Tuesday at 4 PM to test conflict detection.
- Course C, "Grade 10 English 1:1" (Taylor Chen; Casey Kim): used to verify Alex Morgan’s AI **cannot access Casey Lee**.
- Sessions: each course has completed sessions (with attendance and deductions) and scheduled sessions for this and next week.
- AgentMemory examples: Jordan Lee is unavailable Tuesday/Thursday afternoons (AVAILABILITY); Sam Patel struggles with functions (NOTE).
- Both scripts are idempotent and refuse to run when `NODE_ENV=production`.

**Local demo login update (2026-10-03):** At the project owner's request, the baseline `prisma/seed.ts` login now contains only Demo Teacher (`t@example.test`) and Demo Student (`s@example.test`), with one shared demonstration password stored only in that seed file. It creates no courses. The multi-person identities above and in the acceptance scenarios are optional AI integration fixtures, not baseline demo sign-in accounts. When reseeding an existing local database, only obsolete seed accounts are removed; foreign-key restrictions prevent removal if they have linked data.

---

## 12. Environment variables (`.env.example`, maintained by Nick)
```
DATABASE_URL=postgresql://edusync:edusync@db:5432/edusync
AUTH_SECRET=change-me
AUTH_URL=http://localhost:3000
APP_TZ=America/Vancouver
AI_BASE_URL=https://api.deepseek.com
AI_API_KEY=
AI_MODEL=
AI_MOCK=0
```

---

## 13. Acceptance scenarios (all are required for completion)
**Required flow**
1. Alex Morgan signs in → the schedule shows their courses and none of Taylor Chen’s courses.
2. Alex Morgan tells the AI, "Jordan attended math today; Sam is on leave" → a **per-student attendance preview** appears; the attendance page **does not change yet** → confirm → the attendance page has two records and one deduction (Jordan); **confirm again** → no additional records.
3. Jordan Lee signs in → the student course page shows only Jordan’s courses.
4. Jordan asks a question answered by the materials → response includes citations; Jordan asks for the quadratic vertex formula → response says it was not found.
5. Taylor Chen signs in → cannot see Alex Morgan’s students or courses; Taylor asks the AI for Jordan’s attendance this week → no data is returned.
**Starting from an empty database (first three Tier B scenarios)**
6. Empty database → Alex says "Create a weekend math group and add Jordan and Sam" → preview → confirm → course appears on the schedule; show a clear message if a student email is not registered.
7. "Schedule one 60-minute session for this group next Tuesday and Thursday" → preview (including conflicts) → confirm → two sessions appear; conflicting sessions are not written and the reason is explained.
8. Paste "Create the first unit and add this text" → preview → confirm → material appears; Jordan can ask questions about it.
9. (Optional) Alex says "Remember that Jordan is unavailable Tuesday and Thursday afternoons" → preview → confirm → later asks "Schedule next week for math" and the AI avoids those times; Jordan signs in and asks "What notes do you have about me?" → no memory is returned.

---

## 14. Change log (append-only)
| Time | Requester | Change | Confirmed |
|---|---|---|---|
| H0 | Zachary | v0.4: add AgentMemory table (Nick creates table only), ADD_STUDENT_NOTE proposal, MemoryKind, acceptance scenario 9, and memory seed examples | Pending |
| H0 | Zachary | v0.2: add return types, all input types, access-control matrix, confirmation rules, API endpoints, panel integration, detailed seed data, acceptance scenarios, and new `listMyCourses` function | Pending |
| 2026-10-03 | Project owner | Update baseline local demo logins to one teacher (`t@example.test`) and one student (`s@example.test`); keep the shared password in `prisma/seed.ts` only | Confirmed |
| 2026-10-03 | Zachary | v0.5 (additive): `ProposalView` gains optional `preview?: string[]` (readable preview lines computed by code) so the AI panel can show per-student and per-session details. No existing field changed. | Pending |
| 2026-10-04 | Project owner (front end and core) | v0.6 (additive): new proposal type `ADD_STUDENT` (payload `AddStudentInput`, runs `addExistingStudentToCourse`); `ProposalType` DB enum gains `ADD_STUDENT`. | Confirmed |
| 2026-10-04 | Project owner | v0.6 (additive): table `StudentRequest`; view `StudentRequestView`; input `ResolveStudentRequestInput`; functions `submitStudentRequest(actor, StudentRequestInput)` (STUDENT; creates a PENDING record only), `listStudentRequests(actor, { status? })` (student: own; teacher: own courses) and `resolveStudentRequest(actor, ResolveStudentRequestInput)` (TEACHER of the course; never edits schedule or attendance). `STUDENT_REQUEST` proposals now run `submitStudentRequest`. | Confirmed |
| 2026-10-04 | Project owner | v0.6 (additive): table `ProgressRecord` (one per session and student); view `ProgressRecordView` (`note` is never returned to students); functions `saveProgressRecord(actor, SaveProgressInput)` (TEACHER; session must have started) and `listProgressRecords(actor, { courseId?, studentId?, sessionId? })`. `PROGRESS_RECORD` proposals now run `saveProgressRecord`. | Confirmed |
| 2026-10-04 | Project owner | v0.6 (additive): `RESCHEDULE` proposals now run `rescheduleSession`; account functions `getMyAccount(actor)`, `updateMyProfile(actor, UpdateProfileInput)` and `changeMyPassword(actor, ChangePasswordInput)` (identity from the session only). | Confirmed |
| 2026-10-05 | Project owner | v0.7 (additive): table `DashboardLayout`; proposal type `DASHBOARD_LAYOUT` (payload `DashboardLayoutInput`); contract file `src/contracts/dashboard.ts` (widget catalog, themes, motions, `DashboardLayoutView`); functions in `src/services/dashboard.ts`: `listMyLayouts(actor)`, `getActiveLayout(actor)`, `saveDashboardLayout(actor, DashboardLayoutInput)` (replaces a layout of the same name and makes it active), `activateDashboardLayout(actor, { layoutId \| null })`, `deleteDashboardLayout(actor, { layoutId })`. TEACHER only; every course and student a widget points at must belong to the teacher. `DASHBOARD_LAYOUT` proposals run `saveDashboardLayout`. | Confirmed |
| 2026-10-05 | Project owner | v0.7 (additive): `addMaterialsFromFile(actor, { unitId, fileName, bytes, title? })` (TEACHER of the unit; reads .txt, .md, .pdf or .docx up to 8 MB and creates one or more TEXT materials, all or nothing; only the text is stored) and `deleteMaterial(actor, { materialId })` (TEACHER of the course) in `src/services/materials-upload.ts`. New dependencies: `unpdf`, `mammoth` (and `jszip` for test fixtures), `react-grid-layout`. | Confirmed |
| 2026-10-05 | Project owner | v0.7 (additive): tables `Quiz` and `QuizQuestion`; proposal type `QUIZ` (payload `CreateQuizInput`); contract file `src/contracts/quiz.ts`; functions in `src/services/quiz.ts`: `createQuiz(actor, CreateQuizInput)` (TEACHER of the course; saves a draft; every cited material must belong to the course), `listMyQuizzes(actor, { courseId? })` (TEACHER; includes the answer key), `listStudentQuizzes(actor, { courseId? })` (STUDENT; published quizzes of enrolled courses, never the key), `setQuizPublished`, `deleteQuiz` (TEACHER of the course) and `checkQuizAnswers(actor, { quizId, answers })` (STUDENT; practice marking, nothing stored). `QUIZ` proposals run `createQuiz`. | Confirmed |

## 15. Decision log
**Confirmed by Zachary**
1. Time zone:
2. Attendance must include every enrolled student.
3. **Attendance cannot be edited after submission** (for example, absent → leave); this is P1 and may be added as a separate small feature after core completion.
4. If `createSessions` finds a conflict, reject the entire batch and clearly explain the reason according to §6.3.
5. Sign-in: ★ email + password (Auth.js credentials); Google / Passkey are P1.

**Pending Nick’s confirmation during H0**
6. Add `listMyCourses`.
7. CREATE_COURSE partial success does not roll back (keep the course and return per-email results).
8. All service functions return `Result<T>` (do not throw).
9. Seed ownership: `seed.ts` (accounts) belongs to Nick; `seed-ai.ts` (complete demo data) belongs to Zachary.
10. The initial schema includes AgentRun, AgentProposal, and AgentMemory tables (Nick creates tables only; no service functions).
