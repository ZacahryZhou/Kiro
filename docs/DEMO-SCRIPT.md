# Kora Demo Script (about 4 minutes)

Use this for the demo video or a live walkthrough. It follows the required line (sign-in, schedules, AI attendance, student materials Q&A, access isolation) and then shows the extras.

## Before you start

1. `docker compose up --build`, then, in a second terminal:
   `docker compose exec app npm run db:seed` and `docker compose exec app npm run db:seed:demo -- --reset`
   (`--reset` puts the showcase data back to a clean state before every take).
2. Choose the model: a live model (`AI_MOCK=0` with your own `AI_API_KEY` and `AI_MODEL` in `.env`) or the scripted demo model (`AI_MOCK=1`, no key needed). The scripted model understands the sentences below; a live model understands many more.
3. Open `http://localhost:3000` in a normal window and a private window (two people at once). The showcase sign-ins are `t+alex@example.test` (teacher), `t+taylor@example.test` (another teacher), `s+jordan@example.test` and `s+sam@example.test` (students). The shared password is in `prisma/seed-ai.ts`; never show or type it on screen, just sign in off-camera or paste it.

## 1. The idea (20 seconds)

Show the landing page at `/`. Say: "Kora is a tutoring workspace where an AI assistant does the busywork, but it can never change anything until the teacher confirms."

## 2. Sign-in and schedule (20 seconds)

Sign in as Alex. Point at the sidebar (the name and role are shown), the weekly schedule with its stat cards, and the Calendar page.

## 3. AI attendance with confirmation (60 seconds)

1. Click **Ask Kora AI** and type: `Jordan came and Sam is on leave`.
2. Show the preview card: "Review before anything changes", the per-student lines, "1 session deducted" for Jordan and none for Sam.
3. Say: "Nothing has changed yet." Open the course page's Attendance tab in the background to show it is still empty (optional).
4. Click **Confirm**. Show "Done. The change has been applied." and the attendance and deduction now on the course page.
5. Reload the page: the Confirm button is gone, so nothing can be applied twice (the confirmation endpoint also refuses a second or parallel call).

## 4. Student: cited answers and a leave request (60 seconds)

In the private window sign in as Jordan.

1. Ask: `What is a linear equation?` (the showcase materials cover it). Show the answer with its **Sources** badge: "Solving Linear Equations". Then ask something the materials do not cover, for example `What is the capital of France?`: the assistant says it could not find it in the course materials.
2. Type `I need leave next week for Physics`, show the preview ("only a note to your teacher") and confirm.
3. Back as Alex, open **Requests**: the badge shows 1. Say: "Approving it is a note to the student; it never edits the schedule or attendance."

## 5. Access isolation (40 seconds)

1. As Taylor (another teacher), open `/teacher/students` and the Requests page: Alex's students and Jordan's request are not there. Open a student URL copied from Alex's session: 404.
2. As Sam (another student in Jordan's course), open the course page: Jordan's progress notes and requests are not visible.
3. As Jordan, try the teacher address `/teacher`: redirected to "Access denied".

## 6. Extras, if time allows (40 seconds)

- As Alex: `Move Math on <date> to <new date> at 9am` shows a reschedule preview; a clash with another session is refused with the reason.
- `Add Sam to my Physics course` resolves Sam from Alex's own students and previews the add.
- `Record progress for Sam: goal: fractions; output: solved 7 of 10; next: practice` previews a progress record.
- Open `/admin/agent` (the **Agent console** menu item, shown to allowed admins) and send a message in the embedded panel: each step and the files it uses light up. Use **Replay** to step through a finished run.

## Closing line

"The assistant proposes, a person confirms, and plain, tested code does the writing. Every step is isolated per person and visible in the console."

## What not to claim

- Lesson preparation, free-form content entry and attendance trends need a live model; the scripted mode does not demo them.
- Registration, notifications, assignments and tuition are not built.
