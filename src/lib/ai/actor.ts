import type { Actor } from "@/contracts";
import { getActor } from "@/lib/auth/actor";

/** AI identity always comes from the authenticated server session. */
export async function getAiActor(): Promise<Actor | null> {
  try {
    return await getActor();
  } catch {
    return null;
  }
}
