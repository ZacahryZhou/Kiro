import type { CourseView, ProgressRecordView, SessionView, StudentRequestView } from "@/contracts";

// Plain data handed from the server page to the dashboard widgets. Every value was read through
// the permission-checked services, so a widget can only show what the signed-in teacher may see.

export type CalendarCell = { key: string; day: number; inMonth: boolean };
export type MonthCalendarData = { label: string; todayKey: string; weeks: CalendarCell[][]; sessions: Record<string, { id: string; time: string; title: string; href: string; cancelled: boolean }[]> };

export type AttendanceSessionStat = { sessionId: string; courseId: string; courseName: string; startAt: string; present: number; leave: number; absent: number };

export type FocusData = {
  studentId: string;
  name: string;
  courses: string[];
  present: number;
  leave: number;
  absent: number;
  /** Present records divided by all marked records, in percent; null when nothing is marked yet. */
  ratePercent: number | null;
  lastProgress?: { goal: string; output: string; nextAction: ProgressRecordView["nextAction"]; courseName: string; sessionStartAt: string };
  nextSession?: { startAt: string; courseName: string; courseId: string };
};

export type DashboardData = {
  timeZone: string;
  todayKey: string;
  weekLabel: string;
  weekSessions: SessionView[];
  requests: StudentRequestView[];
  courses: CourseView[];
  students: { id: string; name: string; courseNames: string[] }[];
  month?: MonthCalendarData;
  attendance: AttendanceSessionStat[];
  progress: ProgressRecordView[];
  focus: Record<string, FocusData>;
  /** Set when a part of the data could not be loaded. */
  notice?: string;
};
