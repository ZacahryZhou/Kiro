import Link from "next/link";
import { ArrowRight, CalendarCheck2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { DashboardItem } from "@/contracts";
import { Badge } from "@/components/ui/badge";
import { Initial } from "@/components/page";
import { NEXT_ACTION_LABELS } from "@/lib/progress";
import { formatLocalDate, formatLocalTime, getLocalDateKey } from "@/lib/time";
import type { DashboardData } from "./types";

const STATUS_LABEL = { SCHEDULED: "Scheduled", RESCHEDULED: "Rescheduled", CANCELLED: "Cancelled", COMPLETED: "Completed" } as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="flex h-full min-h-16 items-center justify-center px-2 text-center text-sm text-muted-foreground">{children}</p>;
}

function SessionRow({ session, data }: { session: DashboardData["weekSessions"][number]; data: DashboardData }) {
  const start = new Date(session.startAt);
  return (
    <li>
      <Link href={`/teacher/courses/${session.courseId}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <time dateTime={session.startAt} className="w-14 shrink-0 text-sm font-semibold tabular-nums">{formatLocalTime(start, data.timeZone)}</time>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{session.courseName}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">{session.durationMin} min</span>
        <Badge variant={session.status === "CANCELLED" ? "destructive" : session.status === "COMPLETED" ? "secondary" : "outline"}>{STATUS_LABEL[session.status]}</Badge>
      </Link>
    </li>
  );
}

function Stats({ data }: { data: DashboardData }) {
  const upcoming = data.weekSessions.filter((s) => s.status === "SCHEDULED" || s.status === "RESCHEDULED").length;
  const tiles = [
    { label: "Sessions this week", value: data.weekSessions.length },
    { label: "Still to teach", value: upcoming },
    { label: "Students", value: data.students.length },
    { label: "Open requests", value: data.requests.length },
  ];
  return (
    <div className="grid h-full grid-cols-2 items-center gap-2 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl bg-muted/60 px-3 py-2">
          <p className="text-2xl font-semibold tabular-nums leading-none">{tile.value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}

function Today({ data }: { data: DashboardData }) {
  const today = data.weekSessions.filter((s) => getLocalDateKey(new Date(s.startAt), data.timeZone) === data.todayKey);
  if (today.length === 0) return <Empty>No lessons today. Enjoy the quiet, or ask the assistant to schedule one.</Empty>;
  return (
    <div className="space-y-2">
      <ul className="space-y-0.5">{today.map((s) => <SessionRow key={s.id} session={s} data={data} />)}</ul>
      <p className="flex items-center gap-1.5 px-2 pt-1 text-xs text-muted-foreground">
        <CalendarCheck2 className="size-3.5" aria-hidden /> After a lesson, tell the assistant who came and it will prepare attendance for you to confirm.
      </p>
    </div>
  );
}

function Week({ data }: { data: DashboardData }) {
  const groups = new Map<string, DashboardData["weekSessions"]>();
  for (const session of data.weekSessions) {
    const key = getLocalDateKey(new Date(session.startAt), data.timeZone);
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  if (groups.size === 0) return <Empty>Nothing scheduled this week.</Empty>;
  return (
    <div className="space-y-3">
      <p className="px-2 text-xs text-muted-foreground">{data.weekLabel}</p>
      {[...groups.entries()].map(([key, sessions]) => (
        <section key={key} aria-label={formatLocalDate(new Date(`${key}T12:00:00Z`), "UTC")}>
          <h4 className="flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {formatLocalDate(new Date(`${key}T12:00:00Z`), "UTC")}
            {key === data.todayKey && <Badge>Today</Badge>}
          </h4>
          <ul className="mt-1 space-y-0.5">{sessions.map((s) => <SessionRow key={s.id} session={s} data={data} />)}</ul>
        </section>
      ))}
    </div>
  );
}

function Month({ data }: { data: DashboardData }) {
  const month = data.month;
  if (!month) return <Empty>The calendar could not be loaded.</Empty>;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-sm font-semibold">{month.label}</h4>
        <Link href="/teacher/calendar" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">Open <ArrowRight className="size-3" aria-hidden /></Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
        {month.weeks.flat().map((cell) => {
          const count = month.sessions[cell.key]?.length ?? 0;
          const today = cell.key === month.todayKey;
          return (
            <div key={cell.key} title={count ? `${count} session${count > 1 ? "s" : ""}` : undefined} className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs ${cell.inMonth ? "text-foreground" : "opacity-35"} ${today ? "bg-primary font-semibold text-primary-foreground" : count ? "bg-primary/15 font-medium" : ""}`}>
              {cell.day}
              {count > 0 && !today && <span className="mt-0.5 size-1 rounded-full bg-primary" aria-hidden />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Requests({ data }: { data: DashboardData }) {
  if (data.requests.length === 0) return <Empty>No requests waiting. You are all caught up.</Empty>;
  return (
    <ul className="space-y-1">
      {data.requests.slice(0, 6).map((request) => (
        <li key={request.id}>
          <Link href="/teacher/requests" className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Initial name={request.studentName} className="size-8 text-sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{request.studentName}</span>
              <span className="block truncate text-xs text-muted-foreground">{request.kind === "LEAVE" ? "Leave" : "Different time"} · {request.courseName} · {formatLocalDate(new Date(request.sessionStartAt), data.timeZone)}</span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
      {data.requests.length > 6 && <li className="px-2 pt-1 text-xs text-muted-foreground">and {data.requests.length - 6} more in Requests</li>}
    </ul>
  );
}

function Focus({ item, data }: { item: DashboardItem; data: DashboardData }) {
  const focus = item.studentId ? data.focus[item.studentId] : undefined;
  if (!focus) return <Empty>That student is not in your courses any more. Remove this widget or pick someone else.</Empty>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Initial name={focus.name} className="size-10 text-base" />
        <div className="min-w-0">
          <Link href={`/teacher/students/${focus.studentId}`} className="block truncate font-semibold hover:underline">{focus.name}</Link>
          <p className="truncate text-xs text-muted-foreground">{focus.courses.join(" · ")}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/60 py-2"><p className="text-lg font-semibold tabular-nums">{focus.ratePercent === null ? "–" : `${focus.ratePercent}%`}</p><p className="text-[11px] text-muted-foreground">Attendance</p></div>
        <div className="rounded-xl bg-muted/60 py-2"><p className="text-lg font-semibold tabular-nums">{focus.present}</p><p className="text-[11px] text-muted-foreground">Present</p></div>
        <div className="rounded-xl bg-muted/60 py-2"><p className="text-lg font-semibold tabular-nums">{focus.leave + focus.absent}</p><p className="text-[11px] text-muted-foreground">Missed</p></div>
      </div>
      {focus.nextSession && (
        <p className="text-sm"><span className="text-muted-foreground">Next: </span><Link href={`/teacher/courses/${focus.nextSession.courseId}`} className="font-medium hover:underline">{focus.nextSession.courseName}</Link> · {formatLocalDate(new Date(focus.nextSession.startAt), data.timeZone)}, {formatLocalTime(new Date(focus.nextSession.startAt), data.timeZone)}</p>
      )}
      {focus.lastProgress ? (
        <div className="rounded-xl border bg-card/60 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last progress</p>
          <p className="mt-1 font-medium">{focus.lastProgress.goal}</p>
          <p className="text-muted-foreground">{focus.lastProgress.output}</p>
          <p className="mt-1 text-xs text-muted-foreground">Next: {NEXT_ACTION_LABELS[focus.lastProgress.nextAction]}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No progress record yet.</p>
      )}
    </div>
  );
}

const shortDate = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(new Date(iso));

function Trend({ item, data }: { item: DashboardItem; data: DashboardData }) {
  const rows = data.attendance.filter((row) => !item.courseId || row.courseId === item.courseId).slice(-8);
  const rate = (row: (typeof rows)[number]) => Math.round((row.present / Math.max(1, row.present + row.leave + row.absent)) * 100);
  // The numbers and the direction are computed here; nothing in this widget comes from a model.
  if (rows.length < 3) {
    return <Empty>Insufficient data to identify a trend.{rows.length > 0 ? ` (${rows.length} session${rows.length === 1 ? "" : "s"} marked so far.)` : ""}</Empty>;
  }
  const rates = rows.map(rate);
  const latest = rates[rates.length - 1];
  const earlier = rates.slice(0, -1);
  const mean = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const delta = latest - mean;
  const direction = delta > 10 ? "up" : delta < -10 ? "down" : "steady";
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm"><Icon className="size-4 text-primary" aria-hidden /><span className="font-semibold">{direction === "up" ? "Improving" : direction === "down" ? "Slipping" : "Steady"}</span><span className="text-muted-foreground">latest {latest}%</span></p>
        <p className="text-xs text-muted-foreground">last {rows.length} sessions</p>
      </div>
      <div className="flex min-h-28 flex-1 items-stretch gap-1.5" role="img" aria-label={`Attendance by session: ${rates.map((r) => `${r}%`).join(", ")}`}>
        {rows.map((row, index) => (
          <div key={row.sessionId} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground">{rates[index]}%</span>
            <div className="relative w-full flex-1">
              <div className="dash-bar absolute inset-x-0 bottom-0 rounded-t-md bg-primary/80" style={{ height: `${Math.max(4, rates[index])}%`, ["--i" as string]: index }} title={`${row.courseName}: ${row.present} present, ${row.leave} leave, ${row.absent} absent`} />
            </div>
            <span className="text-[10px] text-muted-foreground">{shortDate(row.startAt, data.timeZone)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Progress({ data }: { data: DashboardData }) {
  if (data.progress.length === 0) return <Empty>No progress records yet. After a lesson, tell the assistant what the student worked on.</Empty>;
  return (
    <ul className="space-y-2">
      {data.progress.slice(0, 5).map((record) => (
        <li key={record.id} className="rounded-xl border bg-card/60 px-3 py-2 text-sm">
          <p className="flex items-center justify-between gap-2"><span className="font-semibold">{record.studentName}</span><span className="text-xs text-muted-foreground">{record.courseName}</span></p>
          <p className="font-medium">{record.goal}</p>
          <p className="truncate text-muted-foreground">{record.output}</p>
        </li>
      ))}
    </ul>
  );
}

function Courses({ data }: { data: DashboardData }) {
  if (data.courses.length === 0) return <Empty>No courses yet. Ask the assistant to create one.</Empty>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {data.courses.map((course) => (
        <li key={course.id}>
          <Link href={`/teacher/courses/${course.id}`} className="flex items-center justify-between gap-2 rounded-xl border bg-card/60 px-3 py-2.5 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{course.name}</span><span className="block truncate text-xs text-muted-foreground">{course.subject}</span></span>
            <Badge variant="secondary">{course.studentCount} {course.studentCount === 1 ? "student" : "students"}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The body of one widget. Pure presentation: all data arrives through `data`. */
export function WidgetBody({ item, data }: { item: DashboardItem; data: DashboardData }) {
  switch (item.type) {
    case "STATS": return <Stats data={data} />;
    case "TODAY_SESSIONS": return <Today data={data} />;
    case "WEEK_SCHEDULE": return <Week data={data} />;
    case "MONTH_CALENDAR": return <Month data={data} />;
    case "PENDING_REQUESTS": return <Requests data={data} />;
    case "STUDENT_FOCUS": return <Focus item={item} data={data} />;
    case "ATTENDANCE_TREND": return <Trend item={item} data={data} />;
    case "RECENT_PROGRESS": return <Progress data={data} />;
    case "COURSE_LIST": return <Courses data={data} />;
  }
}

/** A readable title for a widget; a student focus card names its student. */
export function widgetTitle(item: DashboardItem, data: DashboardData): string {
  if (item.title) return item.title;
  if (item.type === "STUDENT_FOCUS") return item.studentId && data.focus[item.studentId] ? `Focus: ${data.focus[item.studentId].name}` : "Student focus";
  if (item.type === "ATTENDANCE_TREND" && item.courseId) return `Attendance: ${data.courses.find((c) => c.id === item.courseId)?.name ?? "course"}`;
  return "";
}
