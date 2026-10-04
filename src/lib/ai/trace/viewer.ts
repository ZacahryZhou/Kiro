import { auth } from "@/lib/auth";
import { getAiActor } from "../actor";
import { canViewAgentConsole } from "./access";

/** True when the signed-in user may open the Agent Console (page and event stream). */
export async function currentUserCanViewConsole(): Promise<boolean> {
  try {
    const actor = await getAiActor();
    if (!actor) return false;
    const session = await auth();
    return canViewAgentConsole(actor, session?.user?.email);
  } catch {
    return false;
  }
}
