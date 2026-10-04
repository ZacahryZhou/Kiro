import { CourseType, PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { demoPassword } from "./seed-ai";

// Starts the local database over with your own data: removes every course and every student account
// (with everything attached to them), keeps the teacher accounts, then creates the students and one
// course you name. It refuses to run in production and does nothing unless you pass --yes.
//
//   npm run db:reset-real -- --yes
//   npm run db:reset-real -- --yes --students 1@ex.text,2@ex.text --course MACM101 --subject "Discrete Mathematics"

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("This script cannot run in production.");
    process.exitCode = 1;
    return;
  }
  const emails = option("students", "1@ex.text,2@ex.text").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const courseName = option("course", "MACM101");
  const subject = option("subject", "Mathematics");
  const teacherEmail = option("teacher", "t@example.test").toLowerCase();
  const confirmed = process.argv.includes("--yes");
  const prisma = new PrismaClient();
  try {
    const [courses, students, sessions, materials] = await Promise.all([
      prisma.course.count(),
      prisma.user.count({ where: { role: Role.STUDENT } }),
      prisma.session.count(),
      prisma.material.count(),
    ]);
    console.info(`The database has ${courses} courses, ${sessions} sessions, ${materials} materials and ${students} student accounts.`);
    if (!confirmed) {
      console.info(`Nothing was changed. Run again with --yes to delete all of them (teacher accounts are kept) and create ${courseName} with ${emails.join(" and ")}.`);
      return;
    }

    const passwordHash = await hash(demoPassword, 12);
    await prisma.$transaction(async (tx) => {
      const studentIds = (await tx.user.findMany({ where: { role: Role.STUDENT }, select: { id: true } })).map((u) => u.id);
      await tx.agentProposal.deleteMany({});
      await tx.agentRun.deleteMany({});
      await tx.agentMemory.deleteMany({});
      await tx.studentRequest.deleteMany({});
      await tx.progressRecord.deleteMany({});
      await tx.deduction.deleteMany({});
      await tx.attendance.deleteMany({});
      await tx.sessionChange.deleteMany({});
      await tx.session.deleteMany({});
      await tx.material.deleteMany({});
      await tx.courseUnit.deleteMany({});
      await tx.enrollment.deleteMany({});
      await tx.quiz.deleteMany({});
      await tx.knowledgeEntry.deleteMany({});
      await tx.dashboardLayout.deleteMany({});
      await tx.course.deleteMany({});
      await tx.user.deleteMany({ where: { id: { in: studentIds } } });

      const teacher = await tx.user.upsert({
        where: { email: teacherEmail },
        create: { name: "Demo Teacher", email: teacherEmail, role: Role.TEACHER, passwordHash },
        update: {},
      });
      if (teacher.role !== Role.TEACHER) throw new Error(`${teacherEmail} is not a teacher account.`);
      const course = await tx.course.create({
        data: { teacherId: teacher.id, name: courseName, subject, type: emails.length > 1 ? CourseType.SMALL_CLASS : CourseType.ONE_ON_ONE, pricePerSessionCents: 0 },
      });
      for (const [index, email] of emails.entries()) {
        const student = await tx.user.create({ data: { name: `Student ${index + 1}`, email, role: Role.STUDENT, passwordHash } });
        await tx.enrollment.create({ data: { courseId: course.id, studentId: student.id } });
      }
    });
    console.info(`Done. Removed the old data, kept the teacher accounts, and created ${courseName} (${subject}) taught by ${teacherEmail} with ${emails.join(" and ")}.`);
    console.info("The new students use the same demo password as the other accounts (stored in prisma/seed.ts); each can change it in Settings.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not reset the data.");
  process.exitCode = 1;
});
