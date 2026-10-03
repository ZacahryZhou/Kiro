import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

// Keep the demo password in this seed file. Never print it to logs or documentation.
const demoPassword = "94v8yZ3sSykNGWuRBe7L_0oH";

const accounts = [
  { name: "Alex Morgan", email: "teacher1@example.test", role: Role.TEACHER },
  { name: "Taylor Chen", email: "teacher2@example.test", role: Role.TEACHER },
  { name: "Jordan Lee", email: "student1@example.test", role: Role.STUDENT },
  { name: "Sam Patel", email: "student2@example.test", role: Role.STUDENT },
  { name: "Casey Kim", email: "student3@example.test", role: Role.STUDENT },
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

    await prisma.$transaction(
      accounts.map((account) =>
        prisma.user.upsert({
          where: { email: account.email },
          create: { ...account, passwordHash },
          update: { ...account, passwordHash },
        }),
      ),
    );

    console.info(`Demo accounts are ready (${accounts.length}); no courses were created.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Failed to initialize demo accounts. Check the database connection and migrations.");
  process.exitCode = 1;
});
