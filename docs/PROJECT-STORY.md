# Kora: Project Story

> Text for the Devpost submission form. It describes what the repository does today. The one thing it cannot show on its own is a live language model, which needs your own `AI_API_KEY` (the scripted demo mode needs none).

**Elevator pitch:** An AI agent that runs a tutor's admin from one sentence (attendance, rescheduling, quizzes, tutoring) and never changes your data until you confirm.

## Inspiration

Small tutoring providers run on spreadsheets, chat threads and memory. After a lesson the teacher has to open a schedule, mark who came, work out whose lesson balance goes down, and find a new slot for the student who was on leave, all without double-booking anyone.

An AI assistant looks like the obvious fix: just say "Jordan came today, Sam is on leave." But the moment an assistant can write to a real schedule or a real lesson balance, trust becomes the problem. A model that misreads a name can charge the wrong family. We wanted to see how capable an agent could be if it was never allowed to write on its own.

## What it does

Kora is a teaching platform for one-to-one lessons and small classes, built around an **AI agent with tools**. Teachers and students each get their own agent. It reads their real data, prepares changes, shows exactly what would happen, and waits for a person to say yes.

**Say it, see it, confirm it.** Every teacher write follows the same path:

1. The teacher says one sentence: "Jordan attended math today; Sam is on leave."
2. The agent reads the roster and schedule with read-only tools and saves a **proposal**.
3. The page shows a preview of exactly what would happen. Nothing has changed yet.
4. The teacher clicks Confirm, and only then does an ordinary, permission-checked service function write the attendance and the lesson deduction.

**What the teacher's agent can do**

- Take attendance by sentence, with lesson deductions calculated by code.
- Create courses, schedule sessions and reschedule them. Conflicts are checked against the teacher and every enrolled student, so a clash writes nothing and is explained.
- **Read a photo.** Attach a picture of a timetable or a worksheet and say "add these classes to my calendar." A vision model reads the picture and the agent turns it into proposals.
- **Write quizzes from your own materials.** Ask for 8 questions, a mix of types and difficulties, and some topics. Code plans the mix and keeps only the questions backed by a word-for-word quote from a material. You review the answer key before students see it.
- **Build teaching notes** (summaries, key points, common mistakes, FAQs, teaching style) from dictation or from uploaded files.
- Add students, enter course content, draft progress records from the teacher's own words, and report attendance trends that refuse to guess with fewer than three records.
- **Design the home page.** "Today, my requests and Jordan's progress, in ocean colours": the agent picks the widgets and code places them on a drag-and-resize grid.

**What the student's agent can do.** It is a smaller agent with no write tools. It answers from the student's own workspace, **tutors from the teacher's own notes** with step-by-step explanations, and prepares a leave or different-time request that the student confirms and the teacher decides on. Every answer from course content carries citations that code has checked against the source, or it says the teacher has not covered that.

**Conversations that feel like a product.** One centred pop-up opens with Ctrl/Cmd+K on any page. Start a new chat any time or reopen an earlier one from the history; every chat keeps its own context, and a dot marks chats waiting for your decision. Each course page also has its own assistant, locked to that course in code, so a student can ask the course tutor without mixing it up with the general assistant.

Around the agent is a normal product: sign-in, weekly schedule and month calendar, courses, materials with file upload (PDF, Word, text, Markdown), full edit and delete for courses, units, sessions and enrolments, a Requests inbox, student pages, account settings, and a live **Agent Console** that lights up each step of a request and the files it touches.

## How we built it

**The agent.** One model-and-tool loop (at most six rounds, with a timeout) runs in two configurations: **29 teacher tools** (16 read-only, 13 that prepare proposals) and **7 student tools** (6 read-only, 1 proposal). The model decides which tool to call next; everything around it is fixed code. Proposals move through an atomic state machine (pending, confirmed, executed or failed), so clicking Confirm twice, or from two tabs, writes once.

