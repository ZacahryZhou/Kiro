import Link from "next/link";
import { ArrowRight, BookOpenCheck, CalendarDays, CheckCircle2, ClipboardCheck, LockKeyhole, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { HomeProductPreview } from "@/components/home-product-preview";

const ctaBase = "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-6 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const ctaPrimary = `${ctaBase} bg-primary text-primary-foreground shadow-sm hover:bg-primary/85`;
const ctaOutline = `${ctaBase} border bg-card hover:bg-muted`;
const ctaLight = `${ctaBase} bg-white text-foreground hover:bg-white/90`;

const pillars = [
  {
    icon: ShieldCheck,
    title: "The AI proposes, you confirm",
    description: "Every change starts as a preview. Nothing is written until the teacher clicks Confirm, and a confirmation applies at most once.",
  },
  {
    icon: BookOpenCheck,
    title: "Answers grounded in your materials",
    description: "Students ask questions in plain language. Each answer cites the course material it came from, checked by code, or says it could not find it.",
  },
  {
    icon: LockKeyhole,
    title: "Everyone sees only their own data",
    description: "Teachers see their own courses and students. Students see only themselves. The assistant works with the same limits.",
  },
];

const features = [
  { icon: CalendarDays, title: "Schedules without clashes", description: "Weekly schedules for teachers and students, with conflict checks before a session is created." },
  { icon: ClipboardCheck, title: "Attendance and lesson balance", description: "Mark attendance by sentence or by form. Deductions are calculated by code, never guessed." },
  { icon: Users, title: "Courses, units and materials", description: "One-to-one or small-class courses with units, text lessons and links your students can read anytime." },
];

const teacherSteps = [
  "Sign in and see your week at a glance",
  "Tell the assistant who attended; review the preview",
  "Confirm once, and attendance and lesson balance update",
];
const studentSteps = [
  "Sign in and see your courses and upcoming sessions",
  "Open course materials any time",
  "Ask the assistant about your course and get cited answers",
];

export function Landing() {
  return (
    <div className="kora-backdrop min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Brand tagline="Learning collaboration" />
          <Link href="/login" className={`${ctaPrimary} h-9 px-4`}>Sign in</Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b">
          <div className="kora-hero-mesh pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-6 pb-24 pt-14 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <p className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                <Sparkles className="size-3.5" aria-hidden />
                For small tutoring providers
              </p>
              <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight md:text-5xl md:leading-[1.08]">
                Make every lesson count.
                <span className="mt-1 block text-muted-foreground">An assistant you can trust with the schedule.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                Kiro is a shared learning space for teachers and students. Tell the AI what happened in plain language; it prepares the change, and you decide whether it happens.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/login" className={ctaPrimary}>
                  Sign in to Kiro
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <a href="#how-it-works" className={ctaOutline}>See how it works</a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-2">
                {["Preview before every change", "Cited answers from course materials", "Private by design"].map((item) => (
                  <li key={item} className="inline-flex items-center gap-1.5 rounded-full border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
              <HomeProductPreview />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-b bg-muted/30 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">Built around trust</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">AI that helps, and cannot act on its own</h2>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {pillars.map((pillar) => (
                <div key={pillar.title} className="kora-card p-6 hover:-translate-y-0.5 hover:shadow-md">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <pillar.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pillar.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">Everything connected</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">The daily work of teaching, in one place</h2>
            </div>
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="kora-card p-6 hover:-translate-y-0.5 hover:shadow-md">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
                    <feature.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { label: "For teachers", title: "Spend less time on admin", steps: teacherSteps },
              { label: "For students", title: "Know what is next, and ask when stuck", steps: studentSteps },
            ].map((card) => (
              <div key={card.label} className="kora-card p-8 hover:shadow-md">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{card.label}</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight">{card.title}</h3>
                <ol className="mt-6 space-y-3">
                  {card.steps.map((step, index) => (
                    <li key={step} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">{index + 1}</span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20 pt-10">
          <div className="kora-dark-panel rounded-[2rem] px-8 py-12 text-center text-white md:px-12">
            <h2 className="text-3xl font-semibold tracking-tight">Ready to try Kiro?</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/75 md:text-base">
              Sign in with your teacher or student account to open your workspace.
            </p>
            <Link href="/login" className={`${ctaLight} mt-8`}>
              Sign in
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 text-sm text-muted-foreground">
          <Brand tagline="Learning collaboration" />
          <p>Kiro · Teachers propose, you confirm.</p>
        </div>
      </footer>
    </div>
  );
}
