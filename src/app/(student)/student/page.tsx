import { requireRole } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
export default async function Page() {
  const actor = await requireRole("STUDENT");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } });
  return (
    <section className="rounded-2xl border bg-white p-8">
      <p className="mb-2 text-sm text-muted-foreground">Student Workspace</p>
      <h1 className="text-2xl font-semibold">Welcome back, {user.name}</h1>
      <p className="mt-4 text-muted-foreground">You are signed in. Your learning space is ready.</p>
    </section>
  );
}
