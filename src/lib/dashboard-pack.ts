import { GRID_COLUMNS, WIDGET_SIZES, type DashboardItem, type WidgetType } from "@/contracts";

export const WIDGET_WIDTHS = { small: 4, medium: 6, large: 8, full: GRID_COLUMNS } as const;
export type WidgetSizeName = keyof typeof WIDGET_WIDTHS;

export type WidgetRequest = { type: WidgetType; size?: WidgetSizeName; studentId?: string; courseId?: string; title?: string };

/**
 * Places widgets on the 12-column grid in the order given, left to right and top to bottom.
 * Code decides every position and size, so a model (or anyone else) only chooses *which* widgets
 * and roughly how wide; the result can never overlap or run off the grid.
 */
export function packWidgets(requests: WidgetRequest[]): DashboardItem[] {
  const items: DashboardItem[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const counts = new Map<WidgetType, number>();
  for (const request of requests) {
    const base = WIDGET_SIZES[request.type];
    const w = Math.min(GRID_COLUMNS, Math.max(base.minW, request.size ? WIDGET_WIDTHS[request.size] : base.w));
    const h = base.h;
    if (x + w > GRID_COLUMNS) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    const n = (counts.get(request.type) ?? 0) + 1;
    counts.set(request.type, n);
    items.push({
      id: `${request.type.toLowerCase().replace(/_/g, "-")}-${n}`,
      type: request.type,
      x,
      y,
      w,
      h,
      ...(request.studentId ? { studentId: request.studentId } : {}),
      ...(request.courseId ? { courseId: request.courseId } : {}),
      ...(request.title ? { title: request.title } : {}),
    });
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }
  return items;
}
