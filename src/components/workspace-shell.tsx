import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";
import { currentUserCanViewConsole } from "@/lib/ai/trace/viewer";
import { listStudentRequests } from "@/services/read";
import { Brand } from "@/components/brand";
import { Initial } from "@/components/page";
import { MobileNav, SidebarNav, type NavItem } from "@/components/sidebar-nav";
import { Button } from "@/components/ui/button";

const TEACHER_NAV: NavItem[] = [
  { href: "/teacher", label: "Schedule", icon: "schedule" },
  { href: "/teacher/courses", label: "Courses", icon: "courses" },
];
const STUDENT_NAV: NavItem[] = [{ href: "/student", label: "My learning", icon: "learning" }];

/** Sidebar + header frame around every signed-in page. The title is the workspace name. */
export async function WorkspaceShell({ title, role, children }: { title: string; role: "TEACHER" | "STUDENT"; children: ReactNode }) {
  const session = await auth();
  const name = session?.user?.name?.trim() || "Your account";
  const items: NavItem[] = [...(role === "TEACHER" ? TEACHER_NAV : STUDENT_NAV)];
  if (role === "TEACHER") {
    const actor = { userId: session?.user?.id ?? "", role } as const;
    const pending = await listStudentRequests(actor, { status: "PENDING" });
    items.push({ href: "/teacher/requests", label: "Requests", icon: "requests", badge: pending.ok ? pending.data.requests.length : 0 });
  }
  if (await currentUserCanViewConsole()) items.push({ href: "/admin/agent", label: "Agent console", icon: "agent" });
  const roleLabel = role === "TEACHER" ? "Teacher" : "Student";

  return (
    <div className="kora-backdrop min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-card/80 backdrop-blur-md lg:flex">
        <div className="border-b p-5">
          <Brand href={role === "TEACHER" ? "/teacher" : "/student"} tagline={title} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">Workspace</p>
          <SidebarNav items={items} />
        </div>
        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
            <Initial name={name} className="size-8 text-xs" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium" data-testid="account-name">{name}</p>
              <p className="text-[11px] text-muted-foreground">{roleLabel}</p>
            </div>
          </div>
          <form action={logoutAction} className="mt-2">
            <Button type="submit" variant="outline" size="sm" className="w-full justify-start gap-2">
              <LogOut className="size-3.5" aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Brand href={role === "TEACHER" ? "/teacher" : "/student"} tagline={title} />
            <div className="flex items-center gap-2">
              <Initial name={name} className="size-8 text-xs" />
              <form action={logoutAction}>
                <Button type="submit" variant="outline" size="sm">Sign out</Button>
              </form>
            </div>
          </div>
          <MobileNav items={items} />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
