import { requireRole } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
export default async function Page() {
  const actor = await requireRole("TEACHER");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } });
  return (
    <section className="rounded-2xl border bg-white p-8">
      <p className="mb-2 text-sm text-muted-foreground">教师工作台</p>
      <h1 className="text-2xl font-semibold">{user.name}，欢迎回来</h1>
      <p className="mt-4 text-muted-foreground">登录成功，您的教学工作台已就绪。</p>
    </section>
  );
}
