# Kora: Devpost text

Everything under "About the project" is paste-ready Markdown for the Devpost **About the project** box (select the box, delete what is there, paste). The other Devpost fields are at the bottom. It describes what the repository does today; a live language model needs your own `AI_API_KEY`, and the scripted demo mode (`AI_MOCK=1`) needs none.

---

## About the project

## Inspiration

Small tutoring providers run on spreadsheets, chat threads and memory. After a lesson the teacher has to open a schedule, mark who came, work out whose lesson balance goes down, and find a new slot for the student who was on leave, without double-booking anyone. None of it is hard, but all of it is repetitive, and one slip means a wrong charge or a student turning up to an empty room.

An AI assistant looks like the obvious fix: just say "Jordan came today, Sam is on leave." But the moment an assistant can write to a real schedule or a real lesson balance, trust becomes the problem. A model that misreads a name can charge the wrong family. We wanted to find out how capable an agent could be if it was never allowed to write on its own.

## What it does

Kora is a teaching platform for one-to-one lessons and small classes, built around an **AI agent with tools**. Teachers and students each get their own agent. It reads their real data, prepares changes, shows exactly what would happen, and waits for a person to say yes.

**Say it, see it, confirm it.**

1. The teacher says one sentence: "Jordan attended math today; Sam is on leave."
2. The agent reads the roster and schedule with read-only tools and saves a *proposal*.
3. The page shows a preview of exactly what would happen. Nothing has changed yet.
4. The teacher clicks Confirm, and only then does an ordinary, permission-checked service function write the attendance and the lesson deduction.

**The teacher's agent can:**

- take attendance by sentence, with lesson deductions calculated by code;
- create courses, schedule sessions and reschedule them, checking conflicts against the teacher and every enrolled student (a clash writes nothing and is explained);
- **read a photo**: attach a picture of a timetable or a worksheet and say "add these classes to my calendar";
- **write quizzes from the teacher's own materials**: code plans the mix of types and difficulties and keeps only the questions backed by a word-for-word quote from a material;
- **build teaching notes** (summaries, key points, common mistakes, FAQs) from dictation or uploaded files;
- add students, enter course content, draft progress records from the teacher's own words, and report attendance trends (it refuses to guess with fewer than three records);
- **design the home page** on request ("today, my requests and Jordan's progress, in ocean colours"), while code places the widgets on a drag-and-resize grid.

**The student's agent** is smaller and has no write tools. It answers from the student's own workspace, **tutors from the teacher's own notes** with step-by-step explanations, and prepares a leave or different-time request that the student confirms. Every answer drawn from course content carries citations that code has checked against the source, or it says the teacher has not covered that.

**Conversations that feel like a product.** One centred pop-up opens with Ctrl/Cmd+K on any page, with a history of earlier chats, and every chat keeps its own context. Each course page also has its own assistant, locked to that course in code.

Around the agent is a normal product: sign-in, schedule and calendar, courses, materials with file upload (PDF, Word, text, Markdown), edit and delete for courses, units, sessions and enrolments, a Requests inbox, student pages, and a live **Agent Console** that lights up each step of a request.

## How we built it

**The agent.** One model-and-tool loop (at most six rounds, with a timeout) runs in two configurations: **30 teacher tools** (17 read-only, 13 that prepare proposals) and **7 student tools**. The model chooses the next tool; everything around it is fixed code. Proposals move through an atomic state machine (pending, confirmed, executed or failed), so clicking Confirm twice writes once.

**Trust is enforced by design, not by prompts.**

- Identity comes only from the signed-in session. No function accepts a user ID or role from the browser or from the model.
- The agent can call read-only functions and write only its own tables (proposals, runs, memory, chats). It cannot touch business tables.
- Code does the facts: deductions, attendance rates, dates, time zones and conflicts. The model interprets intent and writes the words.
- The model drafts, code decides what is kept. Quiz questions, notes and tutor answers survive only if their quote is a word-for-word substring of a real material.
- Student messages, course materials and text read from photos are untrusted data. Hidden instructions in them cannot change which tools run or for whom.
- In a course assistant, any tool that takes a course is forced to that course in code, whatever the model asks for.

**Photos.** The main model reads text only, so a separate vision model turns each photo into text. Pictures are checked by their first bytes, limited to four per message, shrunk in the browser, read once and never stored.

**Two tracks, one contract.** The work was split into the core product and the agent. We wrote the API contract first (every function, input type, error code and permission rule) and built against it. The agent track used in-memory fake services that follow the contract exactly, so it never waited, and switching to the real services was an import change.

**Stack:** Next.js, React, TypeScript, Tailwind and shadcn/ui, PostgreSQL with Prisma, Auth.js, Zod and Docker Compose. The model is any OpenAI-compatible API (DeepSeek by default), with a scripted mock mode for offline demos.

## Challenges we ran into

- **Deciding what the agent must never be able to do,** and then arranging the code so those things are impossible instead of merely discouraged.
- **The assistant that disagreed with the calendar.** A student asked for their next class and the agent answered Monday; the calendar said Tuesday. The date conversion was right. The tool had looked only at "this week", found nothing, and the model invented a date. Now code supplies the current time and the next session in every schedule result, and a regression test guards it.
- **Prompt injection through every new input.** Student text, uploaded files and photos can all hide instructions. We treat them as data inside marked blocks and keep tool access in code.
- **Time zones.** "Thursday at 4 PM" means different UTC times either side of the autumn clock change. We convert in code and verified both offsets.
- **Building two halves in parallel.** Fake services only help if they behave exactly like the real ones, so we tested them against the contract's rules.

## Accomplishments that we're proud of

- The headline behaviour works end to end: one sentence, one preview, one confirmation, one write. Confirming twice or in parallel writes once.
- An agent with 30 tools that still cannot write a single business row on its own.
- Grounded generation: quizzes, notes and tutor answers are kept only when code can find their quote in the teacher's own material.
- A student tutor that teaches from the teacher's notes and says "I couldn't find that" when the answer is not there.
- 640 offline checks across 23 scripts, real-database checks for permissions and cross-account denial, and a real-model checklist anyone can run with their own key.
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

---

## Other Devpost fields

**Elevator pitch (about 150 characters):** An AI agent that runs a tutor's admin from one sentence (attendance, rescheduling, quizzes, tutoring) and never changes your data until you confirm.

**Built with (tags):** next.js, react, typescript, tailwindcss, shadcn-ui, postgresql, prisma, auth.js, zod, docker, deepseek, openai-compatible-api

**Try it out:** the GitHub repository (`https://github.com/ZacahryZhou/Kora`) and your demo video. To run it: clone, copy `.env.example` to `.env`, `docker compose up --build`, then the two seed commands in the README. `AI_MOCK=1` needs no API key. `docs/DEMO-SCRIPT.md` walks through the demo.

**Good screenshots for the gallery:** the chat pop-up with a proposal preview card, the Agent Console architecture graph lighting up, the customisable home page, and a student course page with the course tutor.
