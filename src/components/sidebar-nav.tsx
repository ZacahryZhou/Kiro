"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, House, Lightbulb, CalendarRange, GraduationCap, Inbox, LayoutDashboard, Settings, Users, Workflow } from "lucide-react";

export type NavItem = { href: string; label: string; icon: "home" | "knowledge" | "schedule" | "calendar" | "courses" | "learning" | "agent" | "requests" | "students" | "settings"; badge?: number };

const ICONS = { home: House, knowledge: Lightbulb, schedule: CalendarDays, calendar: CalendarRange, courses: BookOpen, learning: GraduationCap, agent: Workflow, requests: Inbox, students: Users, settings: Settings } as const;

function isActive(pathname: string, href: string) {
  // /teacher and /student are home pages; their sibling pages have their own menu entries.
  if (href === "/teacher") return pathname === href;
  if (href === "/student") return pathname === href || pathname.startsWith("/student/courses");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Vertical navigation for large screens. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace navigation" className="space-y-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden />
            {item.label}
            {item.badge ? <span className="ml-auto rounded-full bg-primary-foreground/20 px-1.5 text-xs tabular-nums" aria-label={`${item.badge} pending`}>{item.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Horizontal navigation for small screens. */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace navigation" className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
            {item.badge ? <span className="rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums" aria-label={`${item.badge} pending`}>{item.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
