import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth/actor";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if (await getActor()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border bg-white shadow-sm md:grid-cols-2">
        <section className="flex flex-col justify-between bg-slate-900 p-8 text-white md:p-12">
          <p className="text-xl font-semibold tracking-tight">EduSync</p>
          <div className="py-12">
            <p className="mb-4 text-sm text-cyan-300">教学协作，从这里开始</p>
            <h1 className="text-3xl font-semibold leading-relaxed">让每一节课，<br />都衔接得更好。</h1>
            <p className="mt-5 text-sm leading-7 text-slate-300">老师与学生的共同课堂空间。</p>
          </div>
          <p className="text-xs text-slate-400">EduSync · 教学协作平台</p>
        </section>
        <section className="flex flex-col justify-center p-8 md:p-12">
          <h2 className="text-2xl font-semibold">欢迎回来</h2>
          <p className="mb-8 mt-2 text-sm text-muted-foreground">使用邮箱和密码登录你的课堂。</p>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
