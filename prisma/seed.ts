import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

// 演示密码只保存在种子文件中，不输出到日志或文档。
const demoPassword = "94v8yZ3sSykNGWuRBe7L_0oH";

const accounts = [
  { name: "陈老师", email: "teacher1@example.test", role: Role.TEACHER },
  { name: "刘老师", email: "teacher2@example.test", role: Role.TEACHER },
  { name: "小王", email: "student1@example.test", role: Role.STUDENT },
  { name: "小李", email: "student2@example.test", role: Role.STUDENT },
  { name: "小陈", email: "student3@example.test", role: Role.STUDENT },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("生产环境禁止运行演示账号种子脚本。");
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

    console.info(`演示账号已就绪，共 ${accounts.length} 个；未创建课程。`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("初始化演示账号失败，请检查数据库连接与迁移状态。");
  process.exitCode = 1;
});