**Trust is enforced by design, not by prompts.**
- Identity comes only from the signed-in session. No function accepts a user ID or role from the browser or from the model.
- The agent may call read-only functions and write only its own tables (proposals, runs, memory, chats). It cannot touch business tables, which we audit with a grep over the agent's code.
- Code does the facts: deductions, attendance rates, dates, time zones (including daylight saving) and conflicts. The model interprets intent and writes the words.
- **The model drafts, code decides what is kept.** Quiz questions, teaching notes and tutor answers survive only if their quote is a word-for-word substring of a real material.
- Student messages, course materials and text read from photos are untrusted data. Instructions hidden in them cannot change which tools run or for whom.
- Every chat belongs to one user and the server reads its history itself. In a course assistant, any tool that takes a course is forced to that course in code, whatever the model asks for.

**Photos.** The main model reads text only, so a separate vision model turns each photo into plain text. Pictures are checked by their first bytes (not their file names), limited to four per message, shrunk in the browser, read once and never stored. The text it returns reaches the agent between marker lines with a reminder that it is data.

**Two tracks, one contract.** One person owned the core product and the other the agent. We wrote the API contract first (every function, input type, error code and permission rule) and neither side edited the other's code. The agent track built against in-memory fake services that follow the contract exactly, so it never waited, and switching to the real services was an import change.

**Stack:** Next.js (App Router), React, strict TypeScript, Tailwind and shadcn/ui, PostgreSQL with Prisma, Auth.js, Zod and Docker Compose. The model is any OpenAI-compatible API (DeepSeek by default) called with plain `fetch`, with a scripted mock mode for offline demos.

## Challenges we ran into

- **Deciding what the agent must never be able to do,** and then arranging the code so those things are impossible instead of merely discouraged.
- **The assistant that disagreed with the calendar.** A student asked for their next class and the agent answered "Monday"; the calendar said Tuesday. The date conversion was right. The bug was that the tool looked at "this week" and the model invented a date when it found nothing. We made code supply the current time and the next session in every schedule result, added an "upcoming" range, and wrote a regression test.
- **Prompt injection through new doors.** Each new input (student text, uploaded files, photos) is a place for hidden instructions. We treat all of them as data inside marked blocks and keep tool access in code.
- **Time zones.** "Thursday at 4 PM" means different UTC times either side of the autumn clock change. We convert in code and verified both offsets.
- **Building two halves in parallel.** Fake services only help if they behave exactly like the real ones, so we tested the fakes against the contract's rules.

## Accomplishments that we're proud of

- The headline behaviour works end to end: one sentence, one preview, one confirmation, one write. Confirming twice or in parallel writes once.
- An agent with 29 tools that still cannot write a single business row on its own.
- Grounded generation: quizzes, notes and tutor answers are kept only when code can find their quote in the teacher's own material.
- A student tutor that teaches in the teacher's voice from the teacher's notes, and says "I couldn't find that" when it is not there.
- 640 offline checks across 23 scripts, real-database checks for permissions and cross-account denial, and a real-model checklist you can run with your own key.
- A complete product around it that starts with one command, including a mock mode that needs no key and no network.

## What we learned

- For AI products the interesting engineering is the harness around the model: tool design, permissions, validation and confirmation matter more than the prompt.
- "Propose, then confirm" is a small idea that changes how much you can safely let an assistant do.
- Let the model draft and let code decide. It is the simplest way to make generated content trustworthy.
- Writing the contract before the code removed most integration surprises.

## What's next for Kora

- Meet teachers where they already are: a chat-app front end (Telegram first) that reuses the same agent and the same confirm-first rule, and a calendar feed for Google and Apple Calendar.
- Self-service registration, password reset by email, and notifications.
- OCR for scanned PDFs, retrieval for materials longer than the agent can read at once, and recording quiz attempts.
- Agent proposals for editing and deleting courses, assignments, and lesson-pack balances (tuition changes were left out on purpose until they can follow the same confirm-first rule).

## Built with

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL, Prisma, Auth.js, Zod, Docker Compose, react-grid-layout, DeepSeek (any OpenAI-compatible model API), a vision model for photos, unpdf, mammoth.

## Try it

Clone the repository, copy `.env.example` to `.env`, run `docker compose up --build`, then create the demo data with the two seed commands in the README. With `AI_MOCK=1` the scripted demo model runs the main flow with no API key and no network. `docs/DEMO-SCRIPT.md` walks through the demo line: attendance by sentence, a conflict, a verified answer from course materials, a student tutor, and access isolation between accounts.
