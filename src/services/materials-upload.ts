import { z } from "zod";
import { DeleteMaterialInput as DeleteMaterialInputSchema, err, ok, type DeleteMaterialInput, type Result } from "@/contracts";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { extractText, MAX_MATERIAL_CHARS, MAX_PARTS, splitIntoParts, titleFromFileName } from "@/lib/file-text";

const input = z.object({ unitId: z.string().min(1), fileName: z.string().min(1).max(200), title: z.string().trim().min(1).max(70).optional() });

export type UploadedMaterials = { materialIds: string[]; parts: number; characters: number; fileName: string };

/**
 * Reads a teacher's file (.txt, .md, .pdf, .docx) and adds its text to one of their units as TEXT
 * materials. Long files become "Title (part 1 of 3)" and so on, all created together or not at all.
 */
export async function addMaterialsFromFile(
  actor: Actor,
  request: { unitId: string; fileName: string; bytes: Uint8Array; title?: string },
): Promise<Result<UploadedMaterials>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can add course materials.");
  const parsed = input.safeParse({ unitId: request.unitId, fileName: request.fileName, title: request.title || undefined });
  if (!parsed.success) return err("VALIDATION", "Choose a unit and a file.");
  try {
    const unit = await prisma.courseUnit.findUnique({ where: { id: parsed.data.unitId }, select: { id: true, course: { select: { teacherId: true } } } });
    if (!unit) return err("NOT_FOUND", "Course unit not found.");
    if (unit.course.teacherId !== actor.userId) return err("FORBIDDEN", "You do not have access to this course unit.");

    const extracted = await extractText(parsed.data.fileName, request.bytes);
    if (!extracted.ok) return extracted;
    const parts = splitIntoParts(extracted.data.text, MAX_MATERIAL_CHARS);
    if (parts.length > MAX_PARTS) {
      return err("VALIDATION", `That file has about ${extracted.data.text.length.toLocaleString("en-US")} characters, more than the ${(MAX_PARTS * MAX_MATERIAL_CHARS).toLocaleString("en-US")} one upload can hold. Split the file and upload it in pieces.`);
    }
    const base = parsed.data.title ?? titleFromFileName(parsed.data.fileName);
    const created = await prisma.$transaction(
      parts.map((content, index) =>
        prisma.material.create({
          data: { unitId: unit.id, kind: "TEXT", title: parts.length === 1 ? base : `${base} (part ${index + 1} of ${parts.length})`.slice(0, 80), content },
          select: { id: true },
        }),
      ),
    );
    return ok({ materialIds: created.map((row) => row.id), parts: parts.length, characters: extracted.data.text.length, fileName: parsed.data.fileName });
  } catch {
    return err("INTERNAL", "Could not add the file. Please try again.");
  }
}

/** Removes one material from a unit the teacher owns. Students lose access immediately. */
export async function deleteMaterial(actor: Actor, request: DeleteMaterialInput): Promise<Result<{ deleted: true }>> {
  if (actor.role !== "TEACHER") return err("FORBIDDEN", "Only teachers can remove course materials.");
  const parsed = DeleteMaterialInputSchema.safeParse(request);
  if (!parsed.success) return err("VALIDATION", "Choose a material.");
  try {
    const removed = await prisma.material.deleteMany({ where: { id: parsed.data.materialId, unit: { course: { teacherId: actor.userId } } } });
    if (removed.count === 0) return err("NOT_FOUND", "That material was not found.");
    return ok({ deleted: true });
  } catch {
    return err("INTERNAL", "Could not remove the material. Please try again.");
  }
}
