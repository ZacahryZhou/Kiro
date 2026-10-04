import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MonthGrid } from "@/lib/time";

export type CalendarSession = { id: string; time: string; title: string; href: string; cancelled?: boolean };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A read-only month view. Sessions are grouped by local date key; navigation uses ?month=YYYY-MM. */
export function MonthCalendar({ grid, sessions, basePath }: { grid: MonthGrid; sessions: Map<string, CalendarSession[]>; basePath: string }) {
  const nav = "inline-flex size-9 items-center justify-center rounded-lg border bg-card transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight" aria-live="polite">{grid.label}</h2>
        <nav aria-label="Calendar navigation" className="flex items-center gap-2">
          <Link href={`${basePath}?month=${grid.prevKey}`} className={nav} aria-label="Previous month"><ChevronLeft className="size-4" aria-hidden /></Link>
          <Link href={basePath} className="inline-flex h-9 items-center rounded-lg border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted">Today</Link>
          <Link href={`${basePath}?month=${grid.nextKey}`} className={nav} aria-label="Next month"><ChevronRight className="size-4" aria-hidden /></Link>
        </nav>
      </div>
      <div className="kora-card overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {WEEKDAYS.map((day) => <div key={day} className="px-1 py-2">{day}</div>)}
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label={grid.label}>
          {grid.weeks.flat().map((cell) => {
            const items = sessions.get(cell.key) ?? [];
            const today = cell.key === grid.todayKey;
            return (
              <div key={cell.key} role="gridcell" data-testid="calendar-day" data-date={cell.key} className={`min-h-20 border-b border-r p-1.5 text-xs sm:min-h-28 sm:p-2 ${cell.inMonth ? "" : "bg-muted/30 text-muted-foreground"}`}>
                <span className={`inline-flex size-6 items-center justify-center rounded-full font-medium ${today ? "bg-primary text-primary-foreground" : ""}`}>{cell.day}</span>
                {items.length > 0 && <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] sm:hidden">{items.length}</span>}
                <ul className="mt-1 hidden space-y-1 sm:block">
                  {items.slice(0, 3).map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} className={`block truncate rounded-md bg-primary/10 px-1.5 py-0.5 transition-colors hover:bg-primary/20 ${item.cancelled ? "line-through opacity-60" : ""}`}>
                        <span className="font-medium tabular-nums">{item.time}</span> {item.title}
                      </Link>
                    </li>
                  ))}
                  {items.length > 3 && <li className="px-1.5 text-muted-foreground">+{items.length - 3} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
