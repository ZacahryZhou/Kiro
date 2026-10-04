import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { getActor } from "@/lib/auth/actor";
import { Brand } from "@/components/brand";
import { HomeProductPreview } from "@/components/home-product-preview";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if (await getActor()) redirect("/");
  return (
    <main className="kora-backdrop min-h-screen lg:grid lg:grid-cols-2">
      <section className="kora-dark-panel relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <Brand tone="dark" />
        <div className="py-10">
          <p className="mb-4 text-sm text-cyan-300">Better learning starts here</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Make every lesson<br />count.</h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-slate-300">A shared learning space for teachers and students.</p>
          <ul className="mt-8 space-y-2 text-sm text-slate-200">
            {["The AI proposes, you confirm", "Cited answers from your course materials", "Each person sees only their own data"].map((item) => (
              <li key={item} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-cyan-300" aria-hidden />{item}</li>
            ))}
          </ul>
        </div>
        <div className="max-w-sm pb-4"><HomeProductPreview /></div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <span className="lg:hidden"><Brand /></span>
            <Link href="/" className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="size-3.5" aria-hidden />
              Back to home
            </Link>
          </div>
          <div className="kora-card p-7 shadow-xl shadow-black/5 sm:p-8">
            <h2 className="text-2xl font-semibold">Welcome back</h2>
            <p className="mb-7 mt-2 text-sm text-muted-foreground">Sign in to your learning space with your email and password.</p>
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
