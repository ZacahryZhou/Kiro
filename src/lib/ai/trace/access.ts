import type { Actor } from "@/contracts";

/**
 * Who may open the Agent Console. Production: only emails listed in AI_ADMIN_EMAILS (comma
 * separated). Development: any teacher, so the demo works without extra setup.
 */
export function canViewAgentConsole(actor: Actor | null, email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!actor) return false;
  const allow = (env.AI_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (email && allow.includes(email.toLowerCase())) return true;
  return env.NODE_ENV === "development" && actor.role === "TEACHER";
}
