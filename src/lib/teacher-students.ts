import type { Actor } from "@/lib/auth/actor";
import { listMyCourses, listMyStudents } from "@/services/read";

export type RosterStudent = { id: string; name: string; email: string; courses: { id: string; name: string }[] };

/** Every student enrolled in the teacher's own courses, with the courses they share. */
export async function loadRoster(actor: Actor): Promise<{ ok: true; students: RosterStudent[] } | { ok: false; message: string }> {
  const courses = await listMyCourses(actor);
  if (!courses.ok) return { ok: false, message: courses.error.message };
  const byId = new Map<string, RosterStudent>();
  for (const course of courses.data.courses) {
    const roster = await listMyStudents(actor, { courseId: course.id });
    if (!roster.ok) return { ok: false, message: roster.error.message };
    for (const student of roster.data.students) {
      const entry = byId.get(student.id) ?? { id: student.id, name: student.name, email: student.email, courses: [] };
      entry.courses.push({ id: course.id, name: course.name });
      byId.set(student.id, entry);
    }
  }
  return { ok: true, students: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}
