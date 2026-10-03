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
  addStudentAction,
  confirmAttendanceAction,
  createCourseAction,
  createSessionsAction,
} from "@/app/(teacher)/teacher/courses/actions";
import type { StudentView } from "@/contracts";

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
    <form action={formAction} className="rounded-xl border bg-white p-4 sm:flex sm:items-end sm:gap-3">
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
    <form action={formAction} className="space-y-4 rounded-xl border bg-white p-4">
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
    <details className="basis-full rounded-lg border bg-slate-50 p-4">
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
