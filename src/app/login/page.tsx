import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth/actor";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if (await getActor()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border bg-white shadow-sm md:grid-cols-2">
        <section className="flex flex-col justify-between bg-slate-900 p-8 text-white md:p-12">
          <p className="text-xl font-semibold tracking-tight">Kora</p>
          <div className="py-12">
            <p className="mb-4 text-sm text-cyan-300">Better learning starts here</p>
            <h1 className="text-3xl font-semibold leading-relaxed">Make every lesson<br />count.</h1>
            <p className="mt-5 text-sm leading-7 text-slate-300">A shared learning space for teachers and students.</p>
          </div>
          <p className="text-xs text-slate-400">Kora · Learning Collaboration</p>
        </section>
        <section className="flex flex-col justify-center p-8 md:p-12">
          <h2 className="text-2xl font-semibold">Welcome back</h2>
          <p className="mb-8 mt-2 text-sm text-muted-foreground">Sign in to your learning space with your email and password.</p>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
