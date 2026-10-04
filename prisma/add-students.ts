import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { demoPassword } from "./seed-ai";

// Adds student accounts without touching anything that exists. Safe to run again: accounts that are
// already there are left alone. It refuses to run in production.
//
//   npm run db:add-students
//   npm run db:add-students -- --students 1@student.text,2@student.text
//   npm run db:add-students -- --course MACM101          (also enrol them in that course of the demo teacher)
//
// The new accounts use the same demo password as the other accounts (stored in prisma/seed.ts).

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : undefined;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("This script cannot run in production.");
    process.exitCode = 1;
    return;
  }
  const emails = (option("students") ?? "1@student.text,2@student.text").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const courseName = option("course");
  const teacherEmail = (option("teacher") ?? "t@example.test").toLowerCase();
  const prisma = new PrismaClient();
  try {
    const passwordHash = await hash(demoPassword, 12);
    const studentIds: string[] = [];
    for (const email of emails) {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
      if (existing && existing.role !== Role.STUDENT) {
        console.info(`Skipped ${email}: it already belongs to a ${existing.role.toLowerCase()} account, which was not changed.`);
        continue;
      }
      if (existing) {
        console.info(`Already exists: ${email} (not changed).`);
        studentIds.push(existing.id);
        continue;
      }
      const created = await prisma.user.create({ data: { name: `Student ${email.split("@")[0]}`, email, role: Role.STUDENT, passwordHash }, select: { id: true } });
      studentIds.push(created.id);
      console.info(`Created student account ${email}.`);
    }
    if (courseName && studentIds.length > 0) {
      const course = await prisma.course.findFirst({ where: { name: { equals: courseName, mode: "insensitive" }, teacher: { email: teacherEmail } }, select: { id: true, name: true } });
      if (!course) {
        console.info(`No course named "${courseName}" taught by ${teacherEmail}, so nobody was enrolled. Add the students from the course page instead.`);
      } else {
        for (const studentId of studentIds) {
          await prisma.enrollment.upsert({ where: { courseId_studentId: { courseId: course.id, studentId } }, create: { courseId: course.id, studentId }, update: {} });
        }
        console.info(`Enrolled them in ${course.name}.`);
      }
    }
    console.info("Done. The accounts use the same demo password as the other accounts (stored in prisma/seed.ts); each student can change it in Settings.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not add the students.");
  process.exitCode = 1;
});
