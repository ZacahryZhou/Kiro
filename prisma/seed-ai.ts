import {
  AttendanceStatus, CourseType, DeductionReason, MaterialKind, MemoryKind,
  KnowledgeKind, PrismaClient, Role, SessionStatus,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { APP_TZ, zonedTimeToUtc } from "../src/lib/ai/core/time";

// Idempotent local acceptance fixtures. Rows with kora-ai-* IDs belong to this seed only;
// no unrelated user data is deleted. The shared demo password stays in this file.
export const demoPassword = "123456";

type Day = { year: number; month: number; day: number };
const plusDays = (day: Day, by: number): Day => {
  const next = new Date(Date.UTC(day.year, day.month - 1, day.day + by));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
};

function localDay(date: Date): Day {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map(({ type, value }) => [type, Number(value)]));
  return { year: parts.year, month: parts.month, day: parts.day };
}

function nextWeekday(from: Day, weekday: number): Day {
  const date = new Date(Date.UTC(from.year, from.month - 1, from.day));
  const distance = ((weekday - date.getUTCDay() + 7) % 7) || 7;
  return plusDays(from, distance);
}

async function upsertSession(prisma: PrismaClient, input: { id: string; courseId: string; startAt: Date; status: SessionStatus }) {
  // A session that already has attendance was used in a demo; never contradict those records.
  const used = await prisma.attendance.count({ where: { sessionId: input.id } });
  if (used > 0) return;
  return prisma.session.upsert({
    where: { id: input.id },
    create: { ...input, durationMin: 60, location: "Online" },
    update: { ...input, durationMin: 60, location: "Online" },
  });
}

/** Removes everything the fixture teachers and students own or created (including data made by the AI). */
export async function resetFixtures(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seed data cannot be used in production.");
  const users = await prisma.user.findMany({ where: { id: { startsWith: "kora-ai-" } }, select: { id: true, role: true } });
  const userIds = users.map((user) => user.id);
  const courseIds = (await prisma.course.findMany({ where: { teacherId: { in: userIds } }, select: { id: true } })).map((c) => c.id);
  await prisma.$transaction([
    prisma.agentProposal.deleteMany({ where: { actorId: { in: userIds } } }),
    prisma.agentRun.deleteMany({ where: { actorId: { in: userIds } } }),
    prisma.agentMemory.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { studentId: { in: userIds } }, { courseId: { in: courseIds } }] } }),
    prisma.deduction.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.attendance.deleteMany({ where: { session: { courseId: { in: courseIds } } } }),
    prisma.sessionChange.deleteMany({ where: { session: { courseId: { in: courseIds } } } }),
    prisma.progressRecord.deleteMany({ where: { OR: [{ session: { courseId: { in: courseIds } } }, { studentId: { in: userIds } }] } }),
    prisma.dashboardLayout.deleteMany({ where: { teacherId: { in: userIds } } }),
    prisma.knowledgeEntry.deleteMany({ where: { teacherId: { in: userIds } } }),
    prisma.studentRequest.deleteMany({ where: { OR: [{ session: { courseId: { in: courseIds } } }, { studentId: { in: userIds } }] } }),
    prisma.session.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.material.deleteMany({ where: { unit: { courseId: { in: courseIds } } } }),
    prisma.courseUnit.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.enrollment.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.course.deleteMany({ where: { id: { in: courseIds } } }),
  ]);
}

/**
 * Creates (or refreshes) the AI acceptance fixtures. With `reset`, first removes everything the
 * fixture accounts own, so a demo can be repeated from a clean slate.
 */
