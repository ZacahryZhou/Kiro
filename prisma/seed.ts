import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

// Keep the demo password in this seed file. Never print it to logs or documentation.
const demoPassword = "123456";

const accounts = [
  { name: "Demo Teacher", email: "t@example.test", role: Role.TEACHER },
  { name: "Demo Student", email: "s@example.test", role: Role.STUDENT },
];

const legacyDemoEmails = [
  "teacher1@example.test",
  "teacher2@example.test",
  "student1@example.test",
  "student2@example.test",
  "student3@example.test",
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Demo seed data cannot be used in production.");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();

  try {
    const passwordHash = await hash(demoPassword, 12);

    await prisma.$transaction(async (tx) => {
      // Replace the previous seed-only accounts. Foreign-key restrictions keep linked data safe.
      await tx.user.deleteMany({ where: { email: { in: legacyDemoEmails } } });
      await Promise.all(
        accounts.map((account) =>
          tx.user.upsert({
            where: { email: account.email },
            create: { ...account, passwordHash },
            update: { ...account, passwordHash },
          }),
        ),
      );
    });

    console.info(`Demo accounts are ready (${accounts.length}); no courses were created.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Failed to initialize demo accounts. Check the database connection and migrations.");
  process.exitCode = 1;
});
