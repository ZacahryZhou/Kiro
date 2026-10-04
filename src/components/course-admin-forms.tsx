"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Trash2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormFeedback, initialFormState, selectClass, type FormState } from "@/components/form-feedback";
import {
  cancelSessionAction,
  deleteCourseAction,
  deleteSessionAction,
  deleteUnitAction,
  removeStudentAction,
  renameUnitAction,
  updateCourseAction,
  updateMaterialAction,
  updateSessionAction,
} from "@/app/(teacher)/teacher/courses/actions";
import type { MaterialView } from "@/contracts";
import type { CourseImpact, EditableCourse } from "@/services/course-admin";

const centsToDollars = (cents: number) => (cents / 100).toFixed(2);

export function EditCourseDialog({ course }: { course: EditableCourse }) {
  const [state, formAction, pending] = useActionState(updateCourseAction, initialFormState);
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <Pencil aria-hidden /> Edit course
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit course</DialogTitle>
          <DialogDescription>Changes show up for your students right away.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4" data-testid="edit-course-form">
          <input type="hidden" name="courseId" value={course.courseId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-course-name">Course name</Label>
              <Input id="edit-course-name" name="name" defaultValue={course.name} maxLength={80} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-course-subject">Subject</Label>
              <Input id="edit-course-subject" name="subject" defaultValue={course.subject} maxLength={40} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-course-type">Course type</Label>
              <select id="edit-course-type" name="type" defaultValue={course.type} className={selectClass}>
                <option value="ONE_ON_ONE">One-to-one</option>
                <option value="SMALL_CLASS">Small class</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-course-price">Price per session</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input id="edit-course-price" name="price" className="pl-7" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={centsToDollars(course.pricePerSessionCents)} />
              </div>
              <p className="text-xs text-muted-foreground">Applies to future attendance. Past deductions keep their amount.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-course-location">Location</Label>
            <Input id="edit-course-location" name="location" defaultValue={course.location} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-course-description">Description</Label>
            <Textarea id="edit-course-description" name="description" defaultValue={course.description} maxLength={500} rows={3} />
          </div>
          <FormFeedback state={state} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What deleting the course takes with it, one line per kind of thing that exists. */
function impactLines(impact: CourseImpact): string[] {
  return [
    impact.students > 0 && `${plural(impact.students, "student")} will be unenrolled`,
    impact.sessions > 0 && plural(impact.sessions, "session"),
    impact.attendanceRecords > 0 && plural(impact.attendanceRecords, "attendance record"),
    impact.deductions > 0 && plural(impact.deductions, "lesson deduction"),
    impact.progressRecords > 0 && plural(impact.progressRecords, "progress record"),
    impact.units > 0 && `${plural(impact.units, "unit")} with ${plural(impact.materials, "material")}`,
    impact.quizzes > 0 && plural(impact.quizzes, "quiz", "quizzes"),
    impact.knowledgeEntries > 0 && plural(impact.knowledgeEntries, "teaching note"),
    impact.conversations > 0 && plural(impact.conversations, "course chat"),
  ].filter((line): line is string => typeof line === "string");
}

export function DeleteCourseDialog({ courseId, impact }: { courseId: string; impact: CourseImpact }) {
  const [state, formAction, pending] = useActionState(deleteCourseAction, initialFormState);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === impact.courseName.trim().toLowerCase();
  const lines = impactLines(impact);
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="destructive" />}>
        <Trash2 aria-hidden /> Delete course
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete “{impact.courseName}”?</DialogTitle>
          <DialogDescription>This cannot be undone. Students lose access to the course immediately.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4" data-testid="delete-course-form">
          <input type="hidden" name="courseId" value={courseId} />
          {lines.length > 0 ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">This will permanently remove:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {lines.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This course is empty, so nothing else will be removed.</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="confirm-course-name">Type the course name to confirm</Label>
            <Input id="confirm-course-name" name="confirmName" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={impact.courseName} autoComplete="off" />
          </div>
          <FormFeedback state={state} />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={!matches || pending}>{pending ? "Deleting…" : "Delete this course"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Runs an action from a button, with a confirmation first, and shows its error underneath. */
function useConfirmedAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(question: string, action: () => Promise<FormState>) {
    if (!window.confirm(question)) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.kind === "error") setError(result.message);
    });
  }
  return { pending, error, run };
}

