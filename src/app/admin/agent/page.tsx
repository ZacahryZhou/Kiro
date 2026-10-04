import { notFound, redirect } from "next/navigation";
import { AgentConsole } from "@/features/ai-agent/AgentConsole";
import { getAiActor } from "@/lib/ai/actor";
import { currentUserCanViewConsole } from "@/lib/ai/trace/viewer";

// Admin page: live view of the AI agent pipeline. Thin wrapper; the console lives in features/ai-agent.
export default async function Page() {
  const actor = await getAiActor();
  if (!actor) redirect("/login");
  if (!(await currentUserCanViewConsole())) notFound();
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-6">
      <AgentConsole role={actor.role} />
    </main>
  );
}
