import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export type Actor = { userId: string; role: Role };
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id }, select: { id: true, role: true },
  });
  return user ? { userId: user.id, role: user.role } : null;
}
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}
export async function requireRole(role: Role): Promise<Actor> {
  const actor = await requireActor();
  if (actor.role !== role) redirect("/forbidden");
  return actor;
}
