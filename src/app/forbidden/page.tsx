import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireActor } from "@/lib/auth/actor";

export default async function ForbiddenPage() {
  const actor = await requireActor();
  return (
    <main className="kora-backdrop flex min-h-screen items-center justify-center px-5">
      <section className="kora-card w-full max-w-md p-8 text-center shadow-xl shadow-black/5">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted"><ShieldAlert className="size-6" aria-hidden /></span>
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="my-5 text-muted-foreground">Your account does not have access to this area.</p>
        <Link className="inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/85" href={actor.role === "TEACHER" ? "/teacher" : "/student"}>Return to my workspace</Link>
      </section>
    </main>
  );
}
