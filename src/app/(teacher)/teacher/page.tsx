import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorAlert, PageHeader, StatCard } from "@/components/page";
import { requireActor } from "@/lib/auth/actor";
import { formatLocalDate, formatLocalTime, getLocalDateKey, getWeekRange } from "@/lib/time";
import { getTeacherSchedule, type SessionView } from "@/services/read";

const statusLabels = {
  SCHEDULED: "Scheduled",
  RESCHEDULED: "Rescheduled",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
} as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const weekOffset = params.week === "next" ? 1 : 0;
  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const { from, to } = getWeekRange(weekOffset, new Date(), timeZone);
  const result = await getTeacherSchedule(actor, { from: from.toISOString(), to: to.toISOString() });

  const groups = new Map<string, SessionView[]>();
  if (result.ok) {
    for (const session of result.data.sessions) {
      const key = getLocalDateKey(new Date(session.startAt), timeZone);
      groups.set(key, [...(groups.get(key) ?? []), session]);
    }
  }

  const startLabel = formatLocalDate(from, timeZone);
  const lastDay = new Date(to.getTime() - 1);
  const endLabel = new Intl.DateTimeFormat("en-US", { timeZone, month: "long", day: "numeric" }).format(lastDay);

  const todayKey = getLocalDateKey(new Date(), timeZone);
  const sessions = result.ok ? result.data.sessions : [];
  const upcoming = sessions.filter((session) => session.status === "SCHEDULED" || session.status === "RESCHEDULED").length;
  const completed = sessions.filter((session) => session.status === "COMPLETED").length;
  const courseCount = new Set(sessions.map((session) => session.courseId)).size;
  const segment = (active: boolean) =>
    `inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Teacher Workspace"
        title="Schedule"
        description={`${weekOffset === 0 ? "This week" : "Next week"} · ${startLabel} – ${endLabel}`}
        actions={
          <nav aria-label="Teacher workspace navigation" className="flex flex-wrap items-center gap-2">
            <Link
              href="/teacher/courses"
              className="inline-flex h-9 items-center justify-center rounded-lg border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Manage courses
            </Link>
            <div className="flex rounded-xl border bg-muted/60 p-1">
              <Link href="/teacher" className={segment(weekOffset === 0)} aria-current={weekOffset === 0 ? "page" : undefined}>This week</Link>
              <Link href="/teacher?week=next" className={segment(weekOffset === 1)} aria-current={weekOffset === 1 ? "page" : undefined}>Next week</Link>
            </div>
          </nav>
        }
      />

      {result.ok && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard icon={CalendarDays} label="Sessions" value={sessions.length} hint={weekOffset === 0 ? "This week" : "Next week"} />
          <StatCard icon={Clock3} label="Upcoming" value={upcoming} hint="Scheduled or rescheduled" />
          <StatCard icon={CheckCircle2} label="Completed" value={completed} />
          <StatCard icon={BookOpen} label="Courses" value={courseCount} hint="With sessions in view" />
        </div>
      )}

      {!result.ok ? (
        <ErrorAlert message={result.error.message} />
      ) : result.data.sessions.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No sessions this week" description="Ask the AI assistant to create a course when you are ready." />
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([dateKey, daySessions]) => (
            <section key={dateKey} aria-labelledby={`date-${dateKey}`} className="kora-card overflow-hidden">
              <h2 id={`date-${dateKey}`} className="flex items-center justify-between border-b bg-muted/40 px-5 py-3 text-sm font-semibold">
                {formatLocalDate(new Date(`${dateKey}T12:00:00Z`), "UTC")}
                {dateKey === todayKey && <Badge>Today</Badge>}
              </h2>
              <ul className="divide-y">
                {daySessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`/teacher/courses/${session.courseId}`}
                      className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <time dateTime={session.startAt} className="w-16 shrink-0 font-medium tabular-nums">
                        {formatLocalTime(new Date(session.startAt), timeZone)}
                      </time>
                      <span className="min-w-40 flex-1 font-medium">{session.courseName}</span>
                      <span className="text-sm text-muted-foreground">{session.durationMin} min</span>
                      <Badge variant={session.status === "CANCELLED" ? "destructive" : session.status === "COMPLETED" ? "secondary" : "outline"}>
                        {statusLabels[session.status]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
