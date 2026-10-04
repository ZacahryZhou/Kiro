"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
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
  deleteMaterialAction,
  rescheduleSessionAction,
  saveProgressAction,
  uploadMaterialFileAction,
} from "@/app/(teacher)/teacher/courses/actions";
import type { MaterialView, StudentView, UnitView } from "@/contracts";
import { NEXT_ACTION_LABELS } from "@/lib/progress";
import { EditMaterialForm, UnitHeader } from "@/components/course-admin-forms";
import { FormFeedback, initialFormState, selectClass, type FormState } from "@/components/form-feedback";
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES, fileKindOf } from "@/lib/file-text";

const initialState = initialFormState;

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
    <form action={formAction} className="space-y-3 rounded-2xl border bg-card shadow-sm p-4 sm:flex sm:flex-wrap sm:items-end sm:gap-3 sm:space-y-0">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="min-w-0 flex-1 space-y-2">
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


const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Upload a .txt, .md, .pdf or .docx file; its text becomes one or more text materials in the unit. */
export function UploadMaterialForm({ courseId, unitId }: { courseId: string; unitId: string }) {
  // An empty unitId means "the Uploaded files unit"; the id suffix keeps element ids unique either way.
  const idKey = unitId || `${courseId}-auto`;
  const [state, setState] = useState<FormState>(initialState);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const data = new FormData(event.currentTarget);
    data.set("file", file);
    setState(initialState);
    startTransition(async () => {
      const result = await uploadMaterialFileAction(initialState, data);
      setState(result);
      // A successful upload empties the form so the next file starts clean.
      if (result.kind === "success") {
        formRef.current?.reset();
        setFile(null);
      }
    });
  }

  function choose(next: File | null) {
    setProblem(null);
    if (!next) return setFile(null);
    if (!fileKindOf(next.name)) {
      setFile(null);
      return setProblem(`That file type is not supported. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
    }
    if (next.size > MAX_FILE_BYTES) {
      setFile(null);
      return setProblem(`That file is ${formatSize(next.size)}. The limit is ${formatSize(MAX_FILE_BYTES)}.`);
    }
    setFile(next);
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-dashed bg-card/60 p-4"
      data-testid="upload-material-form"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="unitId" value={unitId} />
      <label
        htmlFor={`upload-file-${idKey}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0] ?? null); }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors focus-within:ring-2 focus-within:ring-ring ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30 hover:bg-muted/50"}`}
      >
        <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">Drop a file here, or click to choose</span>
        <span className="text-xs text-muted-foreground">PDF, Word (.docx), .txt or .md, up to {formatSize(MAX_FILE_BYTES)}. Only the text is kept.</span>
        <input
          ref={inputRef}
          id={`upload-file-${idKey}`}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          className="sr-only"
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm" data-testid="selected-file">
          <FileText className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
          <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
          <button type="button" aria-label="Remove the chosen file" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      {file && (
        <div className="space-y-2">
          <Label htmlFor={`upload-title-${idKey}`}>Title <span className="font-normal text-muted-foreground">(optional, defaults to the file name)</span></Label>
          <Input id={`upload-title-${idKey}`} name="title" maxLength={70} placeholder={file.name.replace(/\.[^.]+$/, "")} />
        </div>
      )}
      <FormFeedback state={state} />
      <Button type="submit" disabled={pending || !file}>{pending ? "Reading the file…" : "Upload file"}</Button>
    </form>
  );
}

/** One material in the teacher's list: what it is, a text preview so uploads can be checked, and a remove button. */
function MaterialRow({ courseId, material }: { courseId: string; material: MaterialView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const text = material.content ?? "";
  function remove() {
    if (!window.confirm(`Remove “${material.title}”? Students will no longer see it.`)) return;
    startTransition(async () => {
      const result = await deleteMaterialAction(courseId, material.id);
      if (result.kind === "error") setError(result.message);
    });
  }
  return (
    <li className="rounded-xl bg-muted/50 p-3" data-testid="material-row">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{material.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{material.kind === "TEXT" ? `Text · ${text.length.toLocaleString("en-US")} characters` : "Link"}</p>
        </div>
        <button type="button" onClick={remove} disabled={pending} aria-label={`Remove ${material.title}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {text && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Preview the text</summary>
          <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-muted-foreground">{text.length > 1500 ? `${text.slice(0, 1500)}…` : text}</p>
        </details>
      )}
      <EditMaterialForm material={material} />
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </li>
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
              <UnitHeader courseId={courseId} unitId={unit.id} title={unit.title} order={unit.order} materialCount={unit.materials.length} />
              {unit.materials.length === 0 ? (
                <p className="text-sm text-muted-foreground">No materials in this unit yet.</p>
              ) : (
                <ul className="space-y-2">
                  {unit.materials.map((material) => <MaterialRow key={material.id} courseId={courseId} material={material} />)}
                </ul>
              )}
              <UploadMaterialForm courseId={courseId} unitId={unit.id} />
              <AddMaterialForm courseId={courseId} unitId={unit.id} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Records what a student worked on in a session that has started. Saving again replaces the earlier record. */
export function ProgressForm({
  courseId,
  students,
  sessions,
}: {
  courseId: string;
  students: StudentView[];
  sessions: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(saveProgressAction, initialState);
  if (students.length === 0 || sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">Progress can be recorded once the course has students and a session that has started.</p>;
  }
  return (
    <form action={formAction} className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <input type="hidden" name="courseId" value={courseId} />
      <div>
        <h3 className="font-medium">Record progress</h3>
        <p className="text-sm text-muted-foreground">One record per student and session. Saving again replaces it. Students can read everything except your private note.</p>
      </div>
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="progress-session">Session</Label>
          <select id="progress-session" name="sessionId" required className={selectClass}>
            {sessions.map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="progress-student">Student</Label>
          <select id="progress-student" name="studentId" required className={selectClass}>
            {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="progress-goal">Goal of the session</Label>
          <Input id="progress-goal" name="goal" required maxLength={200} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="progress-output">What the student produced</Label>
          <Textarea id="progress-output" name="output" required maxLength={500} rows={2} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="progress-issue">Difficulty (optional)</Label>
          <Input id="progress-issue" name="issue" maxLength={300} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="progress-next">Next step</Label>
          <select id="progress-next" name="nextAction" required defaultValue="PRACTICE" className={selectClass}>
            {Object.entries(NEXT_ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="progress-note">Private note for you (optional)</Label>
          <Textarea id="progress-note" name="note" maxLength={300} rows={2} />
        </div>
      </fieldset>
      <FormFeedback state={state} />
      <SubmitButton pending={pending}>Save progress</SubmitButton>
    </form>
  );
}