export function RemoveStudentButton({ courseId, studentId, name }: { courseId: string; studentId: string; name: string }) {
  const { pending, error, run } = useConfirmedAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Remove ${name} from this course`}
        onClick={() => run(`Remove ${name} from this course? Their past attendance and progress stay on your records.`, () => removeStudentAction(courseId, studentId))}
      >
        <UserMinus aria-hidden /> Remove
      </Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function UnitHeader({ courseId, unitId, title, order, materialCount }: { courseId: string; unitId: string; title: string; order: number; materialCount: number }) {
  const [state, formAction, pending] = useActionState(renameUnitAction, initialFormState);
  const { pending: deleting, error, run } = useConfirmedAction();
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit {order}</p>
          <h3 className="mt-1 text-lg font-semibold">{title}</h3>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={deleting}
          aria-label={`Delete unit ${title}`}
          onClick={() =>
            run(
              materialCount > 0 ? `Delete “${title}” and its ${plural(materialCount, "material")}? Students lose access immediately.` : `Delete the empty unit “${title}”?`,
              () => deleteUnitAction(courseId, unitId),
            )
          }
        >
          <Trash2 aria-hidden /> Delete unit
        </Button>
      </div>
      <details className="rounded-xl border bg-muted/40 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Rename unit</summary>
        <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="unitId" value={unitId} />
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={`rename-unit-${unitId}`}>Unit title</Label>
            <Input id={`rename-unit-${unitId}`} name="title" defaultValue={title} maxLength={80} required />
          </div>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save title"}</Button>
          <div className="basis-full"><FormFeedback state={state} /></div>
        </form>
      </details>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function EditMaterialForm({ material }: { material: MaterialView }) {
  const [state, formAction, pending] = useActionState(updateMaterialAction, initialFormState);
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Edit</summary>
      <form action={formAction} className="mt-2 space-y-3 rounded-lg bg-background p-3">
        <input type="hidden" name="materialId" value={material.id} />
        <input type="hidden" name="kind" value={material.kind} />
        <div className="space-y-2">
          <Label htmlFor={`edit-material-title-${material.id}`}>Title</Label>
          <Input id={`edit-material-title-${material.id}`} name="title" defaultValue={material.title} maxLength={80} required />
        </div>
        {material.kind === "TEXT" ? (
          <div className="space-y-2">
            <Label htmlFor={`edit-material-content-${material.id}`}>Text</Label>
            <Textarea id={`edit-material-content-${material.id}`} name="content" defaultValue={material.content ?? ""} maxLength={20000} rows={8} required />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={`edit-material-url-${material.id}`}>Link URL</Label>
            <Input id={`edit-material-url-${material.id}`} name="url" type="url" defaultValue={material.url ?? ""} required />
          </div>
        )}
        <FormFeedback state={state} />
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save material"}</Button>
      </form>
    </details>
  );
}

/** Edit, cancel or delete one session. Rescheduling and attendance have their own forms next to it. */
export function SessionAdmin({
  courseId,
  sessionId,
  status,
  durationMin,
  location,
  linkUrl,
}: {
  courseId: string;
  sessionId: string;
  status: "SCHEDULED" | "RESCHEDULED" | "CANCELLED" | "COMPLETED";
  durationMin: number;
  location?: string;
  linkUrl?: string;
}) {
  const [state, formAction, pending] = useActionState(updateSessionAction, initialFormState);
  const { pending: busy, error, run } = useConfirmedAction();
  const upcoming = status === "SCHEDULED" || status === "RESCHEDULED";
  return (
    <div className="basis-full space-y-3">
      {upcoming && (
        <details className="rounded-xl border bg-muted/40 p-4">
          <summary className="cursor-pointer font-medium">Edit session details</summary>
          <form action={formAction} className="mt-4 space-y-4">
            <input type="hidden" name="sessionId" value={sessionId} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={`edit-session-length-${sessionId}`}>Length (minutes)</Label>
                <Input id={`edit-session-length-${sessionId}`} name="durationMin" type="number" min="15" max="480" step="1" defaultValue={durationMin} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`edit-session-location-${sessionId}`}>Location</Label>
                <Input id={`edit-session-location-${sessionId}`} name="location" defaultValue={location ?? ""} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`edit-session-link-${sessionId}`}>Meeting link</Label>
                <Input id={`edit-session-link-${sessionId}`} name="linkUrl" type="url" defaultValue={linkUrl ?? ""} placeholder="https://" />
              </div>
            </div>
            <FormFeedback state={state} />
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save details"}</Button>
          </form>
        </details>
      )}
      {(upcoming || status === "CANCELLED") && (
        <div className="flex flex-wrap items-center gap-2">
          {upcoming && (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run("Cancel this session? Students will see it as cancelled.", () => cancelSessionAction(courseId, sessionId))}>
              Cancel session
            </Button>
          )}
          <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => run("Delete this session permanently? It disappears from every calendar.", () => deleteSessionAction(courseId, sessionId))}>
            <Trash2 aria-hidden /> Delete session
          </Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
