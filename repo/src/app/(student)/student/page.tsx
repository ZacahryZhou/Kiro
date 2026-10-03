import { requireRole } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
export default async function Page() {
  const actor = await requireRole("STUDENT");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } });
  return (
    <section className="rounded-2xl border bg-white p-8">
      <p className="mb-2 text-sm text-muted-foreground">学生空间</p>
      <h1 className="text-2xl font-semibold">{user.name}，欢迎回来</h1>
      <p className="mt-4 text-muted-foreground">登录成功，您的学习空间已就绪。</p>
    </section>
  );
}
