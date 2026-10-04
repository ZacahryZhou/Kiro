import { z } from "zod";

// Teacher home-page layouts (contract v0.7, additive). A layout is a list of widgets from a fixed
// catalog plus a colour theme and a motion style. Nothing here can carry HTML or code, so an AI
// proposal can only ever pick from what this file allows.

export const WIDGET_TYPES = [
  "STATS",
  "TODAY_SESSIONS",
  "WEEK_SCHEDULE",
  "MONTH_CALENDAR",
  "PENDING_REQUESTS",
  "STUDENT_FOCUS",
  "ATTENDANCE_TREND",
  "RECENT_PROGRESS",
  "COURSE_LIST",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const DASHBOARD_THEMES = ["kora", "ocean", "sunset", "forest", "violet", "midnight"] as const;
export type DashboardTheme = (typeof DASHBOARD_THEMES)[number];

export const DASHBOARD_MOTIONS = ["calm", "lively", "off"] as const;
export type DashboardMotion = (typeof DASHBOARD_MOTIONS)[number];

export const GRID_COLUMNS = 12;
export const MAX_WIDGETS = 12;
export const MAX_LAYOUTS = 20;

const id = z.string().min(1);

export const DashboardItemSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.enum(WIDGET_TYPES),
    x: z.number().int().min(0).max(GRID_COLUMNS - 1),
    y: z.number().int().min(0).max(200),
    w: z.number().int().min(2).max(GRID_COLUMNS),
    h: z.number().int().min(2).max(14),
    /** Widget options. Only the widgets that use them accept them. */
    courseId: id.optional(),
    studentId: id.optional(),
    title: z.string().trim().min(1).max(60).optional(),
  })
  .refine((item) => item.x + item.w <= GRID_COLUMNS, { message: "A widget cannot extend past the right edge." });
export type DashboardItem = z.infer<typeof DashboardItemSchema>;

export const DashboardLayoutInput = z
  .object({
    name: z.string().trim().min(1, "Enter a layout name.").max(40, "Use at most 40 characters."),
    theme: z.enum(DASHBOARD_THEMES).default("kora"),
    motion: z.enum(DASHBOARD_MOTIONS).default("calm"),
    items: z.array(DashboardItemSchema).min(1, "Add at least one widget.").max(MAX_WIDGETS, `Use at most ${MAX_WIDGETS} widgets.`),
  })
  .superRefine((layout, ctx) => {
    const seen = new Set<string>();
    for (const item of layout.items) {
      if (seen.has(item.id)) ctx.addIssue({ code: "custom", message: `Duplicate widget id ${item.id}.` });
      seen.add(item.id);
      if (item.type === "STUDENT_FOCUS" && !item.studentId) {
        ctx.addIssue({ code: "custom", message: "A student focus widget needs a student." });
      }
    }
  });
export type DashboardLayoutInput = z.infer<typeof DashboardLayoutInput>;

export const ActivateLayoutInput = z.object({ layoutId: id.nullable() });
export type ActivateLayoutInput = z.infer<typeof ActivateLayoutInput>;

export const DeleteLayoutInput = z.object({ layoutId: id });
export type DeleteLayoutInput = z.infer<typeof DeleteLayoutInput>;

export type DashboardLayoutView = {
  id: string;
  name: string;
  theme: DashboardTheme;
  motion: DashboardMotion;
  items: DashboardItem[];
  isActive: boolean;
  updatedAt: string;
};

/** What a teacher sees until they save a layout of their own. */
export const CLASSIC_LAYOUT: Pick<DashboardLayoutInput, "name" | "theme" | "motion" | "items"> = {
  name: "Classic",
  theme: "kora",
  motion: "calm",
  items: [
    { id: "stats", type: "STATS", x: 0, y: 0, w: 12, h: 2 },
    { id: "today", type: "TODAY_SESSIONS", x: 0, y: 2, w: 5, h: 5 },
    { id: "week", type: "WEEK_SCHEDULE", x: 5, y: 2, w: 7, h: 5 },
    { id: "requests", type: "PENDING_REQUESTS", x: 0, y: 7, w: 5, h: 4 },
    { id: "courses", type: "COURSE_LIST", x: 5, y: 7, w: 7, h: 4 },
  ],
};
