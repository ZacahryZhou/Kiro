import { err, ok, type Actor, type Result, type Role } from "@/contracts";
import { prisma } from "@/lib/db/prisma";

export type ProfileView = { name: string; email: string; role: Role };

/**
 * The signed-in user's own account details. The query is scoped to the actor's own row, so it can
 * only ever return the caller's information, never anyone else's.
 */
export async function getMyProfile(actor: Actor): Promise<Result<{ profile: ProfileView }>> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { name: true, email: true, role: true },
    });
    if (!user) return err("NOT_FOUND", "Account not found.");
    return ok({ profile: { name: user.name, email: user.email, role: user.role } });
  } catch {
    return err("INTERNAL", "Could not load your account details. Please try again.");
  }
}
