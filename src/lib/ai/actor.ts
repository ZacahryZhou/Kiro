import type { Actor } from "@/contracts";
import { getActor } from "@/lib/auth/actor";
import { actorFor } from "./dev/fake-store";

/**
 * Who is calling an AI route. Identity comes only from the server: never from the request body.
 * While the AI still runs on fake services (before H3/H6), set DEV_ACTOR_EMAIL to act as a demo user;
 * that shortcut is ignored in production. Otherwise the signed-in session is used.
 */
export async function getAiActor(): Promise<Actor | null> {
  const devEmail = process.env.DEV_ACTOR_EMAIL;
  if (devEmail && process.env.NODE_ENV !== "production") return actorFor(devEmail) ?? null;
  try {
    return await getActor();
  } catch {
    return null;
  }
}
