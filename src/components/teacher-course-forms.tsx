"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addMaterialAction,
  addStudentAction,
  confirmAttendanceAction,
  createCourseAction,
  createCourseUnitAction,
  createSessionsAction,
  rescheduleSessionAction,
} from "@/app/(teacher)/teacher/courses/actions";
import type { StudentView, UnitView } from "@/contracts";

type FormState = { kind: "success" | "error" | null; message: string; details?: string[] };
const initialState: FormState = { kind: null, message: "" };

function FormFeedback({ state }: { state: FormState }) {
  if (!state.kind) return null;
  const isError = state.kind === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`space-y-1 rounded-lg border p-3 text-sm ${isError ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
      aria-live={isError ? "assertive" : "polite"}
    >
      <p>{state.message}</p>
      {state.details?.map((detail, index) => <p key={`${index}-${detail}`}>{detail}</p>)}
    </div>
  );
}

function SubmitButton({ children, pending }: { children: string; pending: boolean }) {
  return <Button type="submit" disabled={pending}>{pending ? "Saving…" : children}</Button>;
}

export function CreateCourseDialog() {
  const [state, formAction, pending] = useActionState(createCourseAction, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button type="button" />}>Create course</DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create a course</DialogTitle>
            <DialogDescription>Add course details. You can enroll students and schedule sessions next.</DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="course-name">Course name</Label>
                <Input id="course-name" name="name" maxLength={80} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="course-subject">Subject</Label>
                <Input id="course-subject" name="subject" maxLength={40} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="course-type">Course type</Label>
                <select
                  id="course-type"
                  name="type"
                  defaultValue="ONE_ON_ONE"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="ONE_ON_ONE">One-to-one</option>
                  <option value="SMALL_CLASS">Small class</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="course-price">Price per session</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input id="course-price" name="price" className="pl-7" type="number" min="0" step="0.01" inputMode="decimal" />
                </div>
                <p className="text-xs text-muted-foreground">Optional. Stored in cents.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="course-location">Location</Label>
              <Input id="course-location" name="location" maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="course-description">Description</Label>
              <Textarea id="course-description" name="description" maxLength={500} rows={3} />
            </div>
            <FormFeedback state={state} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
              <SubmitButton pending={pending || state.kind === "success"}>Create course</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AddStudentForm({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState(addStudentAction, initialState);
  return (
    <form action={formAction} className="rounded-2xl border bg-card shadow-sm p-4 sm:flex sm:items-end sm:gap-3">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="flex-1 space-y-2">
        <Label htmlFor="student-email">Add an existing student</Label>
        <Input id="student-email" name="email" type="email" autoComplete="email" placeholder="student@example.test" required />
      </div>
      <div className="mt-3 sm:mt-0"><SubmitButton pending={pending}>Add student</SubmitButton></div>
      <div className="mt-3 sm:basis-full"><FormFeedback state={state} /></div>
    </form>
  );
}

export function CreateSessionsForm({ courseId, timeZone }: { courseId: string; timeZone: string }) {
  const [state, formAction, pending] = useActionState(createSessionsAction, initialState);
  return (
    <form action={formAction} className="space-y-4 rounded-2xl border bg-card shadow-sm p-4">
      <input type="hidden" name="courseId" value={courseId} />
      <div>
        <h3 className="font-medium">Schedule weekly sessions</h3>
        <p className="mt-1 text-sm text-muted-foreground">Dates and times use {timeZone}.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="session-date">First session date</Label>
          <Input id="session-date" name="date" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="session-time">Start time</Label>
          <Input id="session-time" name="time" type="time" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="session-duration">Duration (minutes)</Label>
          <Input id="session-duration" name="durationMin" type="number" min="15" max="480" step="1" defaultValue="60" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="session-weeks">Number of weeks</Label>
          <Input id="session-weeks" name="weeks" type="number" min="1" max="30" step="1" defaultValue="4" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="session-location">Location (optional)</Label>
        <Input id="session-location" name="location" maxLength={120} />
      </div>
      <FormFeedback state={state} />
      <SubmitButton pending={pending}>Schedule sessions</SubmitButton>
    </form>
  );
}

export function MarkAttendanceForm({ sessionId, students }: { sessionId: string; students: StudentView[] }) {
  const [state, formAction, pending] = useActionState(confirmAttendanceAction, initialState);
  if (students.length === 0) {
    return <p className="text-sm text-muted-foreground">Enroll students before marking attendance.</p>;
  }

  return (
    <details className="basis-full rounded-xl border bg-muted/40 p-4">
      <summary className="cursor-pointer font-medium">Mark attendance</summary>
      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="sessionId" value={sessionId} />
        <fieldset disabled={pending} className="space-y-3">
          <legend className="sr-only">Choose attendance for every enrolled student</legend>
          {students.map((student) => (
            <div key={student.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
              <input type="hidden" name="studentId" value={student.id} />
              <Label htmlFor={`attendance-${sessionId}-${student.id}`}>{student.name}</Label>
              <select
                id={`attendance-${sessionId}-${student.id}`}
                name={`status:${student.id}`}
                defaultValue="PRESENT"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="PRESENT">Present</option>
                <option value="LEAVE">Leave</option>
                <option value="ABSENT">Absent</option>
              </select>
            </div>
          ))}
        </fieldset>
        <FormFeedback state={state} />
        <SubmitButton pending={pending || state.kind === "success"}>Save attendance</SubmitButton>
      </form>
    </details>
  );
}

function getLocalDateTimeValues(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export function RescheduleSessionForm({
  courseId,
  sessionId,
  startAt,
  timeZone,
}: {
  courseId: string;
  sessionId: string;
  startAt: string;
  timeZone: string;
}) {
  const [state, formAction, pending] = useActionState(rescheduleSessionAction, initialState);
  const local = getLocalDateTimeValues(startAt, timeZone);
  return (
    <details className="basis-full rounded-xl border bg-muted/40 p-4">
      <summary className="cursor-pointer font-medium">Reschedule session</summary>
      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <p className="text-sm text-muted-foreground">Choose the new start time in {timeZone}. The session length stays the same.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`reschedule-date-${sessionId}`}>New date</Label>
            <Input id={`reschedule-date-${sessionId}`} name="date" type="date" defaultValue={local.date} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`reschedule-time-${sessionId}`}>New start time</Label>
            <Input id={`reschedule-time-${sessionId}`} name="time" type="time" defaultValue={local.time} required />
          </div>
        </div>
        <FormFeedback state={state} />
        <SubmitButton pending={pending}>Save new time</SubmitButton>
      </form>
    </details>
  );
}

export function CreateCourseUnitForm({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState(createCourseUnitAction, initialState);
  return (
    <form action={formAction} className="space-y-3 rounded-2xl border bg-card shadow-sm p-4 sm:flex sm:items-end sm:gap-3 sm:space-y-0">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="flex-1 space-y-2">
        <Label htmlFor="unit-title">New unit</Label>
        <Input id="unit-title" name="title" maxLength={80} placeholder="e.g. Fractions and decimals" required />
      </div>
      <SubmitButton pending={pending}>Add unit</SubmitButton>
      <div className="sm:basis-full"><FormFeedback state={state} /></div>
    </form>
  );
}

export function AddMaterialForm({ courseId, unitId }: { courseId: string; unitId: string }) {
  const [state, formAction, pending] = useActionState(addMaterialAction, initialState);
  return (
    <form action={formAction} className="space-y-3 rounded-xl border bg-muted/40 p-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="unitId" value={unitId} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="space-y-2">
          <Label htmlFor={`material-title-${unitId}`}>Material title</Label>
          <Input id={`material-title-${unitId}`} name="title" maxLength={80} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`material-kind-${unitId}`}>Type</Label>
          <select
            id={`material-kind-${unitId}`}
            name="kind"
            defaultValue="TEXT"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="TEXT">Text</option>
            <option value="LINK">Link</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`material-content-${unitId}`}>Text content</Label>
        <Textarea id={`material-content-${unitId}`} name="content" maxLength={20000} rows={4} />
        <p className="text-xs text-muted-foreground">Required when the material type is Text.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`material-url-${unitId}`}>Link URL</Label>
        <Input id={`material-url-${unitId}`} name="url" type="url" placeholder="https://example.com" />
        <p className="text-xs text-muted-foreground">Required when the material type is Link.</p>
      </div>
      <FormFeedback state={state} />
      <SubmitButton pending={pending}>Add material</SubmitButton>
    </form>
  );
}

export function TeacherCourseMaterials({ courseId, units }: { courseId: string; units: UnitView[] }) {
  return (
    <div className="space-y-5">
      <CreateCourseUnitForm courseId={courseId} />
      {units.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/60 px-6 py-10 text-center">
          <h3 className="font-medium">No units yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Create a unit to organize text materials and links.</p>
        </div>
      ) : (
        <ol className="space-y-4">
          {units.map((unit) => (
            <li key={unit.id} className="space-y-4 rounded-2xl border bg-card shadow-sm p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit {unit.order}</p>
                <h3 className="mt-1 text-lg font-semibold">{unit.title}</h3>
              </div>
              {unit.materials.length === 0 ? (
                <p className="text-sm text-muted-foreground">No materials in this unit yet.</p>
              ) : (
                <ul className="space-y-2">
                  {unit.materials.map((material) => (
                    <li key={material.id} className="rounded-xl bg-muted/50 p-3">
                      <p className="font-medium">{material.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{material.kind === "TEXT" ? "Text" : "Link"}</p>
                    </li>
                  ))}
                </ul>
              )}
              <AddMaterialForm courseId={courseId} unitId={unit.id} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
