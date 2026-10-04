import { notFound, redirect } from "next/navigation";
import { AiPanel } from "@/features/ai-agent";
import { getAiActor } from "@/lib/ai/actor";

// Development-only page for trying the AI panel on its own. Not available in production.
export default async function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  const actor = await getAiActor();
  if (!actor) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">AI panel test page</h1>
      <AiPanel role={actor.role} />
    </main>
  );
}
