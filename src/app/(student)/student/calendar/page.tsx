import { MonthCalendar, type CalendarSession } from "@/components/month-calendar";
import { ErrorAlert, PageHeader } from "@/components/page";
import { requireRole } from "@/lib/auth/actor";
import { formatLocalTime, getLocalDateKey, getMonthGrid } from "@/lib/time";
import { getStudentWorkspace } from "@/services/read";

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const actor = await requireRole("STUDENT");
  const params = await searchParams;
  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const grid = getMonthGrid(typeof params.month === "string" ? params.month : undefined);
  const result = await getStudentWorkspace(actor, { from: grid.from.toISOString(), to: grid.to.toISOString() });

  const byDay = new Map<string, CalendarSession[]>();
  if (result.ok) {
    for (const session of result.data.sessions) {
      const start = new Date(session.startAt);
      const key = getLocalDateKey(start, timeZone);
      byDay.set(key, [...(byDay.get(key) ?? []), { id: session.id, time: formatLocalTime(start, timeZone), title: session.courseName, href: `/student/courses/${session.courseId}`, cancelled: session.status === "CANCELLED" }]);
    }
  }
  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Student Workspace" title="Calendar" description={`Your sessions by month, shown in ${timeZone}.`} />
      {result.ok ? <MonthCalendar grid={grid} sessions={byDay} basePath="/student/calendar" /> : <ErrorAlert message={result.error.message} />}
    </section>
  );
}
