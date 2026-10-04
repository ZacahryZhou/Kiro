import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { AgentConsole } from "@/features/ai-agent/AgentConsole";
import { getAiActor } from "@/lib/ai/actor";
import { currentUserCanViewConsole } from "@/lib/ai/trace/viewer";

// Admin page: live view of the AI agent pipeline. Thin wrapper; the console lives in features/ai-agent.
export default async function Page() {
  const actor = await getAiActor();
  if (!actor) redirect("/login");
  if (!(await currentUserCanViewConsole())) notFound();
  return (
    <div className="kora-backdrop min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Brand href={actor.role === "TEACHER" ? "/teacher" : "/student"} tagline="Admin" />
          <Link
            href={actor.role === "TEACHER" ? "/teacher" : "/student"}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to workspace
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <AgentConsole role={actor.role} />
      </main>
    </div>
  );
}