export async function seedFixtures(prisma: PrismaClient, options: { reset?: boolean } = {}): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seed data cannot be used in production.");
  if (options.reset) await resetFixtures(prisma);
  const passwordHash = await hash(demoPassword, 12);
  const personas = [
    { key: "alex", name: "Alex Morgan", email: "t+alex@example.test", role: Role.TEACHER },
    { key: "taylor", name: "Taylor Chen", email: "t+taylor@example.test", role: Role.TEACHER },
    { key: "jordan", name: "Jordan Lee", email: "s+jordan@example.test", role: Role.STUDENT },
    { key: "sam", name: "Sam Patel", email: "s+sam@example.test", role: Role.STUDENT },
    { key: "casey", name: "Casey Kim", email: "s+casey@example.test", role: Role.STUDENT },
  ] as const;
  const users = Object.fromEntries(await Promise.all(personas.map(async (persona) => {
    const user = await prisma.user.upsert({
      where: { email: persona.email },
      create: { id: `kora-ai-${persona.key}`, name: persona.name, email: persona.email, role: persona.role, passwordHash },
      update: { name: persona.name, role: persona.role, passwordHash },
    });
    return [persona.key, user] as const;
  })));
  const { alex, taylor, jordan, sam, casey } = users;

  const courses = [
    { id: "kora-ai-course-math", teacherId: alex.id, name: "Grade 8 Math Small Group", subject: "Mathematics", type: CourseType.SMALL_CLASS, pricePerSessionCents: 4000 },
    { id: "kora-ai-course-physics", teacherId: alex.id, name: "Grade 8 Physics 1:1", subject: "Physics", type: CourseType.ONE_ON_ONE, pricePerSessionCents: 6000 },
    { id: "kora-ai-course-english", teacherId: taylor.id, name: "Grade 10 English 1:1", subject: "English", type: CourseType.ONE_ON_ONE, pricePerSessionCents: 5000 },
  ] as const;
  for (const course of courses) {
    await prisma.course.upsert({
      where: { id: course.id },
      create: { ...course, location: "Online", description: "Kora AI acceptance fixture." },
      update: { ...course, location: "Online", description: "Kora AI acceptance fixture." },
    });
  }
  const enrollments = [
    [courses[0].id, jordan.id], [courses[0].id, sam.id],
    [courses[1].id, jordan.id], [courses[2].id, casey.id],
  ] as const;
  for (const [courseId, studentId] of enrollments) {
    await prisma.enrollment.upsert({
      where: { courseId_studentId: { courseId, studentId } },
      create: { courseId, studentId }, update: {},
    });
  }

  const units = [
    { id: "kora-ai-unit-equations", courseId: courses[0].id, title: "Linear Equations", order: 1 },
    { id: "kora-ai-unit-ratios", courseId: courses[0].id, title: "Ratios and Proportions", order: 2 },
    { id: "kora-ai-unit-motion", courseId: courses[1].id, title: "Motion", order: 1 },
    { id: "kora-ai-unit-writing", courseId: courses[2].id, title: "Argument Writing", order: 1 },
  ] as const;
  for (const unit of units) {
    await prisma.courseUnit.upsert({ where: { id: unit.id }, create: unit, update: unit });
  }
  const materials = [
    { id: "kora-ai-material-equations", unitId: units[0].id, title: "Solving Linear Equations", kind: MaterialKind.TEXT, content: "A linear equation has the form ax + b = c. Subtract b from both sides, then divide by a to isolate x when a is not zero. For example, 2x + 4 = 10 gives x = 3." },
    { id: "kora-ai-material-ratios", unitId: units[1].id, title: "Equivalent Ratios", kind: MaterialKind.TEXT, content: "Equivalent ratios represent the same relationship. Multiply or divide both terms by the same non-zero number to make an equivalent ratio. A ratio of 2:3 is equivalent to 4:6." },
    { id: "kora-ai-material-motion", unitId: units[2].id, title: "Average Speed", kind: MaterialKind.TEXT, content: "Average speed equals total distance divided by total time. If an object travels 120 kilometres in 2 hours, its average speed is 60 kilometres per hour." },
    { id: "kora-ai-material-writing", unitId: units[3].id, title: "Claim and Evidence", kind: MaterialKind.TEXT, content: "A clear argument includes a specific claim, relevant evidence, and reasoning that explains how the evidence supports the claim." },
  ] as const;
  for (const material of materials) {
    await prisma.material.upsert({ where: { id: material.id }, create: material, update: material });
  }

  const today = localDay(new Date());
  const todayFuture = new Date(Date.now() + 60 * 60 * 1000);
  const futureParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(todayFuture).filter((part) => part.type !== "literal").map(({ type, value }) => [type, Number(value)]));
  const todayStart = zonedTimeToUtc({ ...localDay(todayFuture), hour: futureParts.hour, minute: futureParts.minute });
  const nextTue = nextWeekday(today, 2);
  const nextThu = nextWeekday(today, 4);
  const sessionPlans: { id: string; courseId: string; startAt: Date; status: SessionStatus }[] = [
    { id: "kora-ai-session-math-today", courseId: courses[0].id, startAt: todayStart, status: SessionStatus.SCHEDULED },
    { id: "kora-ai-session-math-tue", courseId: courses[0].id, startAt: zonedTimeToUtc({ ...nextTue, hour: 16 }), status: SessionStatus.SCHEDULED },
    { id: "kora-ai-session-math-thu", courseId: courses[0].id, startAt: zonedTimeToUtc({ ...nextThu, hour: 16 }), status: SessionStatus.SCHEDULED },
    { id: "kora-ai-session-physics-tue", courseId: courses[1].id, startAt: zonedTimeToUtc({ ...nextTue, hour: 16 }), status: SessionStatus.SCHEDULED },
    { id: "kora-ai-session-english-next", courseId: courses[2].id, startAt: zonedTimeToUtc({ ...nextTue, hour: 17 }), status: SessionStatus.SCHEDULED },
  ];
  for (const offset of [21, 14, 7]) {
    sessionPlans.push({
      id: `kora-ai-session-history-${offset}`,
      courseId: courses[0].id,
      startAt: zonedTimeToUtc({ ...plusDays(today, -offset), hour: 16 }),
      status: SessionStatus.COMPLETED,
    });
  }
  for (const plan of sessionPlans) await upsertSession(prisma, plan);

  // Seed 3 historical records per math student so trend analysis can distinguish enough data.
  for (const studentId of [jordan.id, sam.id]) {
    for (const offset of [21, 14, 7]) {
      const sessionId = `kora-ai-session-history-${offset}`;
      const status = studentId === sam.id && offset === 7 ? AttendanceStatus.LEAVE : AttendanceStatus.PRESENT;
      await prisma.attendance.upsert({
        where: { sessionId_studentId: { sessionId, studentId } },
        create: { sessionId, studentId, status, markedById: alex.id },
        update: { status, markedById: alex.id },
      });
      if (status === AttendanceStatus.LEAVE) {
        await prisma.deduction.deleteMany({ where: { sessionId, studentId } });
      } else {
        await prisma.deduction.upsert({
          where: { sessionId_studentId: { sessionId, studentId } },
          create: { sessionId, studentId, courseId: courses[0].id, amountCents: 4000, reason: DeductionReason.PRESENT },
          update: { courseId: courses[0].id, amountCents: 4000, reason: DeductionReason.PRESENT },
        });
      }
    }
  }

  const memories = [
    { id: "kora-ai-memory-jordan", courseId: courses[0].id, studentId: jordan.id, teacherId: alex.id, kind: MemoryKind.AVAILABILITY, content: "Unavailable Tuesday and Thursday afternoons." },
    { id: "kora-ai-memory-sam", courseId: courses[0].id, studentId: sam.id, teacherId: alex.id, kind: MemoryKind.NOTE, content: "Needs extra practice with functions." },
  ] as const;
  for (const memory of memories) {
    await prisma.agentMemory.upsert({ where: { id: memory.id }, create: memory, update: memory });
  }

  // A simulated teacher "knowledge base": what Alex wants the students' AI tutor to teach, in Alex's own voice.
  // Written for students to read. It is separate from the private per-student memories above.
  const knowledge: { id: string; teacherId: string; courseId: string | null; kind: KnowledgeKind; title: string; content: string }[] = [
    { id: "kora-ai-knowledge-style", teacherId: alex.id, courseId: null, kind: KnowledgeKind.TEACHING_STYLE, title: "How I like to explain",
      content: "Start with a concrete everyday example, then give the rule. Explain in short numbered steps, one idea per step. Finish by asking the student to try a similar problem on their own. Be warm and encouraging, and never say that something is easy." },
    { id: "kora-ai-knowledge-math-unit1", teacherId: alex.id, courseId: courses[0].id, kind: KnowledgeKind.LESSON_SUMMARY, title: "Unit 1: Solving linear equations",
      content: "In this unit we learn to solve equations of the form ax + b = c. The big idea is balance: whatever you do to one side of the equation you must also do to the other side. We practise one-step equations, two-step equations and equations with the variable on both sides, and we always check an answer by putting it back into the original equation." },
    { id: "kora-ai-knowledge-math-balance", teacherId: alex.id, courseId: courses[0].id, kind: KnowledgeKind.KNOWLEDGE_POINT, title: "The balance method",
      content: "Think of an equation as a balanced scale. To keep it balanced, do the same operation on both sides. To solve ax + b = c, first subtract b from both sides, then divide both sides by a. Undoing the addition first and the multiplication second is like unwrapping a present: the last thing that was done is the first thing you undo." },
    { id: "kora-ai-knowledge-math-check", teacherId: alex.id, courseId: courses[0].id, kind: KnowledgeKind.KNOWLEDGE_POINT, title: "Checking your answer",
      content: "Substitute your answer back into the original equation. If both sides are equal, the answer is correct. For 2x + 4 = 10 we found x = 3, and 2(3) + 4 = 10, so the answer works. Checking takes ten seconds and catches most mistakes." },
    { id: "kora-ai-knowledge-math-example", teacherId: alex.id, courseId: courses[0].id, kind: KnowledgeKind.EXAMPLE, title: "Worked example: 3x - 5 = 7",
      content: "Step 1: add 5 to both sides, so 3x = 12. Step 2: divide both sides by 3, so x = 4. Step 3: check by substituting: 3(4) - 5 = 7, which is true. So x = 4." },
    { id: "kora-ai-knowledge-math-mistake-sign", teacherId: alex.id, courseId: courses[0].id, kind: KnowledgeKind.COMMON_MISTAKE, title: "Forgetting to flip the inequality sign",
      content: "When you multiply or divide both sides of an inequality by a negative number, the inequality sign flips. For example, from -2x > 6 we divide by -2 and get x < -3, not x > -3. Many students lose marks here, so say the rule out loud: negative means flip." },
    { id: "kora-ai-knowledge-math-mistake-side", teacherId: alex.id, courseId: courses[0].id, kind: KnowledgeKind.COMMON_MISTAKE, title: "Changing only one side",
      content: "A very common slip is to subtract a number from one side and forget the other side. An equation only stays true if both sides get exactly the same treatment. If your answer does not check out, look for the side you forgot." },
    { id: "kora-ai-knowledge-math-faq", teacherId: alex.id, courseId: courses[0].id, kind: KnowledgeKind.FAQ, title: "Why do we use the opposite operation?",
      content: "Q: Why do we subtract to get rid of a plus? A: Because subtracting undoes adding. Adding 5 and then subtracting 5 brings you back to where you started, which leaves the variable alone on one side. That is exactly what solving means." },
    { id: "kora-ai-knowledge-math-unit2", teacherId: alex.id, courseId: courses[0].id, kind: KnowledgeKind.LESSON_SUMMARY, title: "Unit 2: Ratios and proportions",
      content: "A ratio compares two quantities of the same kind, like 2 cups of flour to 3 cups of sugar, written 2:3. Equivalent ratios describe the same relationship, and we find them by multiplying or dividing both numbers by the same non-zero number. We use this to scale recipes, maps and prices." },
    { id: "kora-ai-knowledge-math-equivalent", teacherId: alex.id, courseId: courses[0].id, kind: KnowledgeKind.KNOWLEDGE_POINT, title: "Equivalent ratios",
      content: "The ratio 2:3 is equivalent to 4:6 because we multiplied both numbers by 2. You can always scale a ratio up or down as long as you do the same thing to both numbers. To test two ratios, simplify both and see if they match." },
    { id: "kora-ai-knowledge-physics-speed", teacherId: alex.id, courseId: courses[1].id, kind: KnowledgeKind.KNOWLEDGE_POINT, title: "Speed and velocity",
      content: "Speed tells you how fast something moves. Velocity is speed with a direction, so a car going 60 km/h north has a velocity, while 60 km/h on its own is a speed. Average speed is the total distance divided by the total time." },
    { id: "kora-ai-knowledge-physics-example", teacherId: alex.id, courseId: courses[1].id, kind: KnowledgeKind.EXAMPLE, title: "Worked example: average speed",
      content: "A cyclist rides 30 km in 2 hours. Average speed = distance divided by time = 30 / 2 = 15 km/h. Always write the units, and check that the answer makes sense: 15 km/h is a normal cycling pace." },
    { id: "kora-ai-knowledge-english-thesis", teacherId: taylor.id, courseId: courses[2].id, kind: KnowledgeKind.KNOWLEDGE_POINT, title: "What a thesis statement does",
      content: "A thesis statement names the one claim your whole essay will defend. Put it at the end of your introduction and test it: could a reasonable person disagree with it? If not, it is a fact, not a thesis." },
  ];
  for (const note of knowledge) {
    await prisma.knowledgeEntry.upsert({ where: { id: note.id }, create: note, update: note });
  }

}

// Run directly: `npx tsx prisma/seed-ai.ts` (add `--reset` for a clean slate before seeding).
if (require.main === module) {
  const prisma = new PrismaClient();
  const reset = process.argv.includes("--reset");
  seedFixtures(prisma, { reset })
    .then(() => {
      console.info(`Kora AI acceptance fixtures are ready${reset ? " (reset first)" : ""}: two teachers, three students, three courses, conflict sessions, materials, attendance and memories.`);
    })
    .catch(() => {
      console.error("Failed to initialize AI acceptance fixtures. Check the database connection and migrations.");
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
