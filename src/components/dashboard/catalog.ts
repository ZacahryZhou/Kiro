import { Activity, BookOpen, CalendarDays, CalendarRange, Clock3, Inbox, NotebookPen, TrendingUp, UserRound, type LucideIcon } from "lucide-react";
import type { DashboardTheme, WidgetType } from "@/contracts";

export type WidgetMeta = { label: string; description: string; icon: LucideIcon; w: number; h: number; minW: number; minH: number };

/** What the editor shows for each widget and the size a new one starts with (12-column grid). */
export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  STATS: { label: "Week at a glance", description: "Sessions, upcoming lessons, students and open requests", icon: Activity, w: 12, h: 2, minW: 4, minH: 2 },
  TODAY_SESSIONS: { label: "Today", description: "Today's lessons, with a link to take attendance", icon: Clock3, w: 5, h: 5, minW: 3, minH: 3 },
  WEEK_SCHEDULE: { label: "This week", description: "Every lesson this week, day by day", icon: CalendarDays, w: 7, h: 6, minW: 4, minH: 3 },
  MONTH_CALENDAR: { label: "Month calendar", description: "A compact calendar of this month", icon: CalendarRange, w: 6, h: 7, minW: 4, minH: 5 },
  PENDING_REQUESTS: { label: "Requests", description: "Leave and reschedule requests waiting for you", icon: Inbox, w: 5, h: 4, minW: 3, minH: 3 },
  STUDENT_FOCUS: { label: "Student focus", description: "One student's attendance, last progress note and next lesson", icon: UserRound, w: 4, h: 5, minW: 3, minH: 4 },
  ATTENDANCE_TREND: { label: "Attendance trend", description: "Attendance by session, computed by code", icon: TrendingUp, w: 6, h: 5, minW: 4, minH: 4 },
  RECENT_PROGRESS: { label: "Recent progress", description: "The latest progress records you saved", icon: NotebookPen, w: 6, h: 5, minW: 4, minH: 3 },
  COURSE_LIST: { label: "My courses", description: "Your courses and how many students each has", icon: BookOpen, w: 6, h: 4, minW: 3, minH: 3 },
};

export const THEME_META: Record<DashboardTheme, { label: string; swatch: [string, string, string] }> = {
  kora: { label: "Kora", swatch: ["oklch(0.97 0.012 250)", "oklch(0.82 0.1 215)", "oklch(0.25 0.03 255)"] },
  ocean: { label: "Ocean", swatch: ["oklch(0.95 0.04 225)", "oklch(0.65 0.12 225)", "oklch(0.45 0.12 235)"] },
  sunset: { label: "Sunset", swatch: ["oklch(0.96 0.04 60)", "oklch(0.75 0.15 45)", "oklch(0.6 0.19 25)"] },
  forest: { label: "Forest", swatch: ["oklch(0.95 0.04 150)", "oklch(0.7 0.11 155)", "oklch(0.45 0.1 160)"] },
  violet: { label: "Violet", swatch: ["oklch(0.95 0.04 300)", "oklch(0.7 0.14 295)", "oklch(0.5 0.18 285)"] },
  midnight: { label: "Midnight", swatch: ["oklch(0.2 0.03 265)", "oklch(0.45 0.1 265)", "oklch(0.82 0.12 215)"] },
};

export const MOTION_LABELS = { calm: "Calm", lively: "Lively", off: "None" } as const;
