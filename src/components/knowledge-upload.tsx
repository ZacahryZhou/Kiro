"use client";

import { useState } from "react";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { UploadMaterialForm } from "@/components/teacher-course-forms";
import { selectClass } from "@/components/form-feedback";

export type UploadTarget = { id: string; name: string; units: { id: string; title: string }[] };

/**
 * Upload a lesson file from the Teaching knowledge page. The text becomes a course material, so the
 * students of that course can ask the course tutor about it right away.
 */
export function KnowledgeUpload({ courses }: { courses: UploadTarget[] }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [unitId, setUnitId] = useState("");
  const course = courses.find((item) => item.id === courseId);

  return (
    <section aria-label="Upload course material" className="kora-card space-y-4 p-5" data-testid="knowledge-upload">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileUp className="size-4" aria-hidden /></span>
        <div>
          <h2 className="font-semibold">Upload a lesson file</h2>
          <p className="text-sm text-muted-foreground">
            Add a PDF, Word, .txt or .md file to a course. Students in that course can ask its tutor questions about it straight away, and you can ask the assistant to turn it into teaching notes or a quiz.
          </p>
        </div>
      </div>
      {!course ? (
        <p className="text-sm text-muted-foreground">
          You need a course first. <Link href="/teacher/courses" className="font-medium text-foreground underline underline-offset-4">Create one</Link>, then come back to upload files.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="knowledge-upload-course">Course</Label>
              <select id="knowledge-upload-course" value={courseId} onChange={(event) => { setCourseId(event.target.value); setUnitId(""); }} className={selectClass} data-testid="upload-course">
                {courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="knowledge-upload-unit">Unit</Label>
              <select id="knowledge-upload-unit" value={unitId} onChange={(event) => setUnitId(event.target.value)} className={selectClass} data-testid="upload-unit">
                <option value="">Uploaded files (created for you)</option>
                {course.units.filter((unit) => unit.title !== "Uploaded files").map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}
              </select>
            </div>
          </div>
          <UploadMaterialForm key={`${courseId}:${unitId}`} courseId={courseId} unitId={unitId} />
        </>
      )}
    </section>
  );
}
