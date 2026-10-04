import type { DashboardItem, WidgetType } from "@/contracts";
import type { Actor } from "@/lib/auth/actor";
import type { AttendanceSessionStat, DashboardData, FocusData, MonthCalendarData } from "@/components/dashboard/types";
import { formatLocalDate, formatLocalTime, getLocalDateKey, getMonthGrid, getWeekRange } from "@/lib/time";
import { loadRoster } from "@/lib/teacher-students";
import { listAttendance, listMyCourses, listProgressRecords, listStudentRequests, getTeacherSchedule } from "@/services/read";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Reads what the chosen widgets need through the permission-checked services. Cheap data (this
 * week, courses, students, pending requests) is always loaded; heavier data only when a widget uses it.
 */
export async function loadDashboardData(actor: Actor, items: DashboardItem[], timeZone: string, now = new Date()): Promise<DashboardData> {
  const wants = (type: WidgetType) => items.some((item) => item.type === type);
  const notices: string[] = [];

  const { from, to } = getWeekRange(0, now, timeZone);
  const lastDay = new Date(to.getTime() - 1);
  const weekLabel = `${formatLocalDate(from, timeZone)} – ${new Intl.DateTimeFormat("en-US", { timeZone, month: "long", day: "numeric" }).format(lastDay)}`;
  const week = await getTeacherSchedule(actor, { from: from.toISOString(), to: to.toISOString() });
  if (!week.ok) notices.push(week.error.message);

  const [courses, requests, roster] = await Promise.all([listMyCourses(actor), listStudentRequests(actor, { status: "PENDING" }), loadRoster(actor)]);
  if (!courses.ok) notices.push(courses.error.message);
  if (!requests.ok) notices.push(requests.error.message);
  if (!roster.ok) notices.push(roster.message);

  let month: MonthCalendarData | undefined;
  if (wants("MONTH_CALENDAR")) {
    const grid = getMonthGrid(undefined, now, timeZone);
    const result = await getTeacherSchedule(actor, { from: grid.from.toISOString(), to: grid.to.toISOString() });
    const sessions: MonthCalendarData["sessions"] = {};
    if (result.ok) {
      for (const session of result.data.sessions) {
        const start = new Date(session.startAt);
        const key = getLocalDateKey(start, timeZone);
        (sessions[key] ??= []).push({ id: session.id, time: formatLocalTime(start, timeZone), title: session.courseName, href: `/teacher/courses/${session.courseId}`, cancelled: session.status === "CANCELLED" });
      }
    } else notices.push(result.error.message);
    month = { label: grid.label, todayKey: grid.todayKey, weeks: grid.weeks, sessions };
  }

  const courseList = courses.ok ? courses.data.courses : [];
  const students = roster.ok ? roster.students : [];

  // Attendance per session over the last 90 days: used by the trend widget and the student focus card.
  const attendance: AttendanceSessionStat[] = [];
  if (wants("ATTENDANCE_TREND")) {
    const records = await listAttendance(actor, { from: new Date(now.getTime() - 90 * DAY).toISOString(), to: new Date(now.getTime() + DAY).toISOString() });
    if (records.ok) {
      const names = new Map(courseList.map((course) => [course.id, course.name]));
      const bySession = new Map<string, AttendanceSessionStat>();
      for (const record of records.data.records) {
        const stat = bySession.get(record.sessionId) ?? { sessionId: record.sessionId, courseId: record.courseId, courseName: names.get(record.courseId) ?? "Course", startAt: record.sessionStartAt, present: 0, leave: 0, absent: 0 };
        if (record.status === "PRESENT") stat.present += 1;
        else if (record.status === "LEAVE") stat.leave += 1;
        else stat.absent += 1;
        bySession.set(record.sessionId, stat);
      }
      attendance.push(...[...bySession.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)));
    } else notices.push(records.error.message);
  }

  let progress: DashboardData["progress"] = [];
  if (wants("RECENT_PROGRESS")) {
    const result = await listProgressRecords(actor, {});
    if (result.ok) progress = [...result.data.records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
    else notices.push(result.error.message);
  }

  const focus: Record<string, FocusData> = {};
  const focusIds = [...new Set(items.filter((item) => item.type === "STUDENT_FOCUS" && item.studentId).map((item) => item.studentId as string))];
  if (focusIds.length > 0) {
    const upcoming = await getTeacherSchedule(actor, { from: now.toISOString(), to: new Date(now.getTime() + 45 * DAY).toISOString() });
    for (const studentId of focusIds) {
      const student = students.find((entry) => entry.id === studentId);
      if (!student) continue; // no longer in this teacher's courses: the widget shows an empty state
      const [marks, records] = await Promise.all([listAttendance(actor, { studentId }), listProgressRecords(actor, { studentId })]);
      let present = 0;
      let leave = 0;
      let absent = 0;
      if (marks.ok) {
        for (const mark of marks.data.records) {
          if (mark.status === "PRESENT") present += 1;
          else if (mark.status === "LEAVE") leave += 1;
          else absent += 1;
        }
      }
      const total = present + leave + absent;
      const latest = records.ok ? [...records.data.records].sort((a, b) => b.sessionStartAt.localeCompare(a.sessionStartAt))[0] : undefined;
      const courseIds = new Set(student.courses.map((course) => course.id));
      const next = upcoming.ok ? upcoming.data.sessions.find((session) => courseIds.has(session.courseId) && (session.status === "SCHEDULED" || session.status === "RESCHEDULED")) : undefined;
      focus[studentId] = {
        studentId,
        name: student.name,
        courses: student.courses.map((course) => course.name),
        present,
        leave,
        absent,
        ratePercent: total === 0 ? null : Math.round((present / total) * 100),
        ...(latest ? { lastProgress: { goal: latest.goal, output: latest.output, nextAction: latest.nextAction, courseName: latest.courseName, sessionStartAt: latest.sessionStartAt } } : {}),
        ...(next ? { nextSession: { startAt: next.startAt, courseName: next.courseName, courseId: next.courseId } } : {}),
      };
    }
  }

  return {
    timeZone,
    todayKey: getLocalDateKey(now, timeZone),
    weekLabel,
    weekSessions: week.ok ? week.data.sessions : [],
    requests: requests.ok ? requests.data.requests : [],
    courses: courseList,
    students: students.map((student) => ({ id: student.id, name: student.name, courseNames: student.courses.map((course) => course.name) })),
    ...(month ? { month } : {}),
    attendance,
    progress,
    focus,
    ...(notices.length > 0 ? { notice: notices[0] } : {}),
  };
}
