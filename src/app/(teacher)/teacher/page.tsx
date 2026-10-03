import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireActor } from "@/lib/auth/actor";
import { formatLocalDate, formatLocalTime, getLocalDateKey, getWeekRange } from "@/lib/time";
import { getTeacherSchedule, type SessionView } from "@/services/read";

const statusLabels = {
  SCHEDULED: "待上课",
  RESCHEDULED: "已改期",
  CANCELLED: "已取消",
  COMPLETED: "已完成",
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
  const endLabel = new Intl.DateTimeFormat("zh-CN", { timeZone, month: "long", day: "numeric" }).format(lastDay);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">教师工作台</p>
          <h1 className="text-2xl font-semibold">课程表</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {weekOffset === 0 ? "本周" : "下周"} · {startLabel} 至 {endLabel}
          </p>
        </div>
        <nav aria-label="切换课表周次" className="flex gap-2">
          <Link
            href="/teacher"
            className={`inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${weekOffset === 0 ? "bg-primary text-primary-foreground" : "border bg-background hover:bg-accent"}`}
          >
            本周
          </Link>
          <Link
            href="/teacher?week=next"
            className={`inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${weekOffset === 1 ? "bg-primary text-primary-foreground" : "border bg-background hover:bg-accent"}`}
          >
            下周
          </Link>
        </nav>
      </div>

      {!result.ok ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {result.error.message}
        </div>
      ) : result.data.sessions.length === 0 ? (
        <div className="rounded-2xl border bg-white px-6 py-14 text-center">
          <h2 className="text-lg font-medium">这周还没有课程</h2>
          <p className="mt-2 text-sm text-muted-foreground">还没有课程，可以让 AI 助手帮你建课</p>
        </div>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([dateKey, sessions]) => (
            <section key={dateKey} aria-labelledby={`date-${dateKey}`} className="overflow-hidden rounded-2xl border bg-white">
              <h2 id={`date-${dateKey}`} className="border-b px-5 py-3 text-sm font-semibold">
                {formatLocalDate(new Date(`${dateKey}T12:00:00Z`), "UTC")}
              </h2>
              <ul className="divide-y">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`/teacher/courses/${session.courseId}`}
                      className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <time dateTime={session.startAt} className="w-16 shrink-0 font-medium tabular-nums">
                        {formatLocalTime(new Date(session.startAt), timeZone)}
                      </time>
                      <span className="min-w-40 flex-1 font-medium">{session.courseName}</span>
                      <span className="text-sm text-muted-foreground">{session.durationMin} 分钟</span>
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
