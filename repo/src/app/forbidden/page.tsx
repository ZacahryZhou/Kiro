import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";

export default async function ForbiddenPage() {
  const actor = await requireActor();
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
      <section className="w-full max-w-md rounded-2xl border bg-white p-8 text-center">
        <h1 className="text-2xl font-semibold">无权访问</h1>
        <p className="my-5 text-muted-foreground">当前账号无法访问此区域。</p>
        <Link className="font-medium underline underline-offset-4" href={actor.role === "TEACHER" ? "/teacher" : "/student"}>返回我的工作台</Link>
      </section>
    </main>
  );
}
